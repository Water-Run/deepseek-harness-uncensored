/** Real Frida tools operate only on a caller-built copy of fixtures/frida-target.c. @module */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { expect, it } from 'vitest'
import ReaService from '../src/index.ts'
import * as ReaAgent from '../src/agent.ts'

const nodePath = process.env['DSH_REA_TEST_NODE']
const cliPath = process.env['DSH_REA_TEST_CLI']
const targetPath = process.env['DSH_REA_TEST_FRIDA_TARGET']
const enabled = nodePath !== undefined && targetPath !== undefined
const toolNames = ['start_frida_session', 'load_frida_script', 'unload_frida_script',
  'resume_frida_session', 'frida_session_status', 'close_frida_session']
// Resolve the owned ELF fixture from its symbol table while spawn is paused.
const hook = `
const target = Process.platform === 'windows'
  ? Process.mainModule.getExportByName('dshu_frida_value')
  : Process.mainModule.getSymbolByName('dshu_frida_value');
Interceptor.attach(target, { onLeave(value) { value.replace(99); } });
send({ marker: 'dshu-frida-hook', pid: Process.id });
`

function record(value: JsonValue | undefined): { [key: string]: JsonValue } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a structured REA result')
  return value
}

async function deadline<T>(operation: Promise<T>, milliseconds = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new Error('Owned Frida fixture did not settle')) }, milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

async function harness() {
  if (nodePath === undefined || targetPath === undefined) throw new Error('REA Node and an owned Frida fixture are required')
  const cwd = await mkdtemp(join(tmpdir(), 'dshu-frida-product-'))
  const binary = join(cwd, process.platform === 'win32' ? 'frida-target.exe' : 'frida-target')
  const ctx = new Context()
  const dispose = async () => {
    await ctx.fiber.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
  try {
    await copyFile(targetPath, binary)
    await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
    await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: cwd })
    await ctx.plugin(ReaService, { enabled: true, nodePath, ...cliPath === undefined ? {} : { cliPath } })
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(ReaAgent)
    const agent = await ctx.agentLoop.create(SessionId('rea-frida-real'), {}, { cwd })
    let ordinal = 0
    const call = async (name: string, args: JsonValue) => {
      const result = await executeToolFixture(ctx, { name, arguments: args, agent,
        signal: AbortSignal.timeout(60_000), callId: ToolCallId(`frida-${String(++ordinal)}`) })
      if (result.isError) throw new Error(JSON.stringify(result))
      const value = record(result.value)
      return name === 'rea_tools' ? value : record(value['structuredContent'])
    }
    await call('rea_tools', { names: toolNames })
    return { ctx, cwd, binary, agent, call, dispose }
  } catch (error) {
    try { await dispose() }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'REA fixture initialization and cleanup failed') }
    throw error
  }
}

