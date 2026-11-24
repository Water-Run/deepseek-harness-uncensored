import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { RetryId } from '@deepseek-ai/dsh-llm-retry'
import { sessionSpendUsage } from '../src/session-usage.ts'
import { DEFAULT_RATES } from '../src/pricing.ts'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MemoryExtractionId } from '@deepseek-ai/dsh-memory/types'

const header = (seq: number, model = 'deepseek-flash'): SessionEvent<'request/header'> => ({
  seq: SessionSeq(seq), time: seq * 1000, type: 'request/header',
  data: { reason: 'initial', header: { config: { provider: 'deepseek-official', model } } },
})
const attempt = (seq: number, step = 1, input = 100): SessionEvent<'assistant/attempt'> => ({
  seq: SessionSeq(seq), time: seq * 1000, type: 'assistant/attempt',
  data: { turn: 1, step, stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage: { inputTokens: input, outputTokens: 20 } } }] },
})

it('replaces a repeated usage settlement and counts a real retry separately', () => {
  const events: SessionEvent[] = [header(0), attempt(1), attempt(2),
    { seq: SessionSeq(3), time: 3000, type: 'llm/retry-started', data: { turn: 1, step: 1, retry: 1, retryId: RetryId('retry') } },
    attempt(4),
  ]
  const result = sessionSpendUsage(events, DEFAULT_RATES, SessionLogOffset(0))
  expect(result).toMatchObject({ total: 0.00072, requests: 2, unpricedRequests: 0 })
  expect(result.points).toEqual([{ time: 2000, total: 0.00036 }, { time: 4000, total: 0.00072 }])
})

it('excludes inherited work and reports unknown routes without inventing fees', () => {
  const events: SessionEvent[] = [header(0), attempt(1),
    { seq: SessionSeq(2), time: 2000, type: 'session/end-seed', data: { inherited: true } },
    header(3, 'unpriced-model'), attempt(4, 2), header(5), attempt(6, 3),
  ]
  expect(sessionSpendUsage(events, DEFAULT_RATES, SessionLogOffset(2))).toMatchObject({ total: 0.00036, requests: 2, unpricedRequests: 1 })
})

it('charges only the grandchild after two real forks and keeps the inherited route', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    const root = ctx.sessions.create()
    root.append('request/header', header(0).data)
    root.append('assistant/attempt', attempt(1).data)
    const parent = ctx.sessions.fork(root)
    parent.append('assistant/attempt', attempt(0, 2).data)
    const child = ctx.sessions.fork(parent)
    child.append('assistant/attempt', attempt(0, 3).data)
    const usage = sessionSpendUsage(child.snapshotEvents(), DEFAULT_RATES, child.inheritedEventCount)
    expect(usage).toMatchObject({ total: 0.00036, requests: 1, unpricedRequests: 0 })
    expect(usage.points).toHaveLength(1)
  } finally { await ctx.fiber.dispose() }
})

it('bounds curve payloads while preserving the exact total and end points', () => {
  const events = [header(0), ...Array.from({ length: 1000 }, (_, index) => attempt(index + 1, index + 1))]
  const result = sessionSpendUsage(events, DEFAULT_RATES, SessionLogOffset(0))
  expect(result.total).toBe(0.36)
  expect(result.points).toHaveLength(240)
  expect(result.points.at(-1)).toEqual({ time: 1_000_000, total: 0.36 })
})

it('accounts extraction once using its recorded route without changing the main model route', () => {
  const requestId = brandString<MemoryExtractionId>('extraction-1')
  const events: SessionEvent[] = [header(0), attempt(1), {
    type: 'memory/extraction', seq: SessionSeq(2), time: 2000,
    data: { requestId, phase: 'request', turn: 1, throughSeq: 1, scope: { global: false, mode: 'standard' },
      provider: 'deepseek-official', model: 'deepseek-flash', maxTokens: 200,
      message: createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Extract memory' }] }) },
  }, {
    type: 'memory/extraction', seq: SessionSeq(3), time: 3000,
    data: { requestId, phase: 'result', turn: 1, throughSeq: 1, outcome: 'completed', saved: [],
      usage: { inputTokens: 100, outputTokens: 20 } },
  }, attempt(4, 2)]
  const result = sessionSpendUsage(events, DEFAULT_RATES, SessionLogOffset(0))
  expect(result).toMatchObject({ total: 0.00108, requests: 3, unpricedRequests: 0 })
  expect(result.points).toHaveLength(3)
  expect(sessionSpendUsage(events.slice(0, 3), DEFAULT_RATES, SessionLogOffset(0)))
    .toMatchObject({ total: 0.00036, requests: 2, unpricedRequests: 1 })
})
