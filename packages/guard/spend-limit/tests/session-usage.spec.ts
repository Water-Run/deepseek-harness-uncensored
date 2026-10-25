import { expect, it } from 'vitest'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { RetryId } from '@deepseek-ai/dsh-llm-retry'
import { sessionSpendUsage } from '../src/session-usage.ts'
import { DEFAULT_RATES } from '../src/pricing.ts'

const header = (seq: number, model = 'deepseek-flash'): SessionEvent => ({
  seq: SessionSeq(seq), time: seq * 1000, type: 'request/header',
  data: { reason: 'initial', header: { config: { provider: 'deepseek-official', model } } },
})
const attempt = (seq: number, step = 1, input = 100): SessionEvent => ({
  seq: SessionSeq(seq), time: seq * 1000, type: 'assistant/attempt',
  data: { turn: 1, step, stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage: { inputTokens: input, outputTokens: 20 } } }] },
})

it('replaces a repeated usage settlement and counts a real retry separately', () => {
  const events: SessionEvent[] = [header(0), attempt(1), attempt(2),
    { seq: SessionSeq(3), time: 3000, type: 'llm/retry-started', data: { turn: 1, step: 1, retry: 1, retryId: RetryId('retry') } },
    attempt(4),
  ]
  const result = sessionSpendUsage(events, DEFAULT_RATES)
  expect(result).toMatchObject({ total: 0.00072, requests: 2, unpricedRequests: 0 })
  expect(result.points).toEqual([{ time: 2000, total: 0.00036 }, { time: 4000, total: 0.00072 }])
})

it('excludes inherited work and reports unknown routes without inventing fees', () => {
  const events: SessionEvent[] = [header(0), attempt(1),
    { seq: SessionSeq(2), time: 2000, type: 'session/end-seed', data: { inherited: true } },
    header(3, 'unpriced-model'), attempt(4, 2), header(5), attempt(6, 3),
  ]
  expect(sessionSpendUsage(events, DEFAULT_RATES)).toMatchObject({ total: 0.00036, requests: 2, unpricedRequests: 1 })
})

it('bounds curve payloads while preserving the exact total and end points', () => {
  const events = [header(0), ...Array.from({ length: 1000 }, (_, index) => attempt(index + 1, index + 1))]
  const result = sessionSpendUsage(events, DEFAULT_RATES)
  expect(result.total).toBe(0.36)
  expect(result.points).toHaveLength(240)
  expect(result.points.at(-1)).toEqual({ time: 1_000_000, total: 0.36 })
})
