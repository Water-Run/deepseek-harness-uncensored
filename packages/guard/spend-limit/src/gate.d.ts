import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { SpendLedger } from './ledger.ts';
import type { SessionSpendUsage, SpendRate } from './types.ts';
import type { SessionEvent, SessionLogOffset } from '@deepseek-ai/dsh-session';
import { type SessionSpendLog } from './session-usage.ts';
/** One process's admission waiters and active requests; the ledger coordinates other processes. */
export declare class SpendGate {
    readonly ledger: SpendLedger;
    private readonly rates;
    private readonly pollMs;
    private readonly canRecover;
    private readonly lifetime;
    private readonly active;
    private waiters;
    /**
     * Bind admission to a shared ledger and its conversation recovery policy.
     * @param ledger - Owned shared ledger.
     * @param rates - Deployment prices.
     * @param pollMs - Cross-process admission polling interval.
     * @param canRecover - Whether a lifecycle provider owns this live conversation.
     */
    constructor(ledger: SpendLedger, rates: readonly SpendRate[], pollMs: number, canRecover: (id: SessionId) => boolean);
    /** Locally waiting requests, excluding requests already sent to a provider. */
    get waiting(): number;
    /**
     * Estimate recorded responses independently of the limit switch.
     * @param events - This Session's durable history.
     * @param inheritedEventCount - Exact inherited prefix length from the same observation.
     * @param related - Native side histories owned by this conversation.
     * @returns Response and retry estimates at configured rates.
     */
    sessionUsage(events: readonly SessionEvent[], inheritedEventCount: SessionLogOffset, related: readonly SessionSpendLog[]): SessionSpendUsage;
    private admit;
    private rate;
    private begin;
    /**
     * Reserve before starting the adapter and settle before exposing its terminal chunk.
     * @param request - Unmodified, logged model request.
     * @param next - Next stream middleware or adapter.
     * @returns Original chunks after durable admission; cancellation retains unknown usage.
     */
    stream(request: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk>;
    /**
     * Account for provider-specific non-streaming requests such as native search.
     * @param request - Rate route, output ceiling and maximum search uses.
     * @param send - Provider operation returning its response and complete usage, when available.
     * @param signal - Caller cancellation.
     * @returns The provider result after settlement.
     */
    call<T>(request: {
        provider: string;
        model: string;
        maxTokens: number;
        searches: number;
    }, send: () => Promise<{
        value: T;
        usage?: TokenUsage;
        searches?: number;
    }>, signal?: AbortSignal): Promise<T>;
    /** Stop admissions, cancel waiters, drain dispatched requests, and close the ledger. */
    close(): Promise<void>;
}
//# sourceMappingURL=gate.d.ts.map