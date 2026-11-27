/**
 * Bounded capture store for the security-mode egress proxy: flow identity,
 * body caps, retention, and the list/detail reads the settings surface
 * performs.
 *
 * Exchanges are stored exactly as the transport observed them: headers, target
 * URLs, and bodies keep their original bytes up to the configured body cap, so
 * the viewer shows what actually crossed the wire.
 * @module @deepseek-ai/dsh-security-proxy-local/capture
 */
import type { SecurityProxyBodyLimits, SecurityProxyFlowDetail, SecurityProxyCaptureExport, SecurityProxyExportQuery, SecurityProxyFlowKind, SecurityProxyFlowOrigin, SecurityProxyFlowQuery, SecurityProxyFlowSummary, SecurityProxyHeader } from '@deepseek-ai/dsh-security-proxy/types';
import type { SecurityProxyCaptureInput } from '@deepseek-ai/dsh-security-proxy';
/** One completed or in-flight exchange as the store keeps it. */
export interface CapturedExchange {
    readonly id: string;
    readonly at: number;
    readonly kind: SecurityProxyFlowKind;
    readonly origin: SecurityProxyFlowOrigin;
    readonly sessionId: string | null;
    readonly tool: string;
    readonly method: string;
    readonly target: string;
    readonly status: number | null;
    readonly durationMs: number | null;
    /** Bytes the peer sent for the request body, before the capture cap. */
    readonly requestBytes: number;
    /** Bytes the peer sent for the response body, before the capture cap. */
    readonly responseBytes: number;
    readonly outcome: 'complete' | 'error' | 'pending';
    readonly note: string | null;
    readonly requestHeaders: readonly SecurityProxyHeader[];
    readonly responseHeaders: readonly SecurityProxyHeader[];
    readonly requestBody: string | null;
    readonly responseBody: string | null;
    readonly bodyTruncated: boolean;
    readonly bodyLimits?: SecurityProxyBodyLimits;
    readonly contentType: string | null;
}
/** Capture limits the store enforces on every append. */
export interface CaptureLimits {
    readonly maxFlows: number;
    readonly maxBodyBytes: number;
    readonly retentionMs: number;
}
/** Everything an append supplies; identity and outcome are the store's. */
export type CapturedExchangeInput = SecurityProxyCaptureInput;
/**
 * Project one header list in peer order.
 * @param headers - raw header entries in peer order.
 * @returns the entries stored as they were observed.
 */
export declare function headerEntries(headers: readonly (readonly [string, string])[]): SecurityProxyHeader[];
/**
 * Cut text at a UTF-8 byte budget without splitting a character.
 * @param text - text to cut.
 * @param maxBytes - inclusive byte budget as a nonnegative integer.
 * @returns the prefix and whether anything was dropped.
 */
export declare function truncateBody(text: string, maxBytes: number): {
    text: string;
    truncated: boolean;
};
/**
 * Present a body for storage: kept verbatim and cut at the capture cap.
 * @param text - decoded text, or null when the caller kept no text.
 * @param maxBytes - capture cap in bytes.
 * @returns the stored body and whether a cap cut it.
 */
export declare function prepareBody(text: string | null, maxBytes: number): {
    body: string | null;
    truncated: boolean;
};
/**
 * Ring buffer of captured exchanges for one Host.
 *
 * The store keeps at most `maxFlows` entries and prunes by age; every append and
 * read prunes first, so a stale entry cannot outlive its retention window.
 */
export declare class CaptureStore {
    private readonly limits;
    private readonly now;
    private entries;
    private total;
    private retainedBytes;
    /**
     * @param limits - reads the current caps; a settings change applies to the next operation.
     * @param now - clock, injectable for retention tests.
     */
    constructor(limits: () => CaptureLimits, now?: () => number);
    /**
     * Append one exchange, applying every storage cap.
     * @param input - the exchange the transport observed.
     * @returns the stored flow, or undefined when capture is paused.
     */
    append(input: CapturedExchangeInput): CapturedExchange | undefined;
    /**
     * List retained flows newest first.
     * @param query - optional session, kind, text, and limit filters.
     * @returns matching summaries.
     */
    list(query?: SecurityProxyFlowQuery): SecurityProxyFlowSummary[];
    /**
     * Read one retained flow's complete stored value.
     * @param id - flow identity.
     * @returns the detail, or undefined when pruned or unknown.
     */
    detail(id: string): SecurityProxyFlowDetail | undefined;
    /**
     * Snapshot every matching retained record and its capture counters in one turn.
     * @param query - Filters over stored targets.
     * @param paused - Current capture setting.
     * @returns Versioned download data, newest first, without list pagination.
     */
    snapshot(query: SecurityProxyExportQuery, paused: boolean): SecurityProxyCaptureExport;
    /** Drop every retained flow. */
    clear(): void;
    /**
     * Current counters.
     * @param paused - whether new flows are currently refused.
     * @returns totals the settings surface renders.
     */
    stats(paused: boolean): {
        paused: boolean;
        total: number;
        retained: number;
        bytes: number;
    };
    /** Drop entries older than the retention window, oldest first. */
    private prune;
    /** Remove the oldest retained entry and its byte accounting. */
    private dropOldest;
}
//# sourceMappingURL=capture.d.ts.map