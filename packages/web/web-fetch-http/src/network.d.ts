/**
 * Address resolution and address-pinned HTTP transport for `web-fetch-http`.
 * One DNS answer set is validated before Undici receives it through a custom lookup,
 * so the connection cannot resolve the hostname again after authorization.
 *
 * @module @deepseek-ai/dsh-web-fetch-http/network
 */
import type { LookupAddress, LookupOptions } from 'node:dns';
import type { Dispatcher, Response } from 'undici';
/** One address resolved and retained for the subsequent pinned connection. */
export interface ResolvedSocketAddress {
    /** Canonical textual IPv4 or IPv6 address. */
    readonly address: string;
    /** Address family accepted by Node's connection lookup callback. */
    readonly family: 4 | 6;
    /** IPv4 destination embedded by a known or discovered DNS64 prefix, retained for target-policy checks. */
    readonly translatedIpv4?: string;
}
/** Address admitted by the anonymous HTTP resolver's additional public-network checks. */
export type PublicAddress = ResolvedSocketAddress;
/** The result of one address-pinned request; closing releases its private pool. */
export interface PinnedResponse {
    /** HTTP response whose body remains readable until `close()` is called. */
    readonly response: Response;
    /** Release the request's dispatcher after the response body is consumed or cancelled. */
    close(): Promise<void>;
}
/** Resolver signature used to test public-address policy without process DNS changes. */
export type AddressResolver = (hostname: string, options: {
    all: true;
    order: 'verbatim';
}) => Promise<LookupAddress[]>;
/**
 * Return whether an address is globally reachable unicast. IPv4-mapped IPv6 is
 * classified by its embedded IPv4 address; transition and translation prefixes
 * remain blocked because their eventual IPv4 destination cannot be pinned here.
 *
 * @param input - textual IPv4 or IPv6 address.
 * @returns true only for a public unicast destination.
 */
export declare function isPublicIpAddress(input: string): boolean;
/**
 * Resolve a hostname once and reject the complete answer set if any destination
 * is not public. The returned addresses are the only ones the transport may use.
 *
 * @param hostname - URL hostname, including brackets when it is an IPv6 literal.
 * @param signal - aborts the wait for system resolution; an in-flight OS lookup may finish unused.
 * @param resolver - lookup implementation, overridden only by focused tests.
 * @returns the validated, non-empty address set.
 */
export declare function resolvePublicAddresses(hostname: string, signal: AbortSignal, resolver?: AddressResolver): Promise<PublicAddress[]>;
/**
 * Resolve an explicitly configured connection target, retaining DNS64 evidence without an anonymous-fetch policy.
 * @param hostname - Owner-selected hostname or literal IP.
 * @param signal - Cancels lookup and translation-prefix discovery.
 * @param resolver - The connection owner's resolver; no ambient fallback is selected here.
 * @returns Literal addresses, including private networks; callers must authorize and pin them before connecting.
 */
export declare function resolveConnectionAddresses(hostname: string, signal: AbortSignal, resolver: AddressResolver): Promise<ResolvedSocketAddress[]>;
/**
 * Fetch through an agent whose lookup callback returns only the already validated address set. The
 * URL hostname remains intact for HTTP Host and TLS SNI.
 *
 * The agent is this request's own because the address set is: pinning is how this package refuses a
 * DNS answer that changes between validation and connection, and it may not apply process-wide —
 * an operator-configured MCP server or model endpoint on loopback is a supported destination, and
 * only the URLs this tool fetches are the model's to choose.
 *
 * @param url - validated HTTP(S) URL the policy does not route through a proxy.
 * @param addresses - Addresses validated by the caller's policy; anonymous fetch uses {@link resolvePublicAddresses}.
 * @param headers - request headers.
 * @param signal - request and body-read cancellation signal.
 * @param request - Structured method and optional bytes; defaults to an anonymous GET.
 * @returns a response plus the disposer its consumer must call.
 */
export declare function requestPinned(url: URL, addresses: readonly PublicAddress[], headers: Record<string, string>, signal: AbortSignal, request?: {
    readonly method: string;
    readonly body?: Uint8Array<ArrayBuffer>;
}): Promise<PinnedResponse>;
/**
 * Fetch through the dispatcher the proxy policy already installed, letting the proxy resolve the
 * origin.
 *
 * No address set is pinned because none exists to pin: the proxy performs the lookup, and a
 * connection pinned to a locally resolved address would reach the origin directly and defeat the
 * proxy. The dispatcher is the process-wide one, so hops share its connection pool and no caller
 * closes it.
 *
 * @param dispatcher - the route's dispatcher, from `proxyRouteFor`.
 * @param url - validated HTTP(S) URL the policy routes through a proxy.
 * @param headers - request headers.
 * @param signal - request and body-read cancellation signal.
 * @returns a response plus a disposer that releases nothing, so both paths close alike.
 */
export declare function requestVia(dispatcher: Dispatcher, url: URL, headers: Record<string, string>, signal: AbortSignal): Promise<PinnedResponse>;
/**
 * Request a validated origin through a proxy using a literal-IP CONNECT tunnel.
 * The HTTP Host and origin TLS name remain the original authority; certificate verification stays enabled.
 * @param proxy - Selected HTTP(S) proxy URL, possibly containing credentials; never log this value.
 * @param url - Original validated origin URL.
 * @param addresses - Non-empty validated candidates; the first is bound for this hop without application-level replay.
 * @param headers - Origin headers; Host is fixed to the URL and proxy authorization is never forwarded.
 * @param signal - Request and body-read cancellation.
 * @param request - Method and optional bytes for a structured request; defaults to an anonymous GET.
 * @returns A response with a private proxy dispatcher that the caller must close.
 */
export declare function requestPinnedViaProxy(proxy: string, url: URL, addresses: readonly PublicAddress[], headers: Record<string, string>, signal: AbortSignal, request?: {
    readonly method: string;
    readonly body?: Uint8Array<ArrayBuffer>;
}): Promise<PinnedResponse>;
/** Production network operations kept as an object so provider tests can replace resolution only. */
export declare const httpNetwork: {
    resolve: (hostname: string, signal: AbortSignal) => Promise<ResolvedSocketAddress[]>;
    request: typeof requestPinned;
    requestVia: typeof requestVia;
    requestPinnedViaProxy: typeof requestPinnedViaProxy;
};
type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
/**
 * Build the connector lookup that serves a fixed validated answer set.
 *
 * @param addresses - public addresses retained from the preceding resolution.
 * @returns a Node-compatible lookup callback that performs no network resolution.
 */
export declare function createPinnedLookup(addresses: readonly PublicAddress[]): (hostname: string, options: LookupOptions, callback: LookupCallback) => void;
export {};
//# sourceMappingURL=network.d.ts.map