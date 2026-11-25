/** Owned-process behavior through the real tool registry and Agent composition. @module */
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import ReaService, { Config } from '../src/index.ts'
import * as ReaAgent from '../src/agent.ts'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function harness(enabled = true, mode: 'read-only' | 'danger-full-access' = 'danger-full-access') {
  const cwd = await mkdtemp(join(tmpdir(), 'dshu-rea-test-')); roots.push(cwd)
  const ctx = new Context(); contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(SandboxPolicy, { mode, workspaceRoot: cwd })
  await ctx.plugin(ReaService, { enabled, nodePath: process.execPath, cliPath: fileURLToPath(new URL('./fixtures/rea.mjs', import.meta.url)) })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(ReaAgent)
  const agent = await ctx.agentLoop.create(SessionId('rea-owner'), { provider: 'mock', model: 'mock' }, { cwd })
  let ordinal = 0
  const call = (name: string, args: unknown, owner = agent, signal = new AbortController().signal) => executeToolFixture(ctx, {
    name, arguments: args, agent: owner, signal, callId: ToolCallId(`rea-test-${String(++ordinal)}`),
  })
  return { ctx, agent, cwd, call }
}

it('offers read-only format and architecture identification on the first step without starting an engine', async () => {
  const { ctx, agent } = await harness(true, 'read-only')
  const connect = vi.spyOn(ctx.rea, 'connect')
  const signal = new AbortController().signal
  const tools = await ctx.tools.resolve({ agent, signal, modelSelection: { provider: 'mock', model: 'mock' } })
  try {
    const firstPrompt = await ctx.systemPrompt.assemble({ scope: agent })
    expect(firstPrompt.sections.find(section => section.name === 'rea:file-identification')?.text).toContain('rea_identify_header')
    const definition = tools.view(agent).get('rea_identify_header')
    expect(definition?.description).toContain('file format')
    const read = (hex: string) => {
      agent.session.append('user/message', createUserMessage({ source: { kind: 'user' },
        content: [{ type: 'text', text: '这段文件头是什么格式，面向哪种 CPU 架构？\n' + hex }] }), { surfaceOp: 'append' })
      return executeToolFixture(ctx, {
        name: 'rea_identify_header', arguments: {}, agent, signal, toolSet: tools, callId: ToolCallId('header'),
      })
    }
    const elf = Buffer.alloc(64)
    elf.set([127, 69, 76, 70, 2, 1, 1]); elf.writeUInt16LE(183, 18); elf.writeUInt32LE(1, 20); elf.writeUInt16LE(64, 52)
    const identified = await read(elf.toString('hex'))
    await expect(JSON.stringify(identified, null, 2)).toMatchFileSnapshot('./expected/file-header.json')
    const pe = Buffer.alloc(88)
    pe.write('MZ'); pe.writeUInt32LE(64, 60); pe.write('PE', 64); pe.writeUInt16LE(0x8664, 68)
    expect(JSON.stringify(await read(pe.toString('hex')))).toContain('x86_64')
    expect(JSON.stringify(await read('00 11'))).toContain('"format":null')
    for (const hex of ['abc', 'xyz0', '00 11\n\n22 33', '00'.repeat(4097), '7f454c46', '4d5a', pe.subarray(0, 64).toString('hex'), pe.subarray(0, 68).toString('hex')]) {
      expect((await read(hex)).isError).toBe(true)
    }
    expect(connect).not.toHaveBeenCalled()
  } finally { tools.dispose() }
})

it('omits header identification from the model request when REA is disabled', async () => {
  const { ctx, agent } = await harness(false)
  const tools = await ctx.tools.resolve({ agent, signal: new AbortController().signal, modelSelection: { provider: 'mock', model: 'mock' } })
  try {
    expect(tools.view(agent).has('rea_identify_header')).toBe(false)
    const prompt = await ctx.systemPrompt.assemble({ scope: agent })
    expect(prompt.sections.some(section => section.text.includes('rea_identify_header'))).toBe(false)
  } finally { tools.dispose() }
})

