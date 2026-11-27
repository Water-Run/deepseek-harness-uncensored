import type { ModeSwitchChallenge, ModeSwitchChallengeId, ModeSwitchPolicy } from './types.ts';
/** Owns one active confirmation and the permission granted during this Host lifetime. */
export declare class ModeSwitchPermission {
    private readonly now;
    private allowed;
    private challenge;
    /**
   * @param now - Monotonic clock used for the mandatory reading interval.
   */
    constructor(now?: () => number);
    /**
   * Read runtime permission.
   * @returns Current permission without persisted configuration values.
   */
    read(): ModeSwitchPolicy;
    /**
   * Start a new reading interval.
   * @param waitMs - Reading duration the owner requires; zero when no confirmation is asked for.
   * @returns An acknowledgement replacing any earlier unconfirmed request.
   */
    begin(waitMs?: number): ModeSwitchChallenge;
    /**
     * Enable switching after the reading interval; consume the acknowledgement exactly once.
     * @param id - Exact acknowledgement issued to the owner.
     * @returns Enabled runtime policy.
     */
    confirm(id: ModeSwitchChallengeId): ModeSwitchPolicy;
    /**
   * Revoke permission and the pending acknowledgement.
   * @returns Disabled policy.
   */
    disable(): ModeSwitchPolicy;
}
//# sourceMappingURL=switch-policy.d.ts.map