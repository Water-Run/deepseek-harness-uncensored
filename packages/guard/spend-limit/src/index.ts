/** Built-in spending admission for model streams and DeepSeek native search. */
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-web-search-deepseek'
import type {} from '@deepseek-ai/dsh-session-query'
import { z } from 'zod'
import { SpendRecovery, type SpendContinuationHandler } from './continuation.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { SpendLedger } from './ledger.ts'
import { SpendGate } from './gate.ts'
import { DEFAULT_RATES } from './pricing.ts'
import type { SessionSpendUsage, SpendPeriod, SpendPreferences, SpendRate, SpendSnapshot, SpendWindowUpdate } from './types.ts'
export type * from './types.ts'

/** Deployment-owned ledger path and conservative rates. User limits live in the ledger. */
export interface Config { path: string; pollMs: number; rates: SpendRate[] }
/** All deployment-varying rates are configurable without changing source. */
export const Config = schema.object({
  path: schema.string().required(), pollMs: schema.number().step(1).min(50).max(60000).default(1000), rates: schema.array(schema.object({
    providers: schema.array(schema.string()).required(), models: schema.array(schema.string()).required(),
    input: schema.number().min(0).max(10000).required(), cachedInput: schema.number().min(0).max(10000).required(),
    cacheWrite: schema.number().min(0).max(10000).required(), output: schema.number().min(0).max(10000).required(),
    contextTokens: schema.number().step(1).min(1).max(100000000).required(),
    maxOutputTokens: schema.number().step(1).min(1).max(100000000).required(), searchRequest: schema.number().min(0).max(10000).required(),
  })).default(DEFAULT_RATES) })
export const name = 'spend-limit'
export const inject = ['llm']
declare module '@deepseek-ai/cordis' { interface Context { spendLimit: SpendLimitRemote } }
interface SpendRuntime { ready: Promise<SpendGate>; recovery: SpendRecovery }
const count = z.number().int().nonnegative()
const usageSchema = z.object({ input_tokens: count, output_tokens: count,
  cache_read_input_tokens: count.optional(), cache_creation_input_tokens: count.optional() })

/** Authenticated settings and observations; no request content or credentials are stored. */
export class SpendLimitRemote extends TypertRemoteService {
  /** @param ctx - Service owner. @param runtime - Owned ledger and recovery worker. */
  constructor(ctx: Context, private readonly runtime: SpendRuntime) { super(ctx, 'spendLimit', { namespace: 'spending' }) }
  private assertOwner(action: string): void {
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('spending/owner-required',
      'Only the application owner can change spending limits.', { action })
  }
  /**
   * Register the lifecycle owner that captures and restores ordinary conversations.
   * @param handler - Normal conversation restoration path.
   * @param capture - Tests ownership of a live Session before creating a durable pause.
   * @returns Cancelling, draining registration disposer.
   */
  registerContinuation(handler: SpendContinuationHandler, capture: (id: SessionId) => boolean): () => Promise<void> {
    return this.runtime.recovery.register(handler, capture)
  }
  /**
   * Discard recovery work for a deleted conversation.
   * @param sessionId - Deleted conversation whose pending continuation must be discarded.
   */
  async forgetSession(sessionId: SessionId): Promise<void> { (await this.runtime.ready).ledger.clearSession(sessionId) }
  /**
   * Read the durable ledger; initialization failures remain visible to every caller.
   * @returns Shared limits, rolling totals and local waiters.
   */
  @Remote
  async get(): Promise<SpendSnapshot> { const gate = await this.runtime.ready; return gate.ledger.snapshot(gate.waiting) }
  /**
   * Read estimates from recorded model usage, including when spending limits are off.
   * @param sessionId - Conversation to inspect; only the application owner may read it.
   * @returns CNY estimate and bounded cumulative history, with missing usage or rates counted explicitly.
   */
  @Remote
  async sessionUsage(sessionId: SessionId): Promise<SessionSpendUsage> {
    this.assertOwner('spending/sessionUsage')
    const query = this.ctx.get('sessionQuery')
    if (query === undefined) throw new RemoteError('gateway/internal', 'Session history is unavailable.', {})
    using source = await query.observeSession(sessionId)
    return (await this.runtime.ready).sessionUsage(source.events)
  }
  /**
   * Save user preferences across local processes.
   * @param preferences - Complete user limits.
   * @returns Committed settings and totals.
   */
  @Remote
  async configure(preferences: SpendPreferences): Promise<SpendSnapshot> {
    this.assertOwner('spending/configure')
    const gate = await this.runtime.ready
    gate.ledger.configure(preferences)
    await this.runtime.recovery.flush(gate)
    return this.get()
  }
  /**
   * Save one window without overwriting concurrent changes to another window.
   * @param update - Window and the settings to change.
   * @returns Committed preferences and totals.
   */
  @Remote
  async configureWindow(update: SpendWindowUpdate): Promise<SpendSnapshot> {
    this.assertOwner('spending/configure-window')
    const gate = await this.runtime.ready
    gate.ledger.configureWindow(update)
    await this.runtime.recovery.flush(gate)
    return this.get()
  }
  /**
   * Save the automatic continuation preference independently of window settings.
   * @param enabled - Whether paused conversations should continue when capacity returns.
   * @returns Committed preferences and totals.
   */
  @Remote
  async setAutoResume(enabled: boolean): Promise<SpendSnapshot> {
    this.assertOwner('spending/auto-resume')
    const gate = await this.runtime.ready
    gate.ledger.setAutoResume(enabled)
    await this.runtime.recovery.flush(gate)
    return this.get()
  }
  /**
   * Disable all windows while preserving their amounts and accounting records.
   * @returns Committed preferences and totals after eligible conversations resume.
   */
  @Remote
  async disableAll(): Promise<SpendSnapshot> {
    this.assertOwner('spending/disable-all')
    const gate = await this.runtime.ready
    gate.ledger.disableAll()
    await this.runtime.recovery.flush(gate)
    return this.get()
  }
  /**
   * Clear manual pause.
   * @returns Updated state; remaining limits still apply.
   */
  @Remote
  async resume(): Promise<SpendSnapshot> {
    this.assertOwner('spending/resume')
    const gate = await this.runtime.ready
    gate.ledger.resume()
    await this.runtime.recovery.flush(gate)
    return this.get()
  }
  /**
   * Clear completed statistics.
   * @param period - One rolling window; omission resets all completed statistics.
   * @returns Remaining active reservations and settings.
   */
  @Remote
  async reset(period?: SpendPeriod): Promise<SpendSnapshot> {
    this.assertOwner('spending/reset')
    const gate = await this.runtime.ready
    gate.ledger.reset(period)
    await this.runtime.recovery.flush(gate)
    return this.get()
  }
}

