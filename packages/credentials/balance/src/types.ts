/** Credential-free balance observations exposed to the application. */
export interface BalanceWallet {
  readonly currency: 'CNY' | 'USD'
  readonly toppedUp: string
  readonly granted: string
}

/** One successful balance observation, never an estimated debit. */
export interface BalanceSample {
  readonly time: number
  readonly wallets: readonly BalanceWallet[]
}

/** Automatic retention applied when a new sample is written. */
export type BalanceAutoCleanup = 'off' | 'count' | 'age'

/** How one manual cleanup removes stored samples. */
export type BalanceCleanupRequest =
  | { readonly mode: 'all' }
  | { readonly mode: 'count'; readonly keep: number }
  | { readonly mode: 'age'; readonly days: number }

/** Local sampling preferences persisted with the application's settings. */
export interface BalancePreferences {
  readonly enabled: boolean
  readonly refreshSeconds: number
  readonly source: 'local' | 'api'
  /** Automatic cleanup mode applied while sampling. */
  readonly autoCleanup: BalanceAutoCleanup
  /** Samples kept, newest first, when `autoCleanup` is `count`. */
  readonly retainCount: number
  /** Days of history kept when `autoCleanup` is `age`. */
  readonly retainDays: number
}

/** Query state retains prior observations when the API or storage is unavailable. */
export interface BalanceSnapshot {
  readonly status: 'ready' | 'empty' | 'signed-out' | 'disabled' | 'unavailable'
  readonly source: 'local' | 'api'
  readonly account: 'account' | 'api-key' | null
  readonly samples: readonly BalanceSample[]
  readonly sampleCount: number
  readonly error?: 'request' | 'storage' | 'changed'
}