it.skipIf(!enabled || (process.platform !== 'win32' && process.platform !== 'linux'))('restores an owned local function after script unload, session close and REA reset', { timeout: 180_000, retry: 0 }, async () => {
  const h = await harness()
  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(h.binary, process.platform === 'linux' ? ['--allow-parent-debugger'] : [], {
      cwd: h.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    try { await h.dispose() }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Owned target startup and cleanup failed') }
    throw error
  }
  const exited = new Promise<[number | null, NodeJS.Signals | null]>((resolve) => {
    child.once('close', (code, signal) => { resolve([code, signal]) })
  })
  let spawnError: Error | undefined
  child.on('error', (error) => { spawnError = error })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  const lines = createInterface({ input: child.stdout })
  const iterator = lines[Symbol.asyncIterator]()
  const next = async () => {
    const line = await deadline(Promise.race([iterator.next(), exited.then(() => { throw new Error(`Owned target exited: ${spawnError?.message ?? stderr}`) })]))
    if (line.done) throw new Error(`Owned target closed stdout: ${spawnError?.message ?? stderr}`)
    return line.value
  }
  const read = async () => { const pending = next(); child.stdin.write('read\n'); return await pending }
  const attach = async () => {
    const started = await h.call('mcp__rea__start_frida_session', { mode: 'attach', device_id: 'local', pid: child.pid! })
    expect(started).toMatchObject({ mode: 'attach', pid: child.pid, state: 'running' })
    return started['session_id']!
  }
  const instrument = async (session: JsonValue) => {
    const loaded = record((await h.call('mcp__rea__load_frida_script', { session_id: session, source_kind: 'inline', source: hook }))['normalized_result'])
    expect(loaded['messages']).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'send', payload: { marker: 'dshu-frida-hook', pid: child.pid },
    })]))
    expect(await read()).toBe('99')
    return loaded['script_id']!
  }
  let primaryError: unknown
  try {
    if (process.platform === 'linux') expect(await next()).toBe(`DSHU_FRIDA_PARENT_DEBUGGER ${String(process.pid)}`)
    expect(await next()).toBe('DSHU_FRIDA_TARGET_V1')
    expect(await read()).toBe('42')
    const session = await attach()
    const script = await instrument(session)
    await h.call('mcp__rea__unload_frida_script', { session_id: session, script_id: script })
    expect(await read()).toBe('42')
    expect(record((await h.call('mcp__rea__frida_session_status', { session_id: session }))['normalized_result'])['scripts']).toEqual([])
    await instrument(session)
    await h.call('mcp__rea__close_frida_session', { session_id: session })
    expect(await read()).toBe('42')
    await instrument(await attach())
    await h.call('rea_tools', { reset: true })
    expect(await read()).toBe('42')
    expect(h.ctx.tools.schemas(h.agent).some(tool => tool.name.startsWith('mcp__rea__'))).toBe(false)
    await h.call('rea_tools', { names: toolNames })
    await instrument(await attach())
    await h.ctx.fiber.dispose()
    expect(await read()).toBe('42')
    child.stdin.end('stop\n')
    expect(await deadline(exited)).toEqual([0, null])
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    try { await h.ctx.fiber.dispose() }
    finally {
      try {
        if (child.exitCode === null && child.signalCode === null) child.kill()
        await exited
      } finally {
        lines.close()
        try { await h.dispose() }
        catch (error) {
          if (primaryError !== undefined) throw new AggregateError([primaryError, error], 'Frida acceptance and fixture cleanup failed')
          throw error
        }
      }
    }
  }
})

it.skipIf(!enabled)('instruments an owned paused target before resuming it and releases an unresumed target on close', { timeout: 180_000, retry: 0 }, async () => {
  const h = await harness()
  const spawned: number[] = []
  const waitForExit = async (pid: number) => {
    await expect.poll(() => {
      try { process.kill(pid, 0); return false }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return true
        throw error
      }
    }, { timeout: 10_000 }).toBe(true)
  }
  try {
    for (const [index, instrumented] of [true, false, false, false].entries()) {
      const marker = join(h.cwd, `${instrumented ? 'hooked' : 'closed'}-${String(index)}.txt`)
      const started = await h.call('mcp__rea__start_frida_session', { mode: 'spawn', device_id: 'local', program: h.binary, argv: ['--marker', marker] })
      expect(started).toMatchObject({ mode: 'spawn', state: 'paused' })
      const pid = started['pid']
      if (typeof pid !== 'number') throw new Error('Frida omitted the owned target PID')
      spawned.push(pid)
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      const session = started['session_id']!
      if (instrumented) {
        const loaded = record((await h.call('mcp__rea__load_frida_script', { session_id: session, source_kind: 'inline', source: hook }))['normalized_result'])
        expect(loaded['messages']).toEqual(expect.arrayContaining([expect.objectContaining({
          type: 'send', payload: { marker: 'dshu-frida-hook', pid: started['pid'] },
        })]))
        await h.call('mcp__rea__resume_frida_session', { session_id: session })
        await expect.poll(() => readFile(marker, 'utf8'), { timeout: 10_000 }).toBe('99\n')
        await expect.poll(async () => record((await h.call('mcp__rea__frida_session_status', { session_id: session }))['normalized_result'])['state']).toBe('detached')
      }
      await h.call('mcp__rea__close_frida_session', { session_id: session })
      await expect.poll(() => readFile(marker, 'utf8'), { timeout: 10_000 }).toBe(instrumented ? '99\n' : '42\n')
    }
  } finally {
    await h.ctx.fiber.dispose()
    await Promise.all(spawned.map(waitForExit))
    await h.dispose()
  }
})