/**
 * Install admission before provider dispatch and retain the ledger through request teardown.
 * @param ctx - Root application scope.
 * @param config - Validated deployment settings.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  let closing = false
  const ready = SpendLedger.open(config.path)
    .then(ledger => new SpendGate(ledger, config.rates, config.pollMs, id => recovery.canCapture(id)))
  void ready.catch((error: unknown) => { ctx.logger.error('spend-limit: ledger unavailable; paid requests remain blocked'); ctx.logger.error(error) })
  const recovery = new SpendRecovery((error) => {
    ctx.logger.error('spend-limit: paused conversation remains pending; recovery failed')
    ctx.logger.error(error)
  })
  let stopPolling: (() => void) | undefined
  void ready.then((gate) => {
    if (closing) return
    const timer = setInterval(() => { void recovery.flush(gate) }, config.pollMs)
    stopPolling = () => { clearInterval(timer) }
  }, () => { /* Initialization failure is reported above and blocks paid requests. */ })
  const service = ctx.plugin(SpendLimitRemote, { ready, recovery })
  const stopStream = ctx.on('llm/stream', async function* (request, next) {
    const gate = await ready
    if (closing) throw new Error('spend-limit: service is closing')
    yield* gate.stream(request, next)
  })
  const stopSearch = ctx.on('web/deepseek-search-request', async (request, signal, next) => {
    const gate = await ready
    if (closing) throw new Error('spend-limit: service is closing')
    return gate.call({ provider: 'deepseek-official', model: request.body.model, maxTokens: request.body.max_tokens, searches: request.body.tools[0].max_uses }, async () => {
      const value = await next()
      const parsed = usageSchema.safeParse(value.usage)
      const counters = parsed.success ? parsed.data : undefined
      return { value, ...counters === undefined ? {} : { usage: { inputTokens: counters.input_tokens, outputTokens: counters.output_tokens,
        cacheReadTokens: counters.cache_read_input_tokens ?? 0, cacheWriteTokens: counters.cache_creation_input_tokens ?? 0 } },
      searches: value.content?.filter(block => block.type === 'web_search_tool_result').length ?? request.body.tools[0].max_uses }
    }, signal)
  })
  ctx.effect(() => async () => {
    closing = true
    stopPolling?.()
    stopStream(); stopSearch()
    await recovery.close()
    // Failed initialization has already been reported; there is no owned handle to close.
    const gate = await ready.catch(() => undefined)
    await gate?.close()
    await service.dispose()
  }, 'spend-limit: admission and ledger')
  try { await service.await() }
  catch (error) {
    closing = true; stopPolling?.(); stopStream(); stopSearch()
    await recovery.close()
    await (await ready.catch(() => undefined))?.close()
    throw error
  }
}
