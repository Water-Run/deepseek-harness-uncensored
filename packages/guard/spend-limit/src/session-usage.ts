/** Session-local estimates from durable usage; independent of whether admission limits are enabled. */
import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import type {} from '@deepseek-ai/dsh-memory/types'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { usageCost } from './pricing.ts'
import type { SessionSpendUsage, SpendRate } from './types.ts'

/** Maximum points returned by the session-cost RPC; totals still cover every request. */
const MAX_POINTS = 240

type ModelRoute = { readonly provider: string; readonly model: string }

/** Billing fields in a composer-owned log event. Early records omit the request ID and route. */
type PredictionUsageEvent = Pick<SessionEvent, 'seq' | 'time'> & {
  readonly type: 'input/prediction'
  readonly data: {
    readonly phase: 'request' | 'result'
    readonly requestId?: Branded<'PredictionRequestId'>
    readonly request?: ModelRoute
    readonly usage?: TokenUsage
  }
}

/**
 * Estimate this Session's answers, retries, memory extractions and composer predictions.
 * @param events - Durable events including route headers and optional inherited prefix.
 * @param rates - Current deployment rates; missing rates remain explicitly unpriced.
 * @param inheritedEventCount - Session-validated length of the full inherited prefix, including ancestors.
 * @returns CNY totals, coverage counts and a bounded cumulative curve.
 */
export function sessionSpendUsage(
  events: readonly (SessionEvent | PredictionUsageEvent)[], rates: readonly SpendRate[], inheritedEventCount: SessionLogOffset,
): SessionSpendUsage {
  let route: ModelRoute | undefined
  let last: { turn: number; step: number; seq: number } | undefined
  let missingId = 0
  const pending = new Map<string, ModelRoute | undefined>()
  const settled = new Map<number, { time: number; cost: number | undefined }>()

  function settle(seq: number, time: number, request: ModelRoute | undefined, usage: TokenUsage | undefined): void {
    const rate = request && rates.find(value => value.providers.includes(request.provider) && value.models.includes(request.model))
    settled.set(seq, { time, cost: rate && usage ? usageCost(rate, usage) : undefined })
  }

  for (const event of events) {
    if (event.type === 'request/header') route = event.data.header.config
    if (event.seq < inheritedEventCount) continue
    if (event.type === 'memory/extraction' || event.type === 'input/prediction') {
      const key = event.data.requestId === undefined ? undefined : event.type + ':' + event.data.requestId
      if (event.data.phase === 'request') {
        if (key === undefined) missingId++
        else pending.set(key, event.type === 'input/prediction' ? event.data.request : event.data)
      } else if (key !== undefined && pending.has(key)) {
        settle(event.seq, event.time, pending.get(key), event.data.usage)
        pending.delete(key)
      }
      continue
    }
    if (event.type === 'llm/retry-started') { last = undefined; continue }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue
    const usage = event.type === 'assistant/message' && event.data.usage !== undefined
      ? event.data.usage : lastAssistantStreamChunk(event.data.stream, 'usage')?.usage
    if (last?.turn === event.data.turn && last.step === event.data.step) settled.delete(last.seq)
    settle(event.seq, event.time, route, usage)
    last = { turn: event.data.turn, step: event.data.step, seq: event.seq }
  }

  let total = 0
  let unknown = pending.size + missingId
  const requests = settled.size + unknown
  let points: SessionSpendUsage['points'] = []
  for (const entry of settled.values()) {
    if (entry.cost === undefined) unknown++
    else total += entry.cost
    points.push({ time: entry.time, total: total / 1_000_000 })
  }
  if (points.length > MAX_POINTS) {
    const keep = new Set(Array.from({ length: MAX_POINTS }, (_, index) => Math.round(index * (points.length - 1) / (MAX_POINTS - 1))))
    points = points.filter((_, index) => keep.has(index))
  }
  return { total: total / 1_000_000, requests, unpricedRequests: unknown, points }
}
