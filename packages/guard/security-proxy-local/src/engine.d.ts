/**
 * The security-mode egress engine: one configured upstream proxy, one bounded
 * capture store, one loopback chain proxy per conversation, and the controlled
 * Client that records plaintext for the application's own HTTPS requests.
 *
 * Nothing here installs a process-wide dispatcher, changes the operating
 * system's proxy settings, or touches another Agent's environment. Mode coverage
 * is decided from the Agent's durable session record by the caller-supplied
 * `presetOf`, never from a tool argument.
 * @module @deepseek-ai/dsh-security-proxy-local/engine
 */
import { type ProxyAgent } from 'undici';
import type { WebFetchResult } from '@deepseek-ai/dsh-web';
import type { PinnedResponse } from '@deepseek-ai/dsh-web-fetch-http';
import type { SecurityProxyCaptureExport, SecurityProxyExportQuery, SecurityProxyFlowDetail, SecurityProxyFlowQuery, SecurityProxyFlowSummary, SecurityProxySettingsPatch, SecurityProxyState, SecurityProxyTestResult } from '@deepseek-ai/dsh-security-proxy/types';
import type { SecurityProxyEgressLease } from '@deepseek-ai/dsh-security-proxy';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { CaptureStore } from './capture.ts';
import { SessionChainProxy, type ChainOptions } from './chain.ts';
import { SettingsStore } from './settings.ts';
import { type Upstream, type UpstreamTunnel } from './upstream.ts';
/** One HTTP hop; the relay supplies the method and bounded request bytes. */
export interface ProxyHttpRequest {
    /** HTTP method preserved from the caller. */
    readonly method: string;
    /** Origin headers with hop-specific proxy fields removed. */
    readonly headers: Record<string, string>;
    /** Optional request bytes, already bounded by the relay. */
    readonly body?: Uint8Array<ArrayBuffer>;
}
/** The preset whose sessions this proxy serves. */
export declare const SECURITY_PRESET = "security";
/** One connection's cryptographic material; stored by the credential provider, read per operation. */
export interface PasswordVault {
    /** Whether a password record exists. */
    present(): Promise<boolean>;
    /** The stored password, or undefined when unset. */
    resolve(): Promise<string | undefined>;
    /** Store a new password, or remove the record when given null. */
    save(value: string | null): Promise<void>;
}
/**
 * The one fact coverage needs about an execution: the conversation it belongs
 * to. An Agent satisfies this, and a test supplies one directly.
 */
export interface EgressSubject {
    readonly session: {
        readonly id: SessionId;
    };
}
/** What the engine needs from its owner to run. */
export interface EngineOptions {
    readonly store: SettingsStore;
    readonly capture: CaptureStore;
    readonly vault: PasswordVault;
    /** Preset the subject's session currently records; `security` is the only covered value. */
    presetOf(subject: EgressSubject): string;
    /** The subject's conversation identity, used for attribution and chain listeners. */
    sessionIdOf(subject: EgressSubject): SessionId;
    /** Target the connection check asks the upstream to reach. */
    readonly testTarget: {
        readonly host: string;
        readonly port: number;
    };
    /** Whole-handshake budget for the check and for CONNECT tunnels. */
    readonly connectTimeoutMs: number;
    /** Whole-request budget for one forwarded or controlled request. */
    readonly requestTimeoutMs: number;
    /** Same-origin redirect hops the controlled Client follows. */
    readonly maxRedirects: number;
    /** Decoded body character cap for the controlled Client. */
    readonly maxBodyChars: number;
    /** Response byte cap for the controlled Client. */
    readonly maxResponseBytes: number;
    /** UTF-8 JSON byte budget for one complete capture export. */
    readonly maxExportBytes: number;
    /** `User-Agent` the controlled Client sends. */
    readonly userAgent: string;
    /** Called once per session when a covered call runs with the proxy off. */
    readonly warnDisabled?: (sessionId: SessionId) => void;
    /** Clock for flow timestamps and retention. */
    readonly now?: () => number;
    /** Contained diagnostic sink. */
    readonly log?: (message: string, error?: unknown) => void;
}
interface ChainRoute {
    readonly proxy: SessionChainProxy;
    readonly certificate?: string;
}
/**
 * Owns the proxy's whole runtime. One instance serves every conversation in the
 * Host; attribution and child environments are per session.
 */
