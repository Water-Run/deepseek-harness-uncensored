/** Preference deciding whether sensitive actions still ask for an interactive confirmation. */
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { brandString } from '@deepseek-ai/dsh-brand'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SensitiveConfirmationChallenge, SensitiveConfirmationChallengeId } from './types.ts'

/** Reading interval required before the confirmations can be turned off. */
export const SENSITIVE_CONFIRMATION_WAIT_MS = 10_000
/** Maximum time between opening a challenge and consuming it. */
export const SENSITIVE_CONFIRMATION_CHALLENGE_LIFETIME_MS = 300_000

interface PendingChallenge {
  readonly id: SensitiveConfirmationChallengeId
  readonly confirmations: boolean
  readonly started: number
}

/**
 * One pending preference change.
 *
 * Disabling confirmations removes the guard from every later sensitive action,
 * so the Host holds the request for a monotonic reading interval. Re-enabling
 * restores the guard and therefore commits immediately. The committed value is
 * persisted by the registry; this class only decides when a change may land.
 */
export class SensitiveConfirmationPermission {
  private challenge: PendingChallenge | undefined

  /**
   * @param configured - Persisted preference, read live so a settings edit lands without a restart.
   * @param now - Monotonic clock used for the reading interval and challenge lifetime.
   */
  constructor(private readonly configured: () => boolean, private readonly now: () => number = () => performance.now()) {}

  /**
   * Read the effective preference.
   * @returns Whether sensitive actions ask for confirmation.
   */
  read(): boolean { return this.configured() }

  /**
   * Open the acknowledgement a preference change needs.
   * @param confirmations - Preference the change will commit.
   * @returns Challenge carrying the reading duration; enabling needs none.
   */
  begin(confirmations: boolean): SensitiveConfirmationChallenge {
    const id = brandString<SensitiveConfirmationChallengeId>(randomUUID())
    this.challenge = { id, confirmations, started: this.now() }
    return { id, confirmations, waitMs: confirmations ? 0 : SENSITIVE_CONFIRMATION_WAIT_MS }
  }

  /**
   * Consume the challenge after its reading interval.
   * @param id - Challenge returned by begin.
   * @returns The preference the Owner confirmed.
   * @throws RemoteError `agent-preset/confirmation` when the challenge is absent, replaced, expired, or early.
   */
  confirm(id: SensitiveConfirmationChallengeId): boolean {
    const challenge = this.challenge
    if (challenge === undefined || challenge.id !== id) {
      throw new RemoteError('agent-preset/confirmation', 'Open the confirmation again.', { remainingMs: 0 })
    }
    const elapsed = this.now() - challenge.started
    if (elapsed > SENSITIVE_CONFIRMATION_CHALLENGE_LIFETIME_MS) {
      this.challenge = undefined
      throw new RemoteError('agent-preset/confirmation', 'The confirmation expired. Open it again.', { remainingMs: 0 })
    }
    const waitMs = challenge.confirmations ? 0 : SENSITIVE_CONFIRMATION_WAIT_MS
    if (elapsed < waitMs) {
      throw new RemoteError('agent-preset/confirmation', 'Wait for the confirmation countdown.', { remainingMs: Math.ceil(waitMs - elapsed) })
    }
    this.challenge = undefined
    return challenge.confirmations
  }

  /** Drop a pending change without committing it. */
  invalidate(): void { this.challenge = undefined }
}
