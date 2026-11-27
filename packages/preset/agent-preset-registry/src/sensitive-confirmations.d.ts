import type { SensitiveConfirmationChallenge, SensitiveConfirmationChallengeId } from './types.ts';
/** Reading interval required before the confirmations can be turned off. */
export declare const SENSITIVE_CONFIRMATION_WAIT_MS = 10000;
/** Maximum time between opening a challenge and consuming it. */
export declare const SENSITIVE_CONFIRMATION_CHALLENGE_LIFETIME_MS = 300000;
/**
 * One pending preference change.
 *
 * Disabling confirmations removes the guard from every later sensitive action,
 * so the Host holds the request for a monotonic reading interval. Re-enabling
 * restores the guard and therefore commits immediately. The committed value is
 * persisted by the registry; this class only decides when a change may land.
 */
export declare class SensitiveConfirmationPermission {
    private readonly configured;
    private readonly now;
    private challenge;
    /**
     * @param configured - Persisted preference, read live so a settings edit lands without a restart.
     * @param now - Monotonic clock used for the reading interval and challenge lifetime.
     */
    constructor(configured: () => boolean, now?: () => number);
    /**
     * Read the effective preference.
     * @returns Whether sensitive actions ask for confirmation.
     */
    read(): boolean;
    /**
     * Open the acknowledgement a preference change needs.
     * @param confirmations - Preference the change will commit.
     * @returns Challenge carrying the reading duration; enabling needs none.
     */
    begin(confirmations: boolean): SensitiveConfirmationChallenge;
    /**
     * Consume the challenge after its reading interval.
     * @param id - Challenge returned by begin.
     * @returns The preference the Owner confirmed.
     * @throws RemoteError `agent-preset/confirmation` when the challenge is absent, replaced, expired, or early.
     */
    confirm(id: SensitiveConfirmationChallengeId): boolean;
    /** Drop a pending change without committing it. */
    invalidate(): void;
}
//# sourceMappingURL=sensitive-confirmations.d.ts.map