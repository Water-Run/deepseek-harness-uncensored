/**
 * Anonymous HTTP(S) `WebFetchProvider` plugin. It contributes to the
 * `ctx.web` registry without owning the service.
 *
 * @module @deepseek-ai/dsh-web-fetch-http
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { HttpFetchLimits } from './provider.ts';
export { LOCAL_FETCH_PROVIDER_ID, HttpFetchProvider, } from './provider.ts';
export type { HttpFetchLimits, HttpFetchResolver } from './provider.ts';
export type { HttpFetchAuthority, HttpFetchDestination, HttpFetchRejection, HttpFetchAuthorizer } from './authorization.ts';
export { resolvePublicAddresses, resolveConnectionAddresses, requestPinned, requestPinnedViaProxy } from './network.ts';
export type { PublicAddress, ResolvedSocketAddress, AddressResolver, PinnedResponse } from './network.ts';
export { classifyContentType, decoderForCharset, isSameOrigin, parseCharset, parseFetchUrl, validateFetchUrl, WEB_FETCH_MAX_URL_LENGTH, } from './policy.ts';
/** Default `User-Agent`: an explicit product agent, never a browser disguise. */
export declare const DEFAULT_USER_AGENT = "deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)";
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-fetch-http";
/** The web seam this provider registers into. */
export declare const inject: string[];
/** Plugin config: the provider's transport and size limits plus its `User-Agent` (all defaulted). */
export interface Config {
    /** Maximum response body size in bytes. */
    maxResponseBytes?: number;
    /** Maximum decoded body length in characters. */
    maxBodyChars?: number;
    /** Default fetch timeout in milliseconds, within Node's timer range. */
    timeoutMs?: number;
    /** Maximum number of same-origin redirect hops to follow. */
    maxRedirects?: number;
    /** `User-Agent` header sent on every request. */
    userAgent?: string;
}
export declare const Config: z<Config>;
/**
 * Apply shared HTTP defaults and validate every transport limit.
 * @param config - Deployment input, including partially specified values.
 * @returns Complete limits safe for the HTTP provider and guarded consumers.
 */
export declare function resolveHttpFetchLimits(config: Config): HttpFetchLimits;
/** Register the local HTTP(S) fetch provider with `ctx.web`. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map