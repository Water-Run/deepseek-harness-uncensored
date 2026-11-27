import { z } from 'zod';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SpendPauseId, SpendPeriod, SpendPreferences, SpendReservationId, SpendSnapshot, SpendWindowUpdate } from './types.ts';
/** Integer micro-CNY keeps parallel reservation arithmetic exact. */
export declare const MICRO_CNY = 1000000;
/** Durable ledger schema; newer files are rejected instead of reset. */
export declare const SCHEMA_VERSION = 3;
/** Fixed rolling periods exposed by the product. */
export declare const SPEND_PERIODS: Readonly<Record<SpendPeriod, number>>;
/** Defaults apply only when the independent ledger is first created. */
export declare const DEFAULT_PREFERENCES: SpendPreferences;
/** Validation for both remote writes and persisted preferences. */
export declare const preferencesSchema: z.ZodObject<{
    enabledPeriods: z.ZodArray<z.ZodEnum<{
        "15m": "15m";
        "1h": "1h";
        "5h": "5h";
        "1d": "1d";
        "7d": "7d";
        "30d": "30d";
    }>>;
    autoResume: z.ZodBoolean;
    limits: z.ZodObject<{
        '15m': z.ZodNumber;
        '1h': z.ZodNumber;
        '5h': z.ZodNumber;
        '1d': z.ZodNumber;
        '7d': z.ZodNumber;
        '30d': z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
/** One recoverable pause claimed exclusively by this ledger handle. */
export interface SpendPauseClaim {
    readonly id: SpendPauseId;
    readonly sessionId: SessionId;
}
/** Admission result; a waiting result has no network or reservation side effects. */
export type SpendAdmission = {
    kind: 'disabled';
} | {
    kind: 'reserved';
    id: SpendReservationId;
} | {
    kind: 'waiting';
    reason: 'paused' | 'limit';
} | {
    kind: 'too-large';
};
declare function alive(pid: number): boolean;
/**
 * Synchronous SQL transactions exclude other processes during admission and settlement.
 * Pending requests never age out. A dead owner becomes an uncertain charge at recovery time.
 */
export declare class SpendLedger {
    private readonly db;
    private readonly now;
    private readonly isAlive;
    private readonly owner;
    private closed;
    private constructor();
    /**
     * Open an independent ledger; malformed or unsupported data fails without resetting totals.
     * @param path - Local SQLite filename, or :memory: for isolated tests.
     * @param now - Wall clock used for rolling windows.
     * @param isAlive - Local process liveness check; permission failures count as alive.
     * @returns An owned handle; callers must drain requests before closing it.
     */
    static open(path: string, now?: () => number, isAlive?: typeof alive): Promise<SpendLedger>;
    private transaction;
    private settings;
    private writeSettings;
    private entries;
    private pauseRows;
    private pauses;
    private resumeAt;
    private snapshotAt;
    /**
     * Read current rolling totals and recover dead owners.
     * @param waiting - Locally queued requests.
     * @returns Totals read in one transaction.
     */
    snapshot(waiting?: number): SpendSnapshot;
    /**
     * Reserve before dispatch. No-auto-resume exhaustion latches until resume, reset, or disable.
     * @param microCny - Conservative maximum request estimate, in integer micro-CNY.
     * @returns The committed reservation or a reason not to dispatch.
     */
    reserve(microCny: number): SpendAdmission;
    /**
     * Settle once. Missing complete usage retains the reservation; observed overruns pause admission.
     * @param id - Reservation issued by this handle.
     * @param microCny - Complete reported cost estimate; null denotes unknown final usage.
     */
    settle(id: SpendReservationId, microCny: number | null): void;
    /**
     * Commit user limits without discarding any charges.
     * @param value - Complete validated preferences.
     * @returns Preferences after durable commit.
     */
    configure(value: SpendPreferences): SpendSnapshot;
    /**
     * Update one window against the latest stored preferences.
     * @param update - Window and the fields to change.
     * @returns Current committed settings and totals.
     */
    configureWindow(update: SpendWindowUpdate): SpendSnapshot;
    /**
     * Save the automatic continuation policy without replacing window preferences.
     * @param enabled - Whether exhausted windows resume automatically.
     * @returns Committed settings and totals.
     */
    setAutoResume(enabled: boolean): SpendSnapshot;
    /**
     * Disable every window while retaining their limits and statistics.
     * @returns Committed settings and totals.
     */
    disableAll(): SpendSnapshot;
    private changePreferences;
    /**
     * Persist a real conversation request only after spending admission makes it wait.
     * @param sessionId - Conversation whose current request is waiting.
     * @param required - Original reservation requirement in micro-CNY.
     * @returns Stable pause identity used for exclusive recovery and replay deduplication.
     */
    waitForSession(sessionId: SessionId, required: number): SpendPauseId;
    /**
     * Retain an owned admission waiter for recovery after shutdown.
     * @param id - Owned waiter interrupted by application shutdown.
     */
    blockSession(id: SpendPauseId): void;
    /**
     * Drop a conversation pause after admission, cancellation, or deletion.
     * @param sessionId - Conversation that no longer needs continuation.
     * @param id - When present, clear only this exact waiting request.
     */
    clearSession(sessionId: SessionId, id?: SpendPauseId): void;
    /**
     * Claim blocked conversations whose original reservation fits the remaining windows.
     * Records remain durable until acknowledged; another process may reclaim only a dead claim owner.
     * @returns Exclusive claims; callers must complete or release each one.
     */
    claimBlockedSessions(): SpendPauseClaim[];
    /**
     * Read whether this handle still owns an unreplaced recovery claim.
     * @param id - Recovery claim captured before an asynchronous restoration.
     * @returns False after withdrawal, replacement, or release of the claim.
     */
    ownsClaim(id: SpendPauseId): boolean;
    /**
     * Remove an acknowledged claim only while this handle still owns it.
     * @param id - Claim whose continuation was accepted or whose session was deleted.
     */
    completeClaim(id: SpendPauseId): void;
    /**
     * Release an owned claim without discarding the pause or a newer replacement.
     * @param id - Claim that could not continue and must remain available for retry.
     */
    releaseClaim(id: SpendPauseId): void;
    /** Clear the manual pause without bypassing any remaining window limit. */
    resume(): void;
    /**
     * Reset completed statistics while preserving every active request reservation.
     * @param period - One window to reset; omission resets every window.
     */
    reset(period?: SpendPeriod): void;
    /** Retain unsettled owned requests as uncertain charges, then release the database. */
    close(): void;
}
export {};
//# sourceMappingURL=ledger.d.ts.map