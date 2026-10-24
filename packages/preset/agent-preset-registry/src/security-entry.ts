/** Runtime-only first-entry acknowledgement for new Security conversations. */
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { brandString } from '@deepseek-ai/dsh-brand'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SecurityEntryChallenge, SecurityEntryChallengeId, SecurityEntryLocale, SecurityProtectionStatus,
} from './types.ts'

/** Reading interval required before any acknowledgement. */
export const SECURITY_ENTRY_WAIT_MS = 10_000
/** Maximum time between opening a challenge and consuming it. */
export const SECURITY_ENTRY_CHALLENGE_LIFETIME_MS = 300_000

/** Status reported when no protection backend answers. */
export const UNAVAILABLE_PROTECTION: SecurityProtectionStatus = Object.freeze({
  state: 'unavailable', revision: 0, capabilities: Object.freeze([]),
})

const DECLARATIONS: Readonly<Record<SecurityEntryLocale, string>> = Object.freeze({
  zh: '我确认已获得相应操作授权，并了解当前保护未启用',
  en: 'I confirm I have the required authorization and understand that protection is not enabled',
})

/**
 * Declaration the Host accepts for one locale.
 * @param locale - Language requested by the confirmation dialog.
 * @returns Exact statement the client must display and the Host must receive.
 */
export function securityEntryDeclaration(locale: SecurityEntryLocale): string { return DECLARATIONS[locale] }

interface PendingChallenge {
  readonly id: SecurityEntryChallengeId
  readonly sessionId: SessionId
  readonly started: number
  readonly protection: SecurityProtectionStatus
  readonly declaration: string
}

/** Runtime acknowledgement and live protection, before deployment policy is applied. */
export interface SecurityEntryPermissionState {
  /** Whether this Host lifetime already acknowledged the first entry. */
  readonly acknowledged: boolean
  /** Live protection state at read time. */
  readonly protection: SecurityProtectionStatus
}

/**
 * Whether two protection snapshots describe the same conditions.
 * @param left - Snapshot recorded with the challenge.
 * @param right - Snapshot read at confirmation time.
 * @returns true when state, revision, and capabilities are unchanged.
 */
export function sameProtection(left: SecurityProtectionStatus, right: SecurityProtectionStatus): boolean {
  return left.state === right.state && left.revision === right.revision
    && left.capabilities.length === right.capabilities.length
    && left.capabilities.every((capability, index) => capability === right.capabilities[index])
}

/**
 * One Host-lifetime acknowledgement and at most one pending challenge.
 *
 * The clock is monotonic so a client cannot shorten the reading interval by
 * changing system time. Every challenge is single-use and bound to one session
 * and one protection snapshot.
 */
export class SecurityEntryPermission {
  private acknowledged = false
  private challenge: PendingChallenge | undefined

  /**
   * @param protection - Reads the live protection provider state.
   * @param now - Monotonic clock used for the reading interval and challenge lifetime.
   */
  constructor(private readonly protection: () => SecurityProtectionStatus,
    private readonly now: () => number = () => performance.now()) {}

  /**
   * Read this launch's acknowledgement alongside the current protection state.
   * @returns Current runtime acknowledgement and live protection state.
   */
  read(): SecurityEntryPermissionState {
    return { acknowledged: this.acknowledged, protection: this.protection() }
  }

  /**
   * Open one challenge for a new main conversation.
   * @param sessionId - New conversation the challenge belongs to.
   * @param locale - Language of the declaration the Host will accept.
   * @returns Challenge carrying the live protection snapshot.
   */
  begin(sessionId: SessionId, locale: SecurityEntryLocale): SecurityEntryChallenge {
    const protection = this.protection()
    const id = brandString<SecurityEntryChallengeId>(randomUUID())
    const declaration = protection.state === 'enabled' ? '' : securityEntryDeclaration(locale)
    this.challenge = { id, sessionId, started: this.now(), protection, declaration }
    return { id, waitMs: SECURITY_ENTRY_WAIT_MS, declaration, protection }
  }

  /**
   * Consume the challenge after the reading interval and any declaration.
   * @param sessionId - Conversation the caller is confirming.
   * @param id - Challenge issued by begin.
   * @param declaration - Typed declaration; empty only when protection is enabled.
   * @returns Acknowledged runtime state.
   * @throws RemoteError `security-entry/consumed` when this Host already acknowledged the launch.
   * @throws RemoteError `security-entry/confirmation` when the challenge is absent or expired.
   * @throws RemoteError `security-entry/session` when the challenge belongs to another conversation.
   * @throws RemoteError `security-entry/changed` when protection changed after the challenge.
   * @throws RemoteError `security-entry/wait` before the reading interval elapsed.
   * @throws RemoteError `security-entry/declaration` when the NFKC-normalized statement does not match.
   */
  confirm(sessionId: SessionId, id: SecurityEntryChallengeId, declaration: string): SecurityEntryPermissionState {
    if (this.acknowledged) {
      throw new RemoteError('security-entry/consumed', 'The security-mode notice is already confirmed for this launch.', { acknowledged: true })
    }
    const challenge = this.challenge
    if (challenge === undefined || challenge.id !== id) {
      throw new RemoteError('security-entry/confirmation', 'Open the confirmation again.', { remainingMs: 0 })
    }
    const elapsed = this.now() - challenge.started
    if (elapsed > SECURITY_ENTRY_CHALLENGE_LIFETIME_MS) {
      this.challenge = undefined
      throw new RemoteError('security-entry/confirmation', 'The confirmation expired. Open it again.', { remainingMs: 0 })
    }
    if (challenge.sessionId !== sessionId) {
      throw new RemoteError('security-entry/session', 'This confirmation belongs to another conversation.', { sessionId: challenge.sessionId })
    }
    const protection = this.protection()
    if (!sameProtection(challenge.protection, protection)) {
      this.challenge = undefined
      throw new RemoteError('security-entry/changed', 'Protection changed while the confirmation was open. Read the updated status and confirm again.', { protection })
    }
    if (elapsed < SECURITY_ENTRY_WAIT_MS) {
      throw new RemoteError('security-entry/wait', 'Wait for the confirmation countdown.', { remainingMs: Math.ceil(SECURITY_ENTRY_WAIT_MS - elapsed) })
    }
    if (challenge.declaration !== '' && declaration.normalize('NFKC').trim() !== challenge.declaration.normalize('NFKC')) {
      throw new RemoteError('security-entry/declaration', 'Type the declaration exactly as shown.', { declaration: challenge.declaration })
    }
    this.challenge = undefined
    this.acknowledged = true
    return this.read()
  }

  /**
   * Drop one pending challenge without granting the acknowledgement.
   * @param id - Challenge to cancel; an absent or replaced identity is ignored.
   * @returns Current runtime state.
   */
  cancel(id: SecurityEntryChallengeId): SecurityEntryPermissionState {
    if (this.challenge?.id === id) this.challenge = undefined
    return this.read()
  }

  /** Drop a pending challenge whose protection conditions changed. */
  invalidate(): void { this.challenge = undefined }
}
