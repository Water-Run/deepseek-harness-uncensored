/** Credential-free balance observations exposed to the application. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Identifies the displayed account history for cleanup within one running Host. */
export type BalanceHistoryTag = Branded<'BalanceHistoryTag'>

/** Topped-up and granted amounts for a single currency in one observation. */
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

/** Period shown in the sidebar balance history, measured from the latest observation. */
export type BalanceSidebarRange = '1' | '7' | '30'

/** Local sampling preferences persisted with the application's settings. */
export interface BalancePreferences {
  readonly enabled: boolean
  readonly showInSidebar: boolean
  readonly sidebarDays: BalanceSidebarRange
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
  /** Opaque cleanup precondition for a history resolved by this Host. */
  readonly historyTag?: BalanceHistoryTag
  readonly error?: 'request' | 'storage' | 'changed'
}

/** Manual cleanup outcome, including writes completed before an account switch. */
export interface BalanceCleanupSnapshot extends BalanceSnapshot {
  /** The Host committed the cleanup to the selected history. */
  readonly cleanupApplied?: true
}
