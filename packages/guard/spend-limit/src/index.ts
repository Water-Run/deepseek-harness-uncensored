/** Built-in spending admission for model streams and DeepSeek native search. */
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-web-search-deepseek'
import { z } from 'zod'
import { SpendLedger } from './ledger.ts'
import { SpendGate } from './gate.ts'
import { DEFAULT_RATES } from './pricing.ts'
import type { SpendPreferences, SpendRate, SpendSnapshot } from './types.ts'
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
const count = z.number().int().nonnegative().safe()
const usageSchema = z.object({ input_tokens: count, output_tokens: count,
  cache_read_input_tokens: count.optional(), cache_creation_input_tokens: count.optional() })

/** Authenticated settings and observations; no request content or credentials are stored. */
export class SpendLimitRemote extends TypertRemoteService {
  /** @param ctx - Service owner. @param gate - Owned admission and accounting engine. */
  constructor(ctx: Context, private readonly ready: Promise<SpendGate>) { super(ctx, 'spendLimit', { namespace: 'spending' }) }
  /**
   * Read the durable ledger; initialization failures remain visible to every caller.
   * @returns Shared limits, rolling totals and local waiters.
   */
  @Remote
  async get(): Promise<SpendSnapshot> { const gate = await this.ready; return gate.ledger.snapshot(gate.waiting) }
  /**
   * Save user preferences across local processes.
   * @param preferences - Complete user limits.
   * @returns Committed settings and totals.
   */
  @Remote
  async configure(preferences: SpendPreferences): Promise<SpendSnapshot> {
    (await this.ready).ledger.configure(preferences)
    return this.get()
  }
  /**
   * Clear manual pause.
   * @returns Updated state; remaining limits still apply.
   */
  @Remote
  async resume(): Promise<SpendSnapshot> { (await this.ready).ledger.resume(); return this.get() }
  /**
   * Clear completed statistics.
   * @returns Remaining active reservations and settings.
   */
  @Remote
  async reset(): Promise<SpendSnapshot> { (await this.ready).ledger.reset(); return this.get() }
}

/**
 * Install admission before provider dispatch and retain the ledger through request teardown.
 * @param ctx - Root application scope.
 * @param config - Validated deployment settings.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  let closing = false
  const ready = SpendLedger.open(config.path).then(ledger => new SpendGate(ledger, config.rates, config.pollMs))
  void ready.catch((error) => { ctx.logger.error('spend-limit: ledger unavailable; paid requests remain blocked'); ctx.logger.error(error) })
  const service = ctx.plugin(SpendLimitRemote, ready)
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
    stopStream(); stopSearch()
    // Failed initialization has already been reported; there is no owned handle to close.
    const gate = await ready.catch(() => undefined)
    await gate?.close()
    await service.dispose()
  }, 'spend-limit: admission and ledger')
  try { await service.await() }
  catch (error) { closing = true; stopStream(); stopSearch(); await (await ready.catch(() => undefined))?.close(); throw error }
}
