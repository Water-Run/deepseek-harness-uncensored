/** Admission attribution through concurrent production AgentLoop drivers and durable Sessions. @module */
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { LlmAdapter, ToolCallId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { mkdtemp, rm } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import Protection from '../src/index.ts'
import { TargetAuditStore } from '../src/audit.ts'
import * as FileIdentity from '../src/file-identity.ts'

class AuditAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.messages.some(message => message.role === 'tool')) {
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const call = { type: 'tool-call' as const, id: ToolCallId('audit-call'), name: 'inspect_target', arguments: '{}' }
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id: call.id, name: call.name, argumentsDelta: '{}' }
    yield { type: 'block-end', index: 0, block: call }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}

it('attributes overlapping main, side, btw and subagent work to their own Sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-audit-session-')), ctx = new Context()
  const entered = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  onTestFinished(async () => {
    release.resolve(true)
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  const owner = await ctx.plugin(Protection, { path: ':memory:', auditPath: join(root, 'audit.sqlite'), hostsFile: '' })
  await mountAgentLoopTestHarness(ctx)
  ctx.llm.registerAdapter(['audit-fixture'], new AuditAdapter())
  let active = 0
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'inspect_target', description: 'Inspect the owned fixture target.', parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) {
      expect(ctx.agents.currentInitiator()).toBe(exec.agent)
      if (++active === 4) entered.resolve(true)
      await release.promise
      const admission = await ctx.targetProtection.checkLocalFile(join(root, 'inspected'), 'metadata', exec.signal)
      return { allowed: admission.decision.allowed }
    },
  })))
  const options = { provider: 'audit-fixture', model: 'audit-fixture' }
  const main = await ctx.agents.create({ sessionId: SessionId('audit-main'), agentOptions: options })
  const side = await ctx.agents.create({ sessionId: SessionId(`session-side-${createHash('sha256').update(main.agent.id).digest('hex')}`),
    meta: { parentSession: main.agent.id }, agentOptions: options })
  const btw = await ctx.agents.create({ sessionId: SessionId(`session-btw-${randomUUID()}`),
    meta: { parentSession: main.agent.id }, agentOptions: options })
  const child = await ctx.agents.create({ sessionId: SessionId('audit-child'),
    meta: { parentSession: main.agent.id, origin: 'subagent', delegationDepth: 1 }, agentOptions: options })
  const agents = [main.agent, side.agent, btw.agent, child.agent]
  const finished = agents.map(agent => new Promise<void>((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') { dispose(); resolve() }
    })
  }))
  for (const agent of agents) agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Inspect it.' }] }))
  await entered.promise
  expect(ctx.targetProtection.auditHistory().entries).toEqual([])
  release.resolve(true)
  await Promise.all(finished)
  const stored = ctx.targetProtection.auditHistory().entries
  expect(stored).toHaveLength(4)
  await ctx.sessionPersistence.flush()
  for (const agent of agents) {
    const records = agent.session.snapshotEvents().filter(event => event.type === 'target/admission')
    expect(records).toHaveLength(1)
    expect(records[0]?.data).toEqual(stored.find(entry => entry.source?.sessionId === agent.id))
    expect(records[0]?.data.source).toEqual({ sessionId: agent.id,
      ...agent === main.agent ? {} : { parentSessionId: main.agent.id } })
    expect(agent.session.deriveMessages().some(message => JSON.stringify(message).includes('target/admission'))).toBe(false)
    const reader = await ctx.sessionPersistence.open(agent.id, 'read')
    try {
      const disk = await reader.read()
      const restored = Session.create(agent.id, disk.events)
      expect(restored.snapshotEvents().filter(event => event.type === 'target/admission')).toEqual(records)
    } finally { await reader.close() }
  }
  await ctx.targetProtection.checkLocalFile(join(root, 'agentless'), 'metadata', new AbortController().signal)
  expect(ctx.targetProtection.auditHistory().entries[0]).not.toHaveProperty('source')
  const beforeRestart = ctx.targetProtection.auditHistory()
  await owner.dispose()
  await ctx.plugin(Protection, { path: ':memory:', auditPath: join(root, 'audit.sqlite'), hostsFile: '' })
  expect(ctx.targetProtection.auditHistory()).toEqual(beforeRestart)
})

