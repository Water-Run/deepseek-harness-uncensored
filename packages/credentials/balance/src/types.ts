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

/** Local sampling preferences persisted with the application's settings. */
export interface BalancePreferences {
  readonly enabled: boolean
  readonly refreshSeconds: number
  readonly source: 'local' | 'api'
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
