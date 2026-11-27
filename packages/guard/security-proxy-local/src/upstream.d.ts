/**
 * The configured upstream proxy: its address, its Proxy-Authorization value, the
 * dispatcher every proxied request uses, and the CONNECT primitive the chain
 * proxy and the connection check share.
 *
 * TLS verification is never relaxed here. A `https:` upstream is reached through
 * `node:https` with Node's default trust store, and origin TLS stays end-to-end
 * through the tunnel.
 * @module @deepseek-ai/dsh-security-proxy-local/upstream
 */
import type { Socket } from 'node:net';
import { ProxyAgent } from 'undici';
import type { SecurityProxyFailure, SecurityProxyProtocol } from '@deepseek-ai/dsh-security-proxy/types';
/** One resolved upstream proxy, credentials included. Never logged or stored in this form. */
export interface Upstream {
    readonly protocol: SecurityProxyProtocol;
    readonly host: string;
    readonly port: number;
    readonly username: string;
    readonly password: string | undefined;
}
/** A classified transport failure the settings surface can render without a transport vocabulary. */
export declare class UpstreamFailure extends Error {
    readonly failure: SecurityProxyFailure;
    readonly name = "UpstreamFailure";
    /**
     * @param failure - stable reason the Client localizes.
     * @param detail - unlocalized diagnostic; carries no credential.
     */
    constructor(failure: SecurityProxyFailure, detail: string, options?: ErrorOptions);
}
/** One open tunnel to a target, and its upstream response status. */
export interface UpstreamTunnel {
    readonly socket: Socket;
    readonly status: number;
}
/**
 * The proxy URL without credentials, for diagnostics and the dispatcher URI.
 * @param upstream - configured upstream.
 * @returns `protocol://host:port`.
 */
export declare function proxyUrl(upstream: Upstream): string;
/**
 * Resolve the Proxy-Authorization header value.
 * @param upstream - configured upstream.
 * @returns the header value, or undefined when authentication is off.
 * @throws {UpstreamFailure} when authentication is on but no password is stored.
 */
export declare function proxyAuthorization(upstream: Upstream): string | undefined;
/**
 * Build the dispatcher for this upstream. One dispatcher serves every request for
 * one settings value; a settings change closes it and builds the next.
 * @param upstream - configured upstream.
 * @returns the dispatcher to hand to `fetch`.
 */
export declare function createDispatcher(upstream: Upstream): ProxyAgent;
/**
 * Map a transport error to a stable failure reason.
 * @param error - the thrown value, possibly wrapping its own cause.
 * @returns the reason the settings surface renders.
 */
export declare function classifyFailure(error: unknown): SecurityProxyFailure;
/**
 * Explain one failure without repeating a secret.
 * @param error - the thrown value.
 * @returns an unlocalized diagnostic; carries no credential.
 */
export declare function describeFailure(error: unknown): string;
/**
 * Open one CONNECT tunnel through the upstream.
 *
 * The request goes to the proxy itself (TLS-verified when the upstream is
 * `https:`), asks for `host:port`, and resolves only after the proxy answers
 * `2xx`. A `407` is classified as an authentication failure; any other non-2xx
 * is a proxy refusal.
 * @param upstream - configured upstream.
 * @param host - target host the proxy should reach.
 * @param port - target port the proxy should reach.
 * @param timeoutMs - whole-handshake budget.
 * @param signal - caller cancellation.
 * @returns the connected socket and the proxy's status.
 */
export declare function connectThrough(upstream: Upstream, host: string, port: number, timeoutMs: number, signal?: AbortSignal): Promise<UpstreamTunnel>;
/**
 * Run one real proxy-path check: a CONNECT tunnel to the configured target,
 * opened and closed. Nothing about TLS trust is relaxed, and no target body is
 * requested.
 * @param upstream - configured upstream.
 * @param host - check target host.
 * @param port - check target port.
 * @param timeoutMs - whole-check budget.
 * @returns the handshake latency in milliseconds.
 * @throws {UpstreamFailure} when the check fails.
 */
export declare function checkUpstream(upstream: Upstream, host: string, port: number, timeoutMs: number): Promise<number>;
//# sourceMappingURL=upstream.d.ts.map