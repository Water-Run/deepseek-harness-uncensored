/** Serial, account-scoped sampling; no credential or raw response enters the stored history. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AccountClientMetadata } from '@deepseek-ai/dsh-deepseek-account/types'
import type { BalanceAutoCleanup, BalanceCleanupRequest, BalanceSample, BalanceSnapshot, BalanceWallet } from './types.ts'

/** One credential generation resolved on the Host. */
export interface BalanceIdentity {
  readonly key: string
  readonly account: 'account' | 'api-key'
  readonly query: (signal: AbortSignal) => Promise<readonly BalanceWallet[] | null>
  readonly current: () => Promise<boolean>
}

/** Runtime retention policy read from the live sampling preferences. */
export interface BalanceRetention {
  readonly mode: BalanceAutoCleanup
  readonly count: number
  readonly days: number
}

/** IO owned by one installed balance provider. */
export interface BalanceEngineOptions {
  readonly identify: (client: AccountClientMetadata, refreshIdentity: boolean) => Promise<BalanceIdentity | null>
  readonly read: (key: string) => readonly BalanceSample[] | undefined
  readonly write: (key: string, samples: readonly BalanceSample[]) => Promise<void>
  readonly limit: number
  readonly timeoutMs: number
  readonly displayLimit: number
  readonly retention: () => BalanceRetention
  readonly now: () => number
}

/** Milliseconds in one retained day. */
const DAY_MS = 86_400_000

/**
 * Apply the automatic retention policy to samples about to be written.
 * An age window always keeps the newest sample, so history never empties itself
 * merely because sampling paused for longer than the window.
 * @param samples - Samples that would otherwise be stored, oldest first.
 * @param retention - Live policy from the sampling preferences.
 * @param now - Sampling instant used as the age cutoff.
 * @returns The samples to store.
 */
export function retainSamples(samples: readonly BalanceSample[], retention: BalanceRetention, now: number): readonly BalanceSample[] {
  if (retention.mode === 'count') return samples.slice(-Math.max(2, Math.floor(retention.count)))
  if (retention.mode === 'age') {
    const cutoff = now - Math.max(1, Math.floor(retention.days)) * DAY_MS
    const kept = samples.filter(sample => sample.time >= cutoff)
    return kept.length > 0 ? kept : samples.slice(-1)
  }
  return samples
}

/**
 * Apply one manual cleanup request.
 * @param samples - Stored samples, oldest first.
 * @param request - Requested cleanup mode and its bound.
 * @param now - Cleanup instant used as the age cutoff.
 * @returns The samples to keep.
 */
export function cleanSamples(samples: readonly BalanceSample[], request: BalanceCleanupRequest, now: number): readonly BalanceSample[] {
  switch (request.mode) {
    case 'all': return []
    case 'count': return samples.slice(-Math.max(1, Math.floor(request.keep)))
    case 'age': {
      const cutoff = now - Math.max(1, Math.floor(request.days)) * DAY_MS
      const kept = samples.filter(sample => sample.time >= cutoff)
      return kept.length > 0 ? kept : samples.slice(-1)
    }
    default: {
      const unreachable: never = request
      return unreachable
    }
  }
}

/** Accepted API decimal strings, bounded before numeric chart conversion. */
export const balanceAmount = z.string().max(64).regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u)
  .refine(value => Number.isFinite(Number(value)))

/** Schema used at both API and durable history reads. */
export const balanceSample = z.object({
  time: z.number().int().nonnegative(),
  wallets: z.array(z.object({ currency: z.enum(['CNY', 'USD']), toppedUp: balanceAmount, granted: balanceAmount }).strict()).max(2),
}).strict()

/**
 * Keep account and API-key identities out of local history filenames.
 * @param value - Host-only account/issuer or API-key identity.
 * @returns Opaque local storage key.
 */
export function balanceStorageKey(value: string): string { return createHash('sha256').update(value).digest('hex') }

function atIndex<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Balance history index ${index} is out of range`)
  return item
}

function increased(previous: BalanceSample, current: BalanceSample): boolean {
  return current.wallets.some((wallet) => {
    const prior = previous.wallets.find(entry => entry.currency === wallet.currency)
    return prior !== undefined && Number(wallet.toppedUp) + Number(wallet.granted) > Number(prior.toppedUp) + Number(prior.granted)
  })
}

function displaySamples(samples: readonly BalanceSample[], limit: number): readonly BalanceSample[] {
  if (samples.length <= limit) return samples
  const last = samples.length - 1
  const selected = new Set([0, last])
  for (let index = last; index > 0 && selected.size < limit; index -= 1) {
    const needed = Number(!selected.has(index - 1)) + Number(!selected.has(index))
    if (needed > limit - selected.size || !increased(atIndex(samples, index - 1), atIndex(samples, index))) continue
    selected.add(index - 1)
    selected.add(index)
  }
  const remaining = limit - selected.size
  if (remaining > 0) {
    const available = samples.map((_sample, index) => index).filter(index => !selected.has(index))
    for (let index = 1; index <= remaining; index += 1) {
      const offset = Math.round(index * (available.length + 1) / (remaining + 1)) - 1
      selected.add(atIndex(available, offset))
    }
  }
  return samples.filter((_sample, index) => selected.has(index))
}

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
    const operation = this.tail.then(() => this.query(client, source)).then(result => ({
      ...result,
      sampleCount: result.samples.length,
      samples: displaySamples(result.samples, this.options.displayLimit),
    }))
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
      const now = this.options.now()
      const sample = balanceSample.parse({ time: now, wallets })
      const next = retainSamples([...samples, sample].slice(-this.options.limit), this.options.retention(), now)
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

  /**
   * Remove stored samples under the current identity.
   * @param client - Request identity used by the account provider.
   * @param request - Cleanup mode and its bound.
   * @returns The remaining history under the same shape as a local read.
   */
  clear(client: AccountClientMetadata, request: BalanceCleanupRequest): Promise<BalanceSnapshot> {
    const operation = this.tail.then(() => this.remove(client, request)).then(result => ({
      ...result,
      sampleCount: result.samples.length,
      samples: displaySamples(result.samples, this.options.displayLimit),
    }))
    this.tail = operation.then(() => undefined, () => undefined)
    return operation
  }

  private async remove(client: AccountClientMetadata, request: BalanceCleanupRequest): Promise<Omit<BalanceSnapshot, 'sampleCount'>> {
    let samples: readonly BalanceSample[] = []
    try {
      this.lifetime.signal.throwIfAborted()
      const identity = await this.options.identify(client, false)
      if (identity === null) return { status: 'signed-out', source: 'local', account: null, samples }
      samples = this.options.read(identity.key) ?? []
      const next = cleanSamples(samples, request, this.options.now())
      this.lifetime.signal.throwIfAborted()
      await this.options.write(identity.key, next)
      return { status: next.length === 0 ? 'empty' : 'ready', source: 'local', account: identity.account, samples: next }
    } catch (_error) {
      return { status: 'unavailable', source: 'local', account: null, samples: [], error: 'storage' }
    }
  }
}
