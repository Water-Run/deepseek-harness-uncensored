/**
 * Safe HTTP(S) retrieval for `ctx.web`: validates and pins IP destinations, follows
 * only same-origin redirects, enforces time and size limits, classifies and decodes text,
 * and leaves presentation to `@deepseek-ai/dsh-tool-web`. Requests carry no browser cookies
 * or ambient credentials.
 * @module @deepseek-ai/dsh-web-fetch-http/provider
 */
import type { WebFetchProvider, WebFetchRequest, WebFetchResult } from '@deepseek-ai/dsh-web';
import type { PublicAddress } from './network.ts';
import type { HttpFetchAuthorizer } from './authorization.ts';
/** Resolved provider limits (the plugin's schemastery Config supplies defaults). */
export interface HttpFetchLimits {
    /** Maximum response body size in bytes (read is aborted past this). */
    maxResponseBytes: number;
    /** Maximum decoded body length in characters (truncated past this). */
    maxBodyChars: number;
    /** Default fetch timeout in milliseconds. */
    timeoutMs: number;
    /** Maximum number of (same-origin) redirect hops to follow. */
    maxRedirects: number;
    /** `User-Agent` header sent on every request. */
    userAgent: string;
}
/** Resolve one hostname to an already policy-validated address set. */
export type HttpFetchResolver = (hostname: string, signal: AbortSignal) => Promise<PublicAddress[]>;
/** Stable id this provider registers under. */
export declare const LOCAL_FETCH_PROVIDER_ID = "http";
/** The anonymous HTTP(S) fetch provider. */
export declare class HttpFetchProvider implements WebFetchProvider {
    private readonly limits;
    private readonly resolveAddresses;
    private readonly authorize?;
    private readonly proxyBinding?;
    readonly id = "http";
    /** Picker description: what this provider suits and what it costs or cannot do. */
    readonly description: NonNullable<WebFetchProvider['description']>;
    /**
     * @param limits - resolved transport and response limits.
     * @param resolveAddresses - resolver that validates destinations before returning;
     * defaults to system resolution including private addresses.
     * @param authorize - Deployment policy for every hop; omission applies only transport validation.
     * @param proxyBinding - Literal CONNECT uses the same checked local addresses through the proxy; omission keeps remote DNS.
     */
    constructor(limits: HttpFetchLimits, resolveAddresses?: HttpFetchResolver, authorize?: HttpFetchAuthorizer | undefined, proxyBinding?: "literal-connect" | undefined);
    /** No credentials to check — an anonymous fetcher is always usable. */
    available(): boolean;
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
    /** Follow same-origin redirects up to the hop cap, then read the final response. */
    private followAndRead;
    private requestOnce;
    private authorizeDestination;
    /** Read, byte-cap, classify, and decode the final response body. */
    private readBody;
    /**
     * Read the response stream up to `maxResponseBytes`. A `Content-Length` over
     * the cap rejects immediately with `WEB_FETCH_TOO_LARGE`; a stream that grows
     * past the cap is cut short (`truncatedByBytes`) rather than rejected, so a
     * server that under-reports still yields a bounded usable body.
     */
    private readCapped;
}
//# sourceMappingURL=provider.d.ts.map