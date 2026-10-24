/** Runtime-only acknowledgement before changing the composition of an established conversation. */
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { brandString } from '@deepseek-ai/dsh-brand'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ModeSwitchChallenge, ModeSwitchChallengeId, ModeSwitchPolicy } from './types.ts'

const READING_TIME_MS = 10_000
const CHALLENGE_LIFETIME_MS = 300_000

/** Owns one active confirmation and the permission granted during this Host lifetime. */
export class ModeSwitchPermission {
  private allowed = false
  private challenge: { id: ModeSwitchChallengeId; started: number; waitMs: number } | undefined

  /**
 * @param now - Monotonic clock used for the mandatory reading interval.
 */
  constructor(private readonly now: () => number = () => performance.now()) {}

  /**
 * Read runtime permission.
 * @returns Current permission without persisted configuration values.
 */
  read(): ModeSwitchPolicy { return { allowExistingSessionSwitch: this.allowed } }

  /**
 * Start a new reading interval.
 * @param waitMs - Reading duration the owner requires; zero when no confirmation is asked for.
 * @returns An acknowledgement replacing any earlier unconfirmed request.
 */
  begin(waitMs: number = READING_TIME_MS): ModeSwitchChallenge {
    const id = brandString<ModeSwitchChallengeId>(randomUUID())
    this.challenge = { id, started: this.now(), waitMs }
    return { id, waitMs }
  }

  /**
   * Enable switching after the reading interval; consume the acknowledgement exactly once.
   * @param id - Exact acknowledgement issued to the owner.
   * @returns Enabled runtime policy.
   */
  confirm(id: ModeSwitchChallengeId): ModeSwitchPolicy {
    const challenge = this.challenge
    const elapsed = challenge === undefined ? 0 : this.now() - challenge.started
    if (challenge === undefined || challenge.id !== id || elapsed > CHALLENGE_LIFETIME_MS) {
      throw new RemoteError('agent-preset/confirmation', 'Open the confirmation again.', { remainingMs: 0 })
    }
    if (elapsed < challenge.waitMs) {
      throw new RemoteError('agent-preset/confirmation', 'Wait for the confirmation countdown.', { remainingMs: Math.ceil(challenge.waitMs - elapsed) })
    }
    this.challenge = undefined
    this.allowed = true
    return this.read()
  }

  /**
 * Revoke permission and the pending acknowledgement.
 * @returns Disabled policy.
 */
  disable(): ModeSwitchPolicy { this.allowed = false; this.challenge = undefined; return this.read() }
}
