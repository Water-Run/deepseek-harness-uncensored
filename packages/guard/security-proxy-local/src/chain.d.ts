/**
 * Loopback chain proxy for child processes.
 *
 * A tool call gets an environment pointing at one listener owned by its session.
 * Plain HTTP through that listener is forwarded to the upstream and captured in
 * full; HTTPS is tunnelled with CONNECT and only its metadata is recorded, which
 * is exactly what a non-intercepting proxy can see. The listener never becomes a
 * system proxy and is never bound beyond loopback.
 * @module @deepseek-ai/dsh-security-proxy-local/chain
 */
import { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { PinnedResponse } from '@deepseek-ai/dsh-web-fetch-http';
import type { ProxyHttpRequest } from './engine.ts';
import type { CaptureStore } from './capture.ts';
import { type UpstreamTunnel } from './upstream.ts';
/** Owner-defined attribution and cancellation for one complete exchange. */
export interface ProxyExecutionScope {
    /**
     * @param operation - Request or tunnel lifetime observing the supplied cancellation signal.
     * @returns Completion after the request and its cleanup settle.
     */
    <T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T>;
}
/** Everything one session's listener needs from the owning engine. */
export interface ChainOptions {
    /** Session the listener attributes its flows to. */
    readonly sessionId: string | null;
    /** Tool name shown for every flow this listener handles, read per exchange. */
    tool: () => string;
    /** Current engine, upstream and policy cancellation. */
    signal: () => AbortSignal;
    /** Hold execution dependencies until forwarding and native cleanup settle. */
    retainExecution: () => () => void;
    /** Optional owner attribution and cancellation. Absence preserves the listener's existing signals. */
    executionScope?: ProxyExecutionScope;
    /** Send one HTTP hop through the owner's selected enforcement adapter. */
    requestHttp: (url: URL, request: ProxyHttpRequest, signal: AbortSignal) => Promise<PinnedResponse>;
    /** Validate or refuse an opaque tunnel before any upstream connection. */
    openTunnel: (host: string, port: number, signal: AbortSignal) => Promise<UpstreamTunnel>;
    /** Optional inspected CONNECT transport. Absence preserves opaque tunnelling. Prepare must authorize before acknowledgement. */
    inspectTunnel?: (host: string, port: number, signal: AbortSignal) => Promise<InspectedTunnel>;
    /** Capture store every exchange is appended to. */
    capture: Pick<CaptureStore, 'append'> | undefined;
    /** Whether capture is currently paused; forwarding continues regardless. */
    paused: (() => boolean) | undefined;
    /** Whole HTTP exchange budget, including request-body arrival. */
    timeoutMs: number;
    /** Clock, injectable for tests. */
    now?: () => number;
}
/** Owner-prepared CONNECT inspector; run resolves only after its socket and requests close. */
export interface InspectedTunnel {
    /**
     * Consume the acknowledged socket. Forward complete, validated HTTP URLs through the existing relay.
     * @param socket - Owned downstream socket, already acknowledged with HTTP 200.
     * @param head - Bytes received after CONNECT headers; preserve them before TLS parsing.
     * @param forward - Relay one inspected request, including capture, cancellation and cleanup.
     * @param signal - Tunnel lifetime, cancelled when the caller or owner closes.
     * @returns Completion after all inspected work is quiescent.
     */
    run(socket: Socket, head: Buffer, forward: (request: IncomingMessage, response: ServerResponse) => Promise<void>, signal: AbortSignal): Promise<void>;
}
/**
 * One session's loopback HTTP proxy.
 *
 * `port` is assigned by the operating system on `127.0.0.1`; nothing else on the
 * machine is reconfigured. Disposal destroys open tunnels and closes the server.
 */
export declare class SessionChainProxy {
    private readonly server;
    private readonly options;
    private readonly sockets;
    private closing;
    private readonly lifetime;
    private readonly pending;
    private disposal;
    /** Port assigned by the operating system on loopback. */
    port: number;
    private constructor();
    /**
     * Bind one listener on loopback and start serving.
     * @param options - session attribution, upstream accessors, and capture.
     * @returns the started listener.
     */
    static start(options: ChainOptions): Promise<SessionChainProxy>;
    /** Close the listener and destroy every socket it still owns. */
    close(): Promise<void>;
    private track;
    private scoped;
    private dispose;
    /** Forward one absolute-form HTTP request through the upstream and capture it. */
    private forward;
    /** Tunnel one CONNECT request and record only what the tunnel itself reveals. */
    private tunnel;
    /** Append one exchange unless the owner paused capture. */
    private record;
}
//# sourceMappingURL=chain.d.ts.map