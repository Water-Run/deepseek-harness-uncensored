/**
 * Security-mode egress proxy provider.
 *
 * One Host-wide service owns the configured upstream, the bounded capture store,
 * and loopback listeners separated by conversation and tool. Only the `security` preset is
 * covered; every other mode keeps its existing network behavior, and no control
 * plane traffic (model API, sign-in, balance, updates) is routed here because the
 * dispatcher is private to this plugin rather than installed globally.
 * @module @deepseek-ai/dsh-security-proxy-local
 */
import type { Context } from '@deepseek-ai/cordis';
import schema from '@deepseek-ai/schemastery';
import { SecurityProxyEngine, type EngineOptions } from './engine.ts';
export { SecurityProxyService } from './service.ts';
export { SECURITY_PRESET, SecurityProxyEngine } from './engine.ts';
export type { PasswordVault, EngineOptions, ProxyHttpRequest } from './engine.ts';
export { proxyUrl, connectThrough } from './upstream.ts';
export type { Upstream, UpstreamTunnel } from './upstream.ts';
export type { ProxyAgent as ProxyDispatcher } from 'undici';
export { SessionChainProxy } from './chain.ts';
export type { ChainOptions, InspectedTunnel, ProxyExecutionScope } from './chain.ts';
/** Deployment-owned file path plus the transport limits the proxy enforces. */
export interface Config {
    /** Absolute settings file path inside the product's data directory. */
    path: string;
    /** Host the connection check asks the upstream to reach. */
    testHost?: string;
    /** Port the connection check asks the upstream to reach. */
    testPort?: number;
    /** Whole-handshake budget for the check and CONNECT tunnels, in milliseconds. */
    connectTimeoutMs?: number;
    /** Whole-request budget for forwarded and controlled requests, in milliseconds. */
    requestTimeoutMs?: number;
    /** Same-origin redirect hops the controlled Client follows. */
    maxRedirects?: number;
    /** Decoded body character cap for the controlled Client. */
    maxBodyChars?: number;
    /** Response byte cap for the controlled Client. */
    maxResponseBytes?: number;
    /** Maximum UTF-8 JSON bytes in one complete capture export. */
    maxExportBytes?: number;
    /** `User-Agent` the controlled Client sends. */
    userAgent?: string;
}
/** Deployment defaults are stated here; the settings file owns user choices. */
export declare const Config: schema<Schemastery.ObjectS<NoInfer<{
    path: schema<string, string, "defined">;
    testHost: schema<string, string, "defined">;
    testPort: schema<number, number, "defined">;
    connectTimeoutMs: schema<number, number, "defined">;
    requestTimeoutMs: schema<number, number, "defined">;
    maxRedirects: schema<number, number, "defined">;
    maxBodyChars: schema<number, number, "defined">;
    maxResponseBytes: schema<number, number, "defined">;
    maxExportBytes: schema<number, number, "defined">;
    userAgent: schema<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    path: schema<string, string, "defined">;
    testHost: schema<string, string, "defined">;
    testPort: schema<number, number, "defined">;
    connectTimeoutMs: schema<number, number, "defined">;
    requestTimeoutMs: schema<number, number, "defined">;
    maxRedirects: schema<number, number, "defined">;
    maxBodyChars: schema<number, number, "defined">;
    maxResponseBytes: schema<number, number, "defined">;
    maxExportBytes: schema<number, number, "defined">;
    userAgent: schema<string, string, "defined">;
}>>, "plain">;
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "security-proxy-local";
/** Services this provider reads. */
export declare const inject: string[];
/**
 * Mount the proxy runtime, its Remote surface, and its session lifecycle hooks.
 * @param ctx - application scope.
 * @param config - validated deployment config.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
/**
 * Mount one proxy provider with an explicitly selected execution implementation.
 * @param ctx - Owner of the service and its required dependencies.
 * @param config - Deployment options after schema resolution.
 * @param createEngine - Builds the execution implementation before publishing the service.
 * @returns Completion after service activation.
 */
export declare function mountSecurityProxy(ctx: Context, config: Config, createEngine: (options: EngineOptions) => SecurityProxyEngine): Promise<void>;
//# sourceMappingURL=index.d.ts.map