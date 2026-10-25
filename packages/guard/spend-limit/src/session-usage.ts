/** Session-local estimates from durable usage; independent of whether admission limits are enabled. */
import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import { usageCost } from './pricing.ts'
import type { SessionSpendUsage, SpendRate } from './types.ts'

/** Maximum points returned by the session-cost RPC; totals still cover every request. */
const MAX_POINTS = 240

/**
 * Estimate this Session's own model responses and retries at the configured rates.
 * @param events - Durable events including route headers and optional inherited prefix.
 * @param rates - Current deployment rates; missing rates remain explicitly unpriced.
 * @returns CNY totals, coverage counts and a bounded cumulative curve.
 */
export function sessionSpendUsage(events: readonly SessionEvent[], rates: readonly SpendRate[]): SessionSpendUsage {
  let route: { provider: string; model: string } | undefined
  let total = 0, unknown = 0, requests = 0
  let last: { turn: number; step: number; cost: number; unknown: number } | undefined
  let points: SessionSpendUsage['points'] = []
  const inherited = events.findIndex(event => event.type === 'session/end-seed' && event.data.inherited)
  for (const event of events) {
    if (event.type === 'request/header') route = event.data.header.config
    if (event.seq <= inherited) continue
    if (event.type === 'llm/retry-started') { last = undefined; continue }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue
    const usage = event.type === 'assistant/message' && event.data.usage !== undefined
      ? event.data.usage : lastAssistantStreamChunk(event.data.stream, 'usage')?.usage
    const currentRoute = route
    const rate = currentRoute === undefined ? undefined
      : rates.find(value => value.providers.includes(currentRoute.provider) && value.models.includes(currentRoute.model))
    const cost = rate === undefined || usage === undefined ? 0 : usageCost(rate, usage)
    const unpriced = rate === undefined || usage === undefined ? 1 : 0
    const replacing = last !== undefined && last.turn === event.data.turn && last.step === event.data.step
    if (replacing && last !== undefined) { total -= last.cost; unknown -= last.unknown; points.pop() }
    else requests++
    total += cost; unknown += unpriced
    points.push({ time: event.time, total: total / 1_000_000 })
    last = { turn: event.data.turn, step: event.data.step, cost, unknown: unpriced }
  }
  if (points.length > MAX_POINTS) {
    const keep = new Set(Array.from({ length: MAX_POINTS }, (_, index) => Math.round(index * (points.length - 1) / (MAX_POINTS - 1))))
    points = points.filter((_, index) => keep.has(index))
  }
  return { total: total / 1_000_000, requests, unpricedRequests: unknown, points }
}