it('discovers lazily, validates selected tool arguments and keeps analysis state separate', async () => {
  const { ctx, agent, cwd, call } = await harness()
  expect(ctx.tools.schemas(agent).some(tool => tool.name.startsWith('mcp__rea__'))).toBe(false)
  const discovered = await call('rea_tools', { names: ['set_target', 'read_target'] })
  expect(discovered.isError, JSON.stringify(discovered)).toBe(false)
  await expect(JSON.stringify(discovered, null, 2)).toMatchFileSnapshot('./expected/discovery.json')
  expect(JSON.stringify(discovered)).toContain('1.0.0')
  expect((await call('mcp__rea__set_target', { target: 'alpha' })).isError).toBe(false)
  expect((await call('mcp__rea__set_target', { target: 12 })).isError).toBe(true)
  expect(JSON.stringify(await call('mcp__rea__read_target', {}))).toContain('alpha')
  const other = await ctx.agentLoop.create(SessionId('rea-other'), { provider: 'mock', model: 'mock' }, { cwd })
  expect(ctx.tools.schemas(other).some(tool => tool.name.startsWith('mcp__rea__'))).toBe(false)
  await call('rea_tools', { names: ['read_target'] }, other)
  expect(JSON.stringify(await call('mcp__rea__read_target', {}, other))).not.toContain('alpha')
  await call('rea_tools', { reset: true })
  expect(ctx.tools.schemas(agent).some(tool => tool.name.startsWith('mcp__rea__'))).toBe(false)
})

it.each([['disabled', false, 'danger-full-access'], ['read only', true, 'read-only']] as const)(
  'does not start external tools when %s', async (_label, enabled, mode) => {
    const { ctx, agent, call } = await harness(enabled, mode)
    const result = await call('rea_tools', { names: ['read_target'] })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain(enabled ? 'require full access' : 'REA is disabled')
    expect(ctx.tools.schemas(agent).some(tool => tool.name.startsWith('mcp__rea__'))).toBe(false)
  },
)

it('cancels an unresponsive call and closes the owning process on unload', async () => {
  const { ctx, cwd, call } = await harness()
  expect((await call('rea_tools', { names: ['wait_forever'] })).isError).toBe(false)
  const abort = new AbortController()
  const result = call('mcp__rea__wait_forever', {}, undefined, abort.signal)
  await expect.poll(() => readFile(join(cwd, 'wait-started'), 'utf8')).toBe('1')
  abort.abort(new Error('test canceled'))
  expect((await result).isError).toBe(true)
  await ctx.fiber.dispose()
})

it('rechecks permissions after the external tools were enabled', async () => {
  const { agent, call } = await harness()
  expect((await call('rea_tools', { names: ['set_target'] })).isError).toBe(false)
  agent.session.append('sandbox/mode', { mode: 'read-only' })
  const denied = await call('mcp__rea__set_target', { target: 'blocked' })
  expect(denied.isError).toBe(true)
  expect(JSON.stringify(denied)).toContain('require full access')
})

it('closes a live process when settings disable the integration', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dshu-rea-settings-')); roots.push(cwd)
  const ctx = new Context(); contexts.push(ctx)
  let enabled = true
  const config = Config({ nodePath: process.execPath, cliPath: fileURLToPath(new URL('./fixtures/rea.mjs', import.meta.url)) })
  const service = new ReaService(ctx, { ...config, enabled: { get: () => enabled } })
  const owned = await service.connect(cwd, new AbortController().signal)
  expect(owned.connection.tools()).toHaveLength(3)
  enabled = false
  ctx.emit('loader/volatile-update', [['enabled']])
  await expect(service.connect(cwd, new AbortController().signal)).rejects.toThrow('REA is disabled')
  expect(() => owned.connection.tools()).toThrow()
  await owned.dispose()
})