export declare class SecurityProxyEngine {
    protected readonly options: EngineOptions;
    private statusValue;
    private failureValue;
    private detailValue;
    private checkedAtValue;
    private latencyValue;
    private dispatcher;
    private dispatcherKey;
    private upstreamNow;
    private readonly chains;
    private readonly retiringChains;
    private readonly egress;
    private readonly warned;
    private closing;
    private readonly lifetime;
    private generation;
    private readonly pending;
    private disposal;
    private changes;
    /**
     * @param options - store, capture, credential vault, and deployment limits.
     */
    constructor(options: EngineOptions);
    /** The capture store this engine writes into. */
    get capture(): CaptureStore;
    /** @returns Cancellation when this engine closes or its selected upstream changes. */
    protected executionSignal(): AbortSignal;
    /** @returns A release callback for execution dependencies held through response cleanup. */
    protected retainExecution(): () => void;
    private execute;
    private change;
    private assertOpen;
    /**
     * Send one hop through the selected transport without following redirects.
     * @param _upstream - Selected upstream, including private credentials.
     * @param dispatcher - Engine-owned pool for this upstream.
     * @param url - Original target URL.
     * @param request - Origin method, headers and bounded body.
     * @param signal - Caller, transport and engine cancellation.
     * @returns Response and cleanup to run after consuming or cancelling its body.
     */
    protected requestHttp(_upstream: Upstream, dispatcher: ProxyAgent, url: URL, request: ProxyHttpRequest, signal: AbortSignal): Promise<PinnedResponse>;
    /**
     * Open an opaque tunnel; an enforcing subclass must validate or refuse its effects before connecting.
     * @param upstream - Selected upstream with private credentials.
     * @param host - Requested destination hostname.
     * @param port - Destination port.
     * @param signal - Execution cancellation.
     * @returns Tunnel whose socket is owned by the relay until closure.
     */
    protected openTunnel(upstream: Upstream, host: string, port: number, signal: AbortSignal): Promise<UpstreamTunnel>;
    /**
     * Bind request attribution for a route or Host check; subclasses may validate the live owner.
     * @param _sessionId - Route owner, or undefined for a Host-level connection check.
     * @returns The request runner; the default preserves the operation without adding context.
     */
    protected executionScope(_sessionId: SessionId | undefined): import('./chain.ts').ProxyExecutionScope;
    /**
     * Check a proxy path without forwarding application bytes.
     * @param upstream - Selected upstream with private credentials.
     * @param signal - Execution cancellation.
     * @returns The handshake latency in milliseconds.
     */
    protected probe(upstream: Upstream, signal: AbortSignal): Promise<number>;
    /**
     * Verify the configured upstream over a real proxy path, and publish the
     * resulting status.
     * @returns the check outcome and the state after it.
     */
    test(): Promise<SecurityProxyTestResult>;
    private runTest;
    /**
     * Merge one settings patch, persist it, and re-verify when the transport changed.
     * @param patch - owner-edited fields.
     * @returns the state after the write.
     */
    configure(patch: SecurityProxySettingsPatch): Promise<SecurityProxyState>;
    private configureNow;
    /**
     * Store or remove the upstream password, then re-verify when the proxy is on.
     * @param password - the new secret, or null to remove the record.
     * @returns the state after the change.
     */
    setPassword(password: string | null): Promise<SecurityProxyState>;
    private setPasswordNow;
    /**
     * Read the whole surface state.
     * @returns settings, status, counters, and coverage.
     */
    state(): Promise<SecurityProxyState>;
    /**
     * Decide whether one tool execution is covered.
     * @param subject - the Agent executing the call.
     * @param tool - the model-facing tool name.
     * @returns the route, or undefined when the session is not covered or the feature is off.
     */
    route(subject: EgressSubject | undefined, tool: string): {
        sessionId: SessionId;
        preset: string;
        tool: string;
    } | undefined;
    /**
     * Environment a child process needs to reach the chain proxy that belongs to
     * its own session.
     * @param subject - the Agent executing the call.
     * @param tool - the model-facing tool name.
     * @returns the overlay for one spawn, or undefined when not covered.
     */
    environment(subject: EgressSubject | undefined, tool: string): Promise<Readonly<Record<string, string>> | undefined>;
    /**
     * Read trust material for an existing listener without issuing another one.
     * @param subject - Actual conversation owning the requested listener.
     * @param tool - Tool name bound to the listener.
     * @param server - Previously issued endpoint.
     * @returns Public certificate, null for opaque CONNECT, or undefined for an unissued route.
     */
    issuedCertificate(subject: EgressSubject, tool: string, server: string): Promise<string | null | undefined>;
    /**
     * Retain this owner's upstream and capture for native enforcement.
     * @param subject - Actual executing conversation; absent or uncovered subjects acquire nothing.
     * @param tool - Attribution bound to the returned capture writer.
     * @param stop - Stop and join all delegated resources when the lease is revoked.
     * @param caller - Caller cancellation for admission and the published lease.
     * @param admission - Optional startup-only cancellation; omission adds no further signal.
     * @returns Covered lease, otherwise undefined. A route withdrawn during admission rejects.
     */
    openEgress(subject: EgressSubject | undefined, tool: string, stop: () => Promise<void>, caller: AbortSignal, admission?: AbortSignal): Promise<SecurityProxyEgressLease | undefined>;
    /**
     * Retrieve one target through the upstream, recording the exchange at the
     * controlled Client layer.
     * @param subject - the Agent executing the call.
     * @param url - absolute HTTP(S) target.
     * @param signal - caller cancellation.
     * @returns the decoded response.
     */
    fetchTarget(subject: EgressSubject | undefined, url: string, signal: AbortSignal): Promise<WebFetchResult>;
    /**
     * List retained flows, newest first.
     * @param query - optional filters.
     * @returns matching summaries.
     */
    list(query?: SecurityProxyFlowQuery): SecurityProxyFlowSummary[];
    /**
     * Read one flow's stored detail.
     * @param id - flow identity.
     * @returns the detail, or null when pruned or unknown.
     */
    detail(id: string): SecurityProxyFlowDetail | null;
    /**
     * Build a complete stored snapshot within the configured export byte budget.
     * @param query - Filters without list pagination.
     * @returns Snapshot or an explicit budget refusal; no partial data is returned.
     */
    exportCapture(query: SecurityProxyExportQuery): {
        readonly kind: 'ready';
        readonly data: SecurityProxyCaptureExport;
    } | {
        readonly kind: 'too-large';
        readonly maxBytes: number;
    };
    /** Drop every retained flow. */
    clear(): void;
    /**
     * Pause or resume capture. Pausing keeps forwarding and existing rows.
     * @param paused - whether new flows are refused.
     * @returns the state after the change.
     */
    setPaused(paused: boolean): Promise<SecurityProxyState>;
    /**
     * Close one conversation's chain listeners and forget its reminder state.
     * @param sessionId - the disposed conversation.
     */
    forgetSession(sessionId: SessionId): void;
    /** Close every listener, dispatcher, and in-flight request. */
    dispose(): Promise<void>;
    private close;
    private closeRoutes;
    /** Resolve the upstream and dispatcher for the current settings, rebuilding them when the key changed. */
    private ensureTransport;
    /** Close the dispatcher so the next request rebuilds it from current settings. */
    private closeDispatcher;
    /** Close every session listener; used on reconfiguration and disposal. */
    private closeChains;
    /** Close the dispatcher and listeners before a settings change takes effect. */
    private resetTransport;
    /**
     * Start a listener with the selected transport's optional inspection and public trust material.
     * @param options - Listener ownership, forwarding, and capture callbacks.
     * @param signal - Current provider and transport generation lifetime.
     * @returns The listener and optional PEM certificate for its own clients.
     */
    protected startChain(options: ChainOptions, signal: AbortSignal): Promise<ChainRoute>;
    /** Return the conversation/tool listener, starting it on first use. */
    private chainFor;
    private resolveChain;
    /** Follow same-origin redirects, read a capped body, and record the exchange. */
    private retrieve;
    /** Read a response body up to the byte cap. */
    private readCapped;
    /** Record one completed controlled exchange. */
    private recordResponse;
    /** Record a controlled exchange that never produced a response. */
    private recordFailure;
    /** Append one exchange unless the owner paused capture. */
    private record;
    /** Mark the upstream unreachable after a transport failure, without touching a target's own status. */
    private markFailed;
    /** Current clock. */
    private now;
}
/** Re-export the body preparation helpers the service uses for its own tests. */
export { headerEntries, prepareBody } from './capture.ts';
//# sourceMappingURL=engine.d.ts.map