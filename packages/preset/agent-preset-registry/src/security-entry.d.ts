import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { SecurityEntryChallenge, SecurityEntryChallengeId, SecurityEntryLocale, SecurityProtectionStatus } from './types.ts';
/** Reading interval required before any acknowledgement. */
export declare const SECURITY_ENTRY_WAIT_MS = 10000;
/** Maximum time between opening a challenge and consuming it. */
export declare const SECURITY_ENTRY_CHALLENGE_LIFETIME_MS = 300000;
/** Status reported when no protection backend answers. */
export declare const UNAVAILABLE_PROTECTION: SecurityProtectionStatus;
/**
 * Declaration the Host accepts for one locale.
 * @param locale - Language requested by the confirmation dialog.
 * @returns Exact statement the client must display and the Host must receive.
 */
export declare function securityEntryDeclaration(locale: SecurityEntryLocale): string;
/** Runtime acknowledgement and live protection, before deployment policy is applied. */
export interface SecurityEntryPermissionState {
    /** Whether this Host lifetime already acknowledged the first entry. */
    readonly acknowledged: boolean;
    /** Live protection state at read time. */
    readonly protection: SecurityProtectionStatus;
}
/**
 * Whether two protection snapshots describe the same conditions.
 * @param left - Snapshot recorded with the challenge.
 * @param right - Snapshot read at confirmation time.
 * @returns true when state, revision, and capabilities are unchanged.
 */
export declare function sameProtection(left: SecurityProtectionStatus, right: SecurityProtectionStatus): boolean;
/**
 * One Host-lifetime acknowledgement and at most one pending challenge.
 *
 * The clock is monotonic so a client cannot shorten the reading interval by
 * changing system time. Every challenge is single-use and bound to one session
 * and one protection snapshot.
 */
export declare class SecurityEntryPermission {
    private readonly protection;
    private readonly now;
    private acknowledged;
    private challenge;
    /**
     * @param protection - Reads the live protection provider state.
     * @param now - Monotonic clock used for the reading interval and challenge lifetime.
     */
    constructor(protection: () => SecurityProtectionStatus, now?: () => number);
    /**
     * Read this launch's acknowledgement alongside the current protection state.
     * @returns Current runtime acknowledgement and live protection state.
     */
    read(): SecurityEntryPermissionState;
    /**
     * Open one challenge for a new main conversation.
     * @param sessionId - New conversation the challenge belongs to.
     * @param locale - Language of the declaration the Host will accept.
     * @param waitMs - Reading duration this deployment requires; zero when no confirmation is asked for.
     * @returns Challenge carrying the live protection snapshot.
     */
    begin(sessionId: SessionId, locale: SecurityEntryLocale, waitMs?: number): SecurityEntryChallenge;
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
    confirm(sessionId: SessionId, id: SecurityEntryChallengeId, declaration: string): SecurityEntryPermissionState;
    /**
     * Drop one pending challenge without granting the acknowledgement.
     * @param id - Challenge to cancel; an absent or replaced identity is ignored.
     * @returns Current runtime state.
     */
    cancel(id: SecurityEntryChallengeId): SecurityEntryPermissionState;
    /** Drop a pending challenge whose protection conditions changed. */
    invalidate(): void;
}
//# sourceMappingURL=security-entry.d.ts.map