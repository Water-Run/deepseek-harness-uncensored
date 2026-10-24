/** Client-safe preferences and observations for the shared CNY spending ledger. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'spending/owner-required': { readonly action: string }
  }
}

/** Identity of one durable reservation; never contains credentials or prompt text. */
export type SpendReservationId = Branded<'SpendReservationId'>
/** Stable identity of a paused model request and its eventual continuation. */
export type SpendPauseId = Branded<'SpendPauseId'>
/** Rolling periods, in increasing duration. */
export type SpendPeriod = '15m' | '1h' | '5h' | '1d' | '7d' | '30d'
/** User-owned preferences shared by processes using the same Uncensored home. */
export interface SpendPreferences {
  enabled: boolean
  autoResume: boolean
  limits: Record<SpendPeriod, number>
}
/** One rolling window, with amounts expressed in CNY. */
export interface SpendWindow {
  period: SpendPeriod
  limit: number
  spent: number
  reserved: number
  uncertain: number
  remaining: number
}
/** One conversation waiting on a limit or left blocked by a dead process. */
export interface SpendPausedSession {
  sessionId: SessionId
  state: 'waiting' | 'blocked'
}
/** Durable totals and the local process's queued requests. */
export interface SpendSnapshot {
  preferences: SpendPreferences
  paused: boolean
  windows: SpendWindow[]
  pending: number
  waiting: number
  /** Conversations that must continue when capacity returns. Waiting rows belong to a live process. */
  pausedSessions: SpendPausedSession[]
  nextExpiry: number | null
  updatedAt: number
}
/** CNY prices per million tokens. Reservations use the uncached input rate. */
export interface SpendRate {
  providers: string[]
  models: string[]
  input: number
  cachedInput: number
  cacheWrite: number
  output: number
  contextTokens: number
  maxOutputTokens: number
  searchRequest: number
}
