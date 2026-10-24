/** Cancellable request admission and stream settlement over a durable ledger. */
import { setTimeout as delay } from 'node:timers/promises'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { SpendLedger } from './ledger.ts'
import { reserveCost, usageCost } from './pricing.ts'
import type { SpendRate, SpendReservationId } from './types.ts'

/** One process's admission waiters and active requests; the ledger coordinates other processes. */
export class SpendGate {
  private readonly lifetime = new AbortController()
  private readonly active = new Set<Promise<void>>()
  private waiters = 0
  /** @param ledger - Owned shared ledger. @param rates - Deployment prices. @param pollMs - Cross-process admission polling interval. */
  constructor(readonly ledger: SpendLedger, private readonly rates: readonly SpendRate[], private readonly pollMs: number) {}
  /** Locally waiting requests, excluding requests already sent to a provider. */
  get waiting(): number { return this.waiters }

  private sessionState(sessionId: string | undefined, state: 'waiting' | 'blocked' | 'clear'): void {
    if (sessionId === undefined || sessionId.length === 0) return
    if (state === 'clear') this.ledger.clearSession(sessionId)
    else this.ledger.noteSession(sessionId, state)
  }

  private async admit(cost: number, signal?: AbortSignal): Promise<SpendReservationId | undefined> {
    const combined = signal === undefined ? this.lifetime.signal : AbortSignal.any([signal, this.lifetime.signal])
    this.waiters++
    try {
      while (true) {
        combined.throwIfAborted()
        const result = this.ledger.reserve(cost)
        if (result.kind === 'disabled') return
        if (result.kind === 'reserved') return result.id
        if (result.kind === 'too-large') throw new LlmError('单次请求的预留费用超过限额。请提高额度或降低模型的最大输出长度。 / Request reservation exceeds a limit. Raise the limit or lower the model output ceiling.', 'SPEND_REQUEST_TOO_LARGE')
        await delay(this.pollMs, undefined, { signal: combined })
      }
    } finally { this.waiters-- }
  }

  private rate(provider: string, model: string): SpendRate {
    const rate = this.rates.find(value => value.providers.includes(provider) && value.models.includes(model))
    if (rate === undefined) throw new LlmError('此模型没有可用的人民币费率。请配置费率后重试，或关闭额度限制。 / No CNY rate configured for this model. Configure a rate or disable spending limits.', 'SPEND_RATE_UNKNOWN')
    return rate
  }

  private begin(): () => void {
    this.lifetime.signal.throwIfAborted()
    let complete!: () => void
    const pending = new Promise<void>((resolve) => { complete = resolve })
    this.active.add(pending)
    return () => { this.active.delete(pending); complete() }
  }

  /**
   * Reserve before starting the adapter and settle before exposing its terminal chunk.
   * @param request - Unmodified, logged model request.
   * @param next - Next stream middleware or adapter.
   * @returns Original chunks after durable admission; cancellation retains unknown usage.
   */
  async * stream(request: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    const complete = this.begin()
    let id: SpendReservationId | undefined, dispatched = false
    const sessionId = request.sessionId
    try {
      if (!this.ledger.snapshot().preferences.enabled) { yield* next(); return }
      const rate = this.rate(request.provider, request.model)
      this.sessionState(sessionId, 'waiting')
      try {
        id = await this.admit(reserveCost(rate, request.maxTokens), request.signal)
        this.sessionState(sessionId, 'clear')
      } catch (error) {
        if (!this.lifetime.signal.aborted) this.sessionState(sessionId, 'clear')
        throw error
      }
      request.signal?.throwIfAborted()
      let usage: TokenUsage | undefined
      dispatched = true
      for await (const chunk of next()) {
        if (chunk.type === 'usage') usage = chunk.usage
        if (chunk.type === 'finish' && id !== undefined) {
          const finished = chunk.reason.kind === 'stop' || chunk.reason.kind === 'tool-calls' || chunk.reason.kind === 'max-tokens'
          this.ledger.settle(id, finished && usage !== undefined ? usageCost(rate, usage) : null)
          id = undefined
        }
        yield chunk
      }
    } finally {
      try {
        if (id !== undefined) this.ledger.settle(id, dispatched ? null : 0)
        if (this.lifetime.signal.aborted) this.sessionState(sessionId, 'blocked')
        else if (request.signal?.aborted) this.sessionState(sessionId, 'clear')
      }
      finally { complete() }
    }
  }

  /**
   * Account for provider-specific non-streaming requests such as native search.
   * @param request - Rate route, output ceiling and maximum search uses.
   * @param send - Provider operation returning its response and complete usage, when available.
   * @param signal - Caller cancellation.
   * @returns The provider result after settlement.
   */
  async call<T>(
    request: { provider: string; model: string; maxTokens: number; searches: number },
    send: () => Promise<{ value: T; usage?: TokenUsage; searches?: number }>, signal?: AbortSignal,
  ): Promise<T> {
    const complete = this.begin()
    let id: SpendReservationId | undefined, dispatched = false
    try {
      if (!this.ledger.snapshot().preferences.enabled) return (await send()).value
      const rate = this.rate(request.provider, request.model)
      id = await this.admit(reserveCost(rate, request.maxTokens, request.searches), signal)
      signal?.throwIfAborted()
      dispatched = true
      const result = await send()
      if (id !== undefined) {
        this.ledger.settle(id, result.usage === undefined ? null : usageCost(rate, result.usage, result.searches ?? request.searches))
        id = undefined
      }
      return result.value
    } finally {
      try { if (id !== undefined) this.ledger.settle(id, dispatched ? null : 0) }
      finally { complete() }
    }
  }

  /** Stop admissions, cancel waiters, drain dispatched requests, and close the ledger. */
  async close(): Promise<void> {
    this.lifetime.abort()
    await Promise.all(this.active)
    this.ledger.close()
  }
}
