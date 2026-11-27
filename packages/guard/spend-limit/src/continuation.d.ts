/** Owned recovery of durable spending pauses through the conversation's normal lifecycle owner. */
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type ContextFormed, type UserMessage } from '@deepseek-ai/dsh-llm';
import type { SpendGate } from './gate.ts';
import type { SpendPauseClaim } from './ledger.ts';
import type { SpendPauseId } from './types.ts';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        /** Automatic continuation; the optional identity deduplicates a recovered durable pause. */
        'spend-limit': {
            kind: 'spend-limit';
            pauseId?: SpendPauseId;
        } & ContextFormed;
    }
}
/** Whether the normal Session owner accepted continuation or needs a later retry. */
export type SpendContinuation = 'continued' | 'running' | 'missing' | 'unavailable';
/** Restored Agent and the durability barrier owned by its persistence provider. */
export interface SpendContinuationTarget {
    readonly agent: Agent;
    /**
     * Commit queued continuation records before acknowledging their ledger claim.
     * @returns After the queued continuation is durably recorded.
     */
    flush(): Promise<void>;
}
/** A provider restores the correct mode, workspace and ownership before delivering the continuation. */
export type SpendContinuationHandler = (claim: SpendPauseClaim, signal: AbortSignal) => Promise<SpendContinuationTarget | 'missing' | 'unavailable'>;
/**
 * Create a logged system-origin notice for the pending task.
 * @param pauseId - Durable pause identity, preserved across recovery attempts.
 * @returns The notice delivered only after spending capacity becomes available.
 */
export declare function spendContinuationMessage(pauseId: SpendPauseId): UserMessage;
/**
 * Queue a recovered pause at most once in one Session log, including after a crash before ledger acknowledgement.
 * @param agent - Agent restored by its normal owner.
 * @param claim - The exclusively claimed pause.
 * @returns Whether this task was accepted or is already running.
 */
export declare function queueSpendContinuation(agent: Agent, claim: SpendPauseClaim): SpendContinuation;
/** One serialized recovery worker whose disposer drains all provider calls before the ledger closes. */
export declare class SpendRecovery {
    private readonly report;
    private provider;
    private active;
    private closed;
    /** @param report - Visible owner-level reporting for retained pauses that could not resume. */
    constructor(report: (error: unknown) => void);
    /**
     * Install one conversation lifecycle owner.
     * @param handler - Restores and queues through the normal conversation path.
     * @param capture - Whether this provider owns the live conversation and can restore its composition.
     * @returns A disposer that cancels and drains calls before the provider unloads.
     */
    register(handler: SpendContinuationHandler, capture: (id: SessionId) => boolean): () => Promise<void>;
    /**
     * Check whether the registered lifecycle owner can recover this live conversation.
     * @param id - Session whose request is about to wait.
     * @returns False for unowned runtimes and after provider disposal.
     */
    canCapture(id: SessionId): boolean;
    /**
     * Run or join one recovery pass without overlapping another provider call.
     * @param gate - Open ledger and admission owner.
     * @returns Completion of the shared recovery pass.
     */
    flush(gate: SpendGate): Promise<void>;
    /** Stop new recovery and drain the active provider call before releasing its dependencies. */
    close(): Promise<void>;
}
//# sourceMappingURL=continuation.d.ts.map