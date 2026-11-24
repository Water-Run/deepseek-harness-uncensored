/**
 * Durable vocabulary of the refusal-retry guard.
 *
 * @module @deepseek-ai/dsh-refusal-retry/types
 */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'

/** What one answer looks like after the guard's classifier runs. */
export type RefusalVerdict = 'refused' | 'partial_refused' | 'empty_after_retry' | 'delivered'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** A guard-scheduled continuation; the label keeps derived history from reading it as a user prompt. */
    'refusal-retry': { kind: 'refusal-retry'; arm: number } & ContextFormed
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * One retry arm was scheduled because the previous answer refused instead of
     * delivering. Log-only audit: it records the turn, the arm, the verdict that
     * triggered it, and the refused answer's length, so cost and outcome stay
     * reconstructable from the session.
     */
    'refusal/retry': {
      turn: number
      arm: number
      verdict: RefusalVerdict
      chars: number
    }
  }
}
