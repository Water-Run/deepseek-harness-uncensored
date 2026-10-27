/** Built-in balance history backed by the application's independent storage domain. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import { isVolatile } from '@deepseek-ai/cosmokit'
import schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-settings'
import type { AccountClientMetadata } from '@deepseek-ai/dsh-deepseek-account/types'
import { BalanceEngine, balanceAmount, balanceSample, balanceStorageKey } from './engine.ts'
import type { BalanceIdentity } from './engine.ts'
import type { BalanceSample, BalanceSnapshot } from './types.ts'
export type * from './types.ts'

/** Deployment and live user preferences for balance queries. */
export interface Config {
  /** Whether authenticated queries and local sampling are enabled. */
  enabled: Volatile<boolean>
  /** Interval in seconds used by the shared client polling owner. */
  refreshSeconds: Volatile<number>
  /** Read saved observations or fetch the current balance from the provider. */
  source: Volatile<'local' | 'api'>
  /** Credential-store reference for API-key balance requests. */
  apiKeyRef: string
  /** HTTPS API origin without credentials, a path, query or fragment. */
  baseURL: string
  /** Deadline in milliseconds for one provider request. */
  timeoutMs: number
  /** Maximum retained samples per account in local storage. */
  historyLimit: number
  /** Maximum observations included in one client snapshot. */
  displayLimit: number
}
/** Validated sampling preferences and bounded provider requests. */
export const Config = schema.object({
  enabled: schema.boolean().default(true).volatile(),
  refreshSeconds: schema.number().step(1).min(15).max(3600).default(15).volatile(),
  source: schema.union(['local', 'api'] as const).default('api').volatile(),
  apiKeyRef: schema.string().default('DEEPSEEK_API_KEY'),
  baseURL: schema.string().default('https://api.deepseek.com'),
  timeoutMs: schema.number().step(1).min(1000).max(60000).default(10000),
  historyLimit: schema.number().step(1).min(2).max(40320).default(10080),
  displayLimit: schema.number().step(1).min(2).max(1000).default(240),
})
export const name = 'balance'
export const inject = ['storage', 'storageDomain', 'deepseekAccount', 'credentials', 'settings']

const domainSpec = defineDomain({ name: 'uncensored_balance', version: 1, layout: 'per-record',
  tables: { samples: domainTable<string, readonly BalanceSample[]>(z.array(balanceSample).max(40320)) } })
const responseSchema = z.object({ balance_infos: z.array(z.object({
  currency: z.enum(['CNY', 'USD']), topped_up_balance: balanceAmount, granted_balance: balanceAmount,
})).max(2) })

declare module '@deepseek-ai/cordis' { interface Context { uncensoredBalance: BalanceRemote } }

/** Authenticated application access to local history and fresh balance queries. */
export class BalanceRemote extends TypertRemoteService {
  /** @param ctx - Service owner. @param options - Provider-owned engine and live preferences. */
  constructor(ctx: Context, private readonly options: { engine: BalanceEngine; config: Config }) {
    super(ctx, 'uncensoredBalance', { namespace: 'balance' })
  }
  /**
   * Read balance observations under the current account and sampling preferences.
   * @param client - Platform request metadata.
   * @returns Sanitized current state and local sampling history.
   */
  @Remote
  get(client: AccountClientMetadata): Promise<BalanceSnapshot> {
    const configured = this.options.config
    const source = isVolatile(configured.source) ? configured.source.get() : configured.source
    const enabled = isVolatile(configured.enabled) ? configured.enabled.get() : configured.enabled
    return enabled ? this.options.engine.read(client, source)
      : Promise.resolve({ status: 'disabled', source, account: null, samples: [], sampleCount: 0 })
  }
}

/**
 * Mount the shared balance provider and close it before its storage domain.
 * @param ctx - Host capabilities supplied by the shipped application.
 * @param config - Validated deployment and sampling preferences.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const origin = new URL(config.baseURL)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('balance: baseURL must be an HTTPS origin without credentials, path, query, or fragment')
  }
  const ref = credentialRef(config.apiKeyRef)
  ctx.settings.configure({ auto: false }, ctx.fiber)
  const domain = await ctx.storage.domain.open(domainSpec)
  const table = domain.table('samples')
  const identify = async (client: AccountClientMetadata, refreshIdentity: boolean): Promise<BalanceIdentity | null> => {
    let platform = await ctx.deepseekAccount.getPlatformSession()
    if (platform !== null) {
      if (platform.userId === null && refreshIdentity) {
        await ctx.deepseekAccount.getProfile(client)
        platform = await ctx.deepseekAccount.getPlatformSession()
      }
      if (platform === null || platform.userId === null) return null
      const selected = platform
      return { key: balanceStorageKey(`account:${platform.origin}:${platform.userId}`), account: 'account',
        current: async () => (await ctx.deepseekAccount.getPlatformSession())?.token === selected.token,
        query: async () => {
          const result = await ctx.deepseekAccount.getBalance(client)
          if (result?.status !== 'ready') throw new Error('balance: account query unavailable')
          const currencies = [...new Set([...result.value, ...result.bonusWallets].map(wallet => wallet.currency))]
          return currencies.map(currency => ({ currency,
            toppedUp: result.value.find(wallet => wallet.currency === currency)?.balance ?? '0',
            granted: result.bonusWallets.find(wallet => wallet.currency === currency)?.balance ?? '0',
          }))
        },
      }
    }
    const key = (await ctx.credentials.resolve(ref))?.value
    if (!key) return null
    return { key: balanceStorageKey(`api:${origin.origin}:${key}`), account: 'api-key',
      current: async () => (await ctx.credentials.resolve(ref))?.value === key,
      query: async (signal) => {
        const response = await fetch(new URL('/user/balance', origin), { signal, redirect: 'error', headers: { authorization: `Bearer ${key}` } })
        if (!response.ok) throw new Error('balance: API query unavailable')
        const payload: unknown = await response.json()
        return responseSchema.parse(payload).balance_infos.map(wallet => ({ currency: wallet.currency,
          toppedUp: wallet.topped_up_balance, granted: wallet.granted_balance }))
      },
    }
  }
  const engine = new BalanceEngine({ identify, read: key => table.get(key), write: (key, samples) => table.put(key, samples),
    limit: config.historyLimit, displayLimit: config.displayLimit, timeoutMs: config.timeoutMs, now: Date.now })
  const service = ctx.plugin(BalanceRemote, { engine, config })
  ctx.effect(() => async () => {
    await engine.close()
    try { await service.dispose() }
    finally { await domain.close() }
  }, 'balance: queries and history')
  try { await service.await() }
  catch (error) { await engine.close(); await domain.close(); throw error }
}
