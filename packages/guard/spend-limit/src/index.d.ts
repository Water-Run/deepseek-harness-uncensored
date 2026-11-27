/** Built-in spending admission for model streams and DeepSeek native search. */
import type { Context } from '@deepseek-ai/cordis';
import schema from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { SpendRecovery, type SpendContinuationHandler } from './continuation.ts';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { SpendGate } from './gate.ts';
import type { SessionSpendUsage, SpendPeriod, SpendPreferences, SpendRate, SpendSnapshot, SpendWindowUpdate } from './types.ts';
export type * from './types.ts';
/** Deployment-owned ledger path and conservative rates. User limits live in the ledger. */
export interface Config {
    /** SQLite ledger path, independent of individual conversations. */
    path: string;
    /** Interval in milliseconds for rechecking waiting requests and durable pauses. */
    pollMs: number;
    /** Provider/model rates used for reservations and settlement estimates. */
    rates: SpendRate[];
}
/** All deployment-varying rates are configurable without changing source. */
export declare const Config: schema<Schemastery.ObjectS<NoInfer<{
    path: schema<string, string, "defined">;
    pollMs: schema<number, number, "defined">;
    rates: schema<({
        providers?: string[] | null;
        models?: string[] | null;
        input?: number | null;
        cachedInput?: number | null;
        cacheWrite?: number | null;
        output?: number | null;
        contextTokens?: number | null;
        maxOutputTokens?: number | null;
        searchRequest?: number | null;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        providers: schema<string[], string[], "defined">;
        models: schema<string[], string[], "defined">;
        input: schema<number, number, "defined">;
        cachedInput: schema<number, number, "defined">;
        cacheWrite: schema<number, number, "defined">;
        output: schema<number, number, "defined">;
        contextTokens: schema<number, number, "defined">;
        maxOutputTokens: schema<number, number, "defined">;
        searchRequest: schema<number, number, "defined">;
    }>>[], "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    path: schema<string, string, "defined">;
    pollMs: schema<number, number, "defined">;
    rates: schema<({
        providers?: string[] | null;
        models?: string[] | null;
        input?: number | null;
        cachedInput?: number | null;
        cacheWrite?: number | null;
        output?: number | null;
        contextTokens?: number | null;
        maxOutputTokens?: number | null;
        searchRequest?: number | null;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        providers: schema<string[], string[], "defined">;
        models: schema<string[], string[], "defined">;
        input: schema<number, number, "defined">;
        cachedInput: schema<number, number, "defined">;
        cacheWrite: schema<number, number, "defined">;
        output: schema<number, number, "defined">;
        contextTokens: schema<number, number, "defined">;
        maxOutputTokens: schema<number, number, "defined">;
        searchRequest: schema<number, number, "defined">;
    }>>[], "defined">;
}>>, "plain">;
export declare const name = "spend-limit";
export declare const inject: string[];
declare module '@deepseek-ai/cordis' {
    interface Context {
        spendLimit: SpendLimitRemote;
    }
}
interface SpendRuntime {
    ready: Promise<SpendGate>;
    recovery: SpendRecovery;
}
/** Authenticated settings and observations; no request content or credentials are stored. */
export declare class SpendLimitRemote extends TypertRemoteService {
    private readonly runtime;
    /** @param ctx - Service owner. @param runtime - Owned ledger and recovery worker. */
    constructor(ctx: Context, runtime: SpendRuntime);
    private assertOwner;
    /**
     * Register the lifecycle owner that captures and restores ordinary conversations.
     * @param handler - Normal conversation restoration path.
     * @param capture - Tests ownership of a live Session before creating a durable pause.
     * @returns Cancelling, draining registration disposer.
     */
    registerContinuation(handler: SpendContinuationHandler, capture: (id: SessionId) => boolean): () => Promise<void>;
    /**
     * Discard a conversation's saved continuation, including one awaiting restoration.
     * @param sessionId - Conversation whose pending continuation has been withdrawn.
     */
    forgetSession(sessionId: SessionId): Promise<void>;
    /**
     * Read the durable ledger; initialization failures remain visible to every caller.
     * @returns Shared limits, rolling totals and local waiters.
     */
    get(): Promise<SpendSnapshot>;
    /**
     * Read recorded estimates for a conversation and all its side generations, even when limits are off.
     * @param sessionId - Conversation to inspect; only the application owner may read it.
     * @returns CNY estimate and bounded cumulative history, with missing usage or rates counted explicitly.
     */
    sessionUsage(sessionId: SessionId): Promise<SessionSpendUsage>;
    /**
     * Save user preferences across local processes.
     * @param preferences - Complete user limits.
     * @returns Committed settings and totals.
     */
    configure(preferences: SpendPreferences): Promise<SpendSnapshot>;
    /**
     * Save one window without overwriting concurrent changes to another window.
     * @param update - Window and the settings to change.
     * @returns Committed preferences and totals.
     */
    configureWindow(update: SpendWindowUpdate): Promise<SpendSnapshot>;
    /**
     * Save the automatic continuation preference independently of window settings.
     * @param enabled - Whether paused conversations should continue when capacity returns.
     * @returns Committed preferences and totals.
     */
    setAutoResume(enabled: boolean): Promise<SpendSnapshot>;
    /**
     * Disable all windows while preserving their amounts and accounting records.
     * @returns Committed preferences and totals after eligible conversations resume.
     */
    disableAll(): Promise<SpendSnapshot>;
    /**
     * Clear manual pause.
     * @returns Updated state; remaining limits still apply.
     */
    resume(): Promise<SpendSnapshot>;
    /**
     * Clear completed statistics.
     * @param period - One rolling window; omission resets all completed statistics.
     * @returns Remaining active reservations and settings.
     */
    reset(period?: SpendPeriod): Promise<SpendSnapshot>;
}
/**
 * Install admission before provider dispatch and retain the ledger through request teardown.
 * @param ctx - Root application scope.
 * @param config - Validated deployment settings.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map