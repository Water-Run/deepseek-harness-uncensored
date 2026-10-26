/** Budget recovery through real AgentLoop, JSONL and the API's normal Agent ownership. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import SqliteQuery from '@deepseek-ai/dsh-session-query-sqlite'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as spending from '@deepseek-ai/dsh-spend-limit'
import { SpendLedger, DEFAULT_PREFERENCES, MICRO_CNY } from '@deepseek-ai/dsh-spend-limit/src/ledger.ts'
import { SpendGate } from '@deepseek-ai/dsh-spend-limit/src/gate.ts'
import { SpendRecovery } from '@deepseek-ai/dsh-spend-limit/src/continuation.ts'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { createSessionTestController } from './test-remote.ts'

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function setup(existingRoot?: string) {
  const root = existingRoot ?? await mkdtemp(join(tmpdir(), 'dshu-budget-api-'))
  if (existingRoot === undefined) roots.push(root)
  const cwd = join(root, 'workspace'), path = join(root, 'budget.sqlite')
  await mkdir(cwd, { recursive: true })
  const ctx = new Context(); contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(Jsonl, { root: join(root, 'sessions'), compression: 'none' }).await()
  await ctx.plugin(Storage).await()
  await ctx.plugin(JsonStorage, { root: join(root, 'storage') }).await()
  await ctx.plugin(StorageDomain, { backend: 'json' }).await()
  await ctx.plugin(WorkspaceRegistry).await()
  await ctx.plugin(SqliteQuery, { path: join(root, 'search.sqlite'), openAt: 'startup' }).await()
  await mountAgentLoopTestHarness(ctx)
  const adapter = new MockAdapter([textResponse('continued original task')])
  ctx.llm.registerAdapter(['mock'], adapter)
  await ctx.plugin(spending, { path, pollMs: 50, rates: [{ providers: ['mock'], models: ['mock'], input: 1,
    cachedInput: 1, cacheWrite: 1, output: 1, contextTokens: 1000000, maxOutputTokens: 100, searchRequest: 0 }] }).await()
  const api = createSessionTestController(ctx, { cwd, defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }) })
  return { root, cwd, path, ctx, api, adapter }
}

async function exhaust(fixture: Awaited<ReturnType<typeof setup>>) {
  await fixture.ctx.spendLimit.configure({ ...DEFAULT_PREFERENCES, enabledPeriods: ['15m', '1h', '5h', '1d', '7d', '30d'],
    limits: { ...DEFAULT_PREFERENCES.limits, '15m': 3 } })
  const ledger = await SpendLedger.open(fixture.path)
  try {
    const reservation = ledger.reserve(3 * MICRO_CNY)
    if (reservation.kind !== 'reserved') throw new Error(reservation.kind)
    ledger.settle(reservation.id, 3 * MICRO_CNY)
  } finally { ledger.close() }
  const { sessionId } = await fixture.api.create({ cwd: fixture.cwd })
  const agent = fixture.ctx.agents.get(sessionId)!
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'finish-original-task' }] }))
  await vi.waitFor(async () => {
    expect((await fixture.ctx.spendLimit.get()).pausedSessions).toEqual([{ sessionId, state: 'waiting' }])
  })
  expect(fixture.adapter.requests).toHaveLength(0)
  return agent
}

it('restores a paused task through API ownership after restart and continues only after capacity returns', async () => {
  const first = await setup()
  const agent = await exhaust(first)
  const sessionId = agent.id
  await first.ctx.fiber.dispose()
  const second = await setup(first.root)
  expect((await second.ctx.spendLimit.get()).pausedSessions).toEqual([{ sessionId, state: 'blocked' }])
  await second.ctx.spendLimit.resume()
  expect(second.adapter.requests).toHaveLength(0)
  await second.ctx.spendLimit.reset()
  await vi.waitFor(async () => {
    expect({ requests: second.adapter.requests.length, paused: (await second.ctx.spendLimit.get()).pausedSessions,
      live: second.ctx.agents.get(sessionId)?.status }).toEqual({ requests: 1, paused: [], live: 'idle' })
  })
  const restored = second.ctx.agents.get(sessionId)!
  await restored.whenIdle()
  expect(restored.session.header.cwd).toBe(first.cwd)
  expect(JSON.stringify(second.adapter.requests[0]?.messages)).toContain('finish-original-task')
  expect(restored.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'spend-limit')).toHaveLength(1)
  expect((await second.ctx.spendLimit.get()).pausedSessions).toEqual([])
  await second.ctx.spendLimit.resume()
  expect(second.adapter.requests).toHaveLength(1)
  expect((await second.api.delete({ sessionId })).deletedSessionIds).toEqual([sessionId])
})

it('does not resume a task the user stopped while it was waiting', async () => {
  const fixture = await setup()
  const agent = await exhaust(fixture)
  fixture.api.cancel({ sessionId: agent.id })
  await agent.whenIdle()
  expect((await fixture.ctx.spendLimit.get()).pausedSessions).toEqual([])
  await fixture.ctx.spendLimit.reset()
  expect(fixture.adapter.requests).toHaveLength(0)
})

it('acknowledges recovery only after persistence succeeds and does not repeat an accepted notice', async () => {
  const fixture = await setup()
  const { sessionId } = await fixture.api.create({ cwd: fixture.cwd })
  const agent = fixture.ctx.agents.get(sessionId)!
  const ledger = await SpendLedger.open(':memory:')
  const gate = new SpendGate(ledger, [], 50, () => true)
  const report = vi.fn()
  const recovery = new SpendRecovery(report)
  const failed = vi.fn().mockRejectedValueOnce(new Error('flush failed')).mockResolvedValue(undefined)
  try {
    const id = ledger.waitForSession(sessionId, MICRO_CNY)
    ledger.blockSession(id)
    recovery.register(async () => ({ agent, flush: failed }), () => true)
    await recovery.flush(gate)
    await agent.whenIdle()
    expect(ledger.snapshot().pausedSessions).toHaveLength(1)
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'flush failed' }))
    expect(fixture.adapter.requests).toHaveLength(1)
    await recovery.flush(gate)
    expect(ledger.snapshot().pausedSessions).toEqual([])
    expect(fixture.adapter.requests).toHaveLength(1)
    expect(agent.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'spend-limit')).toHaveLength(1)
  } finally { await recovery.close(); await gate.close() }
})
