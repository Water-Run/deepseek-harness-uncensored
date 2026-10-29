/** Actual browser MCP processes and mandatory lease withdrawal. @module */
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness, provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionResources } from '@deepseek-ai/dsh-experimental-browser-use-runtime'
import { mountSessionMcp } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import * as Stagehand from '@deepseek-ai/dsh-experimental-browser-use-stagehand-native'
import { HarnessError, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import Protection from '../src/index.ts'
import TargetBrowserUse from '../src/browser.ts'

const mcpFixture = fileURLToPath(new URL('../../../experimental/browser-use-runtime/tests/mcp-fixture.mjs', import.meta.url))
async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-browser-protection-')), ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await mountAgentLoopTestDependencies(ctx)
  provideWorkingDirectoryFixture(ctx, root)
  const owner = await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  await ctx.plugin(TargetBrowserUse)
  const runtime = await mountAgentLoopTestHarness(ctx)
  const configure = async (mainlandEnabled: boolean) => {
    const before = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure({ mainlandEnabled, rules: [] }, before.revision)
  }
  const mount = () => ctx.plugin({
    inject: ['browserUse', 'agents', 'tools', 'systemPrompt', 'workingDirectory'],
    apply(inner: Context) {
      mountSessionMcp(inner, { name: 'browser-fixture', exclusive: true, command: process.execPath, args: [mcpFixture, root] })
    },
  })
  return { ctx, root, owner, runtime, configure, mount }
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error }
}