it('stops new allowed work when the initiating Session cannot accept its audit record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-audit-failure-')), ctx = new Context()
  onTestFinished(async () => {
    vi.restoreAllMocks()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Protection, { path: ':memory:', auditPath: join(root, 'audit.sqlite'), hostsFile: '' })
  const runtime = await mountAgentLoopTestHarness(ctx)
  const agent = await runtime.create(SessionId('audit-unwritable-session'))
  vi.spyOn(agent.session, 'append').mockImplementation(() => { throw new Error('Session log unavailable') })
  await expect(ctx.agents.withInitiator(agent, () => ctx.targetProtection.checkLocalFile(join(root, 'unpublished'), 'metadata',
    new AbortController().signal))).rejects.toMatchObject({ code: 'unavailable' })
  expect(ctx.targetProtection.auditHistory()).toMatchObject({ state: 'unavailable', entries: [{ source: { sessionId: agent.id } }] })
  await expect(ctx.targetProtection.checkLocalFile(join(root, 'unpublished'), 'metadata', new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
})

it('records an admitted check cancellation before closing its audit store during withdrawal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-audit-withdrawal-')), ctx = new Context()
  const entered = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  onTestFinished(async () => {
    release.resolve(true)
    vi.restoreAllMocks()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  })
  await mountAgentLoopTestDependencies(ctx)
  const auditPath = join(root, 'audit.sqlite')
  const owner = await ctx.plugin(Protection, { path: ':memory:', auditPath, hostsFile: '' })
  const runtime = await mountAgentLoopTestHarness(ctx), agent = await runtime.create(SessionId('audit-withdrawal'))
  const path = join(root, 'pending'), resolve = FileIdentity.resolveLocalPathIdentity
  vi.spyOn(FileIdentity, 'resolveLocalPathIdentity').mockImplementation(async (...args) => {
    if (args[0] === path) { entered.resolve(true); await release.promise }
    return resolve(...args)
  })
  const protection = ctx.targetProtection, lifetime = protection.executionSignal()
  const aborted = new Promise<void>((accept) => { lifetime.addEventListener('abort', () => { accept() }, { once: true }) })
  const operation = ctx.agents.withInitiator(agent, () => protection.checkLocalFile(path, 'metadata', new AbortController().signal))
  const rejected = expect(operation).rejects.toBeDefined()
  await entered.promise
  const closing = owner.dispose()
  await aborted
  release.resolve(true)
  await rejected
  await closing
  const reopened = await TargetAuditStore.open(auditPath, 1000, 10)
  try {
    const entry = reopened.recent()[0]
    expect(entry).toMatchObject({ decision: 'error', source: { sessionId: agent.id } })
    expect(agent.session.snapshotEvents().find(event => event.type === 'target/admission')?.data).toEqual(entry)
  } finally { reopened.close() }
})

it('keeps ordinary Sessions free of admission records while audit recording is disabled', async () => {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  const runtime = await mountAgentLoopTestHarness(ctx), agent = await runtime.create(SessionId('audit-disabled'))
  await ctx.agents.withInitiator(agent, () => ctx.targetProtection.checkConnection('example.test', 443, undefined,
    'endpoint', 'unknown', new AbortController().signal))
  expect(ctx.targetProtection.auditHistory()).toEqual({ state: 'off', entries: [] })
  expect(agent.session.snapshotEvents().filter(event => event.type === 'target/admission')).toEqual([])
})

it('uses an explicit tool caller and clears inherited attribution for agentless tool dispatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-audit-tool-caller-')), ctx = new Context()
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Protection, { path: ':memory:', auditPath: join(root, 'audit.sqlite'), hostsFile: '' })
  const runtime = await mountAgentLoopTestHarness(ctx), parent = await runtime.create(SessionId('audit-tool-parent'))
  const child = await runtime.create(SessionId('audit-tool-caller'))
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'inspect_target', description: 'Inspect the owned fixture target.', parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec) {
      const value = await ctx.targetProtection.checkLocalFile(join(root, 'target'), 'metadata', exec.signal)
      return { allowed: value.decision.allowed }
    },
  })))
  const input = { name: 'inspect_target', arguments: {}, callId: ToolCallId('direct-audit'), signal: new AbortController().signal }
  const explicit = await ctx.agents.withInitiator(parent, () => executeToolFixture(ctx, { ...input, agent: child }))
  expect(explicit.isError).toBe(false)
  expect(ctx.targetProtection.auditHistory().entries[0]?.source).toEqual({ sessionId: child.id })
  expect(child.session.snapshotEvents().filter(event => event.type === 'target/admission')).toHaveLength(1)
  expect(parent.session.snapshotEvents().filter(event => event.type === 'target/admission')).toEqual([])
  const standalone = await ctx.agents.withInitiator(parent, () => executeToolFixture(ctx, input))
  expect(standalone.isError).toBe(false)
  expect(ctx.targetProtection.auditHistory().entries[0]).not.toHaveProperty('source')
  expect(parent.session.snapshotEvents().filter(event => event.type === 'target/admission')).toEqual([])
})
