/** Serial, account-scoped sampling; no credential or raw response enters the stored history. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AccountClientMetadata } from '@deepseek-ai/dsh-deepseek-account/types'
import type { BalanceSample, BalanceSnapshot, BalanceWallet } from './types.ts'

/** One credential generation resolved on the Host. */
export interface BalanceIdentity {
  readonly key: string
  readonly account: 'account' | 'api-key'
  readonly query: (signal: AbortSignal) => Promise<readonly BalanceWallet[] | null>
  readonly current: () => Promise<boolean>
}

/** IO owned by one installed balance provider. */
export interface BalanceEngineOptions {
  readonly identify: (client: AccountClientMetadata, refreshIdentity: boolean) => Promise<BalanceIdentity | null>
  readonly read: (key: string) => readonly BalanceSample[] | undefined
  readonly write: (key: string, samples: readonly BalanceSample[]) => Promise<void>
  readonly limit: number
  readonly timeoutMs: number
  readonly displayLimit: number
  readonly now: () => number
}

/** Accepted API decimal strings, bounded before numeric chart conversion. */
export const balanceAmount = z.string().max(64).regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u)
  .refine(value => Number.isFinite(Number(value)))

/** Schema used at both API and durable history reads. */
export const balanceSample = z.object({
  time: z.number().int().nonnegative(),
  wallets: z.array(z.object({ currency: z.enum(['CNY', 'USD']), toppedUp: balanceAmount, granted: balanceAmount }).strict()).max(2),
}).strict()

/** @param value - Host-only account/issuer or API-key identity. @returns Opaque local storage key. */
export function balanceStorageKey(value: string): string { return createHash('sha256').update(value).digest('hex') }

/** Owns sampling, credential-change checks, and write settlement before disposal. */
export class BalanceEngine {
  private readonly lifetime = new AbortController()
  private tail: Promise<void> = Promise.resolve()
  /** @param options - Provider-owned IO and validated limits. */
  constructor(private readonly options: BalanceEngineOptions) {}

  /**
   * Read cached history or append one successful API sample.
   * @param client - Request identity used by the account provider.
   * @param source - Local history only, or a fresh API observation.
   * @returns Credential-free state; failures never fabricate a zero balance.
   */
  read(client: AccountClientMetadata, source: 'local' | 'api'): Promise<BalanceSnapshot> {
    const operation = this.tail.then(() => this.query(client, source)).then((result) => {
      const count = result.samples.length
      const limit = this.options.displayLimit
      const indexes = new Set(Array.from({ length: limit }, (_, index) => Math.round(index * (count - 1) / (limit - 1))))
      return { ...result, sampleCount: count,
        samples: count <= limit ? result.samples : result.samples.filter((_sample, index) => indexes.has(index)),
      }
    })
    this.tail = operation.then(() => undefined, () => undefined)
    return operation
  }

  private async query(client: AccountClientMetadata, source: 'local' | 'api'): Promise<Omit<BalanceSnapshot, 'sampleCount'>> {
    let samples: readonly BalanceSample[] = []
    let account: BalanceSnapshot['account'] = null
    let failure: 'request' | 'storage' = 'request'
    try {
      this.lifetime.signal.throwIfAborted()
      const identity = await this.options.identify(client, source === 'api')
      if (identity === null) return { status: 'signed-out', source, account, samples }
      account = identity.account
      failure = 'storage'
      samples = this.options.read(identity.key) ?? []
      if (source === 'local') return { status: samples.length === 0 ? 'empty' : 'ready', source, account, samples }
      failure = 'request'
      const wallets = await identity.query(AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.options.timeoutMs)]))
      this.lifetime.signal.throwIfAborted()
      if (wallets === null || !await identity.current()) return { status: 'unavailable', source, account: null, samples: [], error: 'changed' }
      const sample = balanceSample.parse({ time: this.options.now(), wallets })
      const next = [...samples, sample].slice(-this.options.limit)
      failure = 'storage'
      this.lifetime.signal.throwIfAborted()
      await this.options.write(identity.key, next)
      return { status: 'ready', source, account, samples: next }
    } catch (_error) {
      return { status: 'unavailable', source, account, samples, error: failure }
    }
  }

  /** Stop admission and await every query and durable write before storage closes. @returns Quiescent completion. */
  async close(): Promise<void> { this.lifetime.abort(); await this.tail }
}