it('refuses MCP browser startup before its discovery process is allocated', async () => {
  const h = await harness()
  await h.mount()
  const outcome = await h.runtime.create(SessionId('blocked-browser')).then(() => 'started', (error: unknown) => {
    if (error instanceof HarnessError) return error.code
    throw error
  })
  expect(outcome).toBe('TARGET_EXECUTION_UNCONFINED')
  await expect(readFile(join(h.root, 'events.ndjson'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('closes actual MCP browsers and withdraws scoped tools after protection activates', async () => {
  const h = await harness()
  const clients: McpClient.McpClientLifetime[] = []
  const create = McpClient.createMcpClient
  const capture = vi.spyOn(McpClient, 'createMcpClient').mockImplementation((...args) => {
    const client = create(...args); clients.push(client); return client
  })
  onTestFinished(() => { capture.mockRestore() })
  await h.configure(false); await h.mount()
  const agent = await h.runtime.create(SessionId('allowed-browser'))
  const call = () => h.ctx.tools.execute({ agent, name: 'mcp__browser-fixture__visit', arguments: { label: 'owned' },
    callId: ToolCallId('visit'), signal: new AbortController().signal })
  expect((await call()).isError).toBe(false)
  const events = z.array(z.object({ event: z.string(), pid: z.number().int() })).parse(
    (await readFile(join(h.root, 'events.ndjson'), 'utf8')).trim().split('\n').map((line): unknown => JSON.parse(line)))
  const pids = events.filter(event => event.event === 'start').map(event => event.pid)
  expect(pids.length).toBeGreaterThanOrEqual(1)
  expect(clients).toHaveLength(1)
  const physicallyClosed = clients[0]!.whenClosed()
  await h.configure(true)
  await h.owner.dispose()
  await physicallyClosed
  expect(pids.map(alive)).toEqual(pids.map(() => false))
  expect(h.ctx.get('browserUse')).toBeUndefined()
  expect((await call()).isError).toBe(true)
})

it('retains the rule owner through native closure and prevents queued browser calls', async () => {
  const h = await harness(); await h.configure(false)
  const agent = await h.runtime.create(SessionId('queued-browser'))
  const entered: PromiseWithResolvers<void> = Promise.withResolvers()
  const closing: PromiseWithResolvers<void> = Promise.withResolvers()
  const closed: PromiseWithResolvers<void> = Promise.withResolvers()
  const original = h.ctx.targetProtection.retainExecution.bind(h.ctx.targetProtection)
  let released = false
  const spy = vi.spyOn(h.ctx.targetProtection, 'retainExecution').mockImplementation(() => {
    const release = original()
    return () => { released = true; release() }
  })
  const resources = new SessionResources(h.ctx, { label: 'owned browser', exclusive: true,
    acquireExecution: () => h.ctx.browserUse.acquireExecution(),
    open: async () => ({ value: {}, async close() { closing.resolve(); await closed.promise } }),
  })
  onTestFinished(async () => { closed.resolve(); spy.mockRestore(); await resources.dispose() })
  const operation = resources.run(agent, new AbortController().signal, async () => { entered.resolve(); await closed.promise })
  const outcome = operation.catch((error: unknown) => error)
  await entered.promise
  const queuedCall = vi.fn(async () => true)
  const queued = resources.run(agent, new AbortController().signal, queuedCall).catch((error: unknown) => error)
  await h.configure(true)
  await closing.promise
  const signal = h.ctx.targetProtection.executionSignal()
  const ownerStarted: Promise<void> = new Promise((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
  let disposed = false
  const disposal = h.owner.dispose().then(() => { disposed = true })
  await ownerStarted
  expect(released).toBe(false); expect(disposed).toBe(false)
  closed.resolve()
  expect(await outcome).toBeInstanceOf(Error)
  expect(await queued).toBeInstanceOf(Error)
  await disposal
  expect(released).toBe(true); expect(queuedCall).not.toHaveBeenCalled()
})

it.each(['launch', 'attach'] as const)('refuses native Stagehand %s before Chromium or CDP allocation', async (mode) => {
  const h = await harness()
  let connections = 0
  const server = createServer((_request, response) => { response.writeHead(404).end() })
  server.on('connection', () => { connections++ })
  onTestFinished(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => { server.close(() => { resolve() }) }) })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing owned CDP listener')
  await h.ctx.plugin(Stagehand, { mode, model: { modelName: 'openai/gpt-4.1-mini', apiKey: 'unused-fixture-key' },
    ...mode === 'launch' ? { executablePath: process.execPath } : { cdpEndpoint: `http://127.0.0.1:${String(address.port)}` },
  })
  const agent = await h.runtime.create(SessionId(`stagehand-${mode}`))
  const result = await h.ctx.tools.execute({ agent, name: 'stagehand_tabs', arguments: { action: 'list' },
    callId: ToolCallId('tabs'), signal: new AbortController().signal })
  expect(result).toMatchObject({ isError: true, error: { info: { code: 'TARGET_EXECUTION_UNCONFINED' } } })
  expect(connections).toBe(0)
})

it('rejects cached browser execution after its mandatory policy owner disappears', async () => {
  const h = await harness(); await h.configure(false)
  const cached = h.ctx.browserUse
  const lease = cached.acquireExecution()
  if (lease === undefined) throw new Error('Guarded browser did not return its execution lease')
  onTestFinished(() => { lease.release() })
  const aborted: Promise<void> = new Promise((resolve) => { lease.signal.addEventListener('abort', () => { resolve() }, { once: true }) })
  const disposal = h.owner.dispose()
  await aborted
  expect(lease.signal.aborted).toBe(true)
  expect(() => cached.acquireExecution()).toThrow()
  lease.release()
  await disposal
})

it.each(['startup', 'close'] as const)('retains MCP browser permission through an unconfirmed %s result and late closure', async (phase) => {
  const h = await harness()
  const ack: PromiseWithResolvers<void> = Promise.withResolvers()
  const observing: PromiseWithResolvers<void> = Promise.withResolvers()
  const create = McpClient.createMcpClient
  const clients: McpClient.McpClientLifetime[] = []
  const retain = h.ctx.targetProtection.retainExecution.bind(h.ctx.targetProtection)
  let released = false
  const retention = vi.spyOn(h.ctx.targetProtection, 'retainExecution').mockImplementation(() => {
    const release = retain()
    return () => { released = true; release() }
  })
  const capture = vi.spyOn(McpClient, 'createMcpClient').mockImplementation((...args) => {
    const client = create(...args); clients.push(client)
    return {
      ready: phase === 'startup' ? client.ready.then(() => { throw new Error('Owned startup observation failed') }) : client.ready,
      async close() { await client.close(); throw new Error('Owned close confirmation is delayed') },
      whenClosed() { observing.resolve(); return ack.promise },
    }
  })
  onTestFinished(async () => {
    await Promise.all(clients.map(client => client.close()))
    ack.resolve(); capture.mockRestore(); retention.mockRestore()
  })
  await h.configure(false); await h.mount()
  if (phase === 'startup') {
    const outcome = h.runtime.create(SessionId('unconfirmed-startup')).catch((error: unknown) => error)
    await observing.promise
    expect(await outcome).toMatchObject({ code: 'BROWSER_SHUTDOWN_UNCONFIRMED' })
  } else {
    await h.runtime.create(SessionId('unconfirmed-close'))
    await h.configure(true)
    await observing.promise
  }
  expect(released).toBe(false)
  ack.resolve()
  await vi.waitFor(() => { expect(released).toBe(true) })
  await h.owner.dispose()
})
