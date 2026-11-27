/**
 * Register a DeepSeek-backed provider in `ctx.web`. It calls the Anthropic-compatible Messages API
 * with native `web_search_20250305`. A search initiated by a Session on the DeepSeek account route
 * authenticates with the account token when the account service allows the search endpoint;
 * other searches use a configured API-key reference. A model credential is confined to the model
 * origin. An API-key conversation without a separate search endpoint follows its configured gateway.
 * The provider reports itself not ready for a model request whose search would have no usable credential.
 * @module @deepseek-ai/dsh-web-search-deepseek
 */
import type { Volatile } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { DeepSeekSearchLlmRequest } from './provider.ts';
import type { AnthropicResponse } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Events {
        /**
         * Admit and observe the provider-specific paid search exchange.
         * @mode waterfall
         * @param request - Logged, credential-free request.
         * @param signal - Caller cancellation.
         * @param next - Next observer or the HTTP exchange.
         */
        'web/deepseek-search-request'(request: DeepSeekSearchLlmRequest, signal: AbortSignal | undefined, next: () => Promise<AnthropicResponse>): Promise<AnthropicResponse>;
    }
}
export { DeepSeekSearchProvider, DEEPSEEK_DEFAULT_API_VERSION, DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MAX_TOKENS, DEEPSEEK_DEFAULT_MAX_USES, DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_PROVIDER_ID, } from './provider.ts';
export type { DeepSeekSearchLlmRequest, DeepSeekSearchProviderOptions } from './provider.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-search-deepseek";
/** The web seam this provider registers into. */
export declare const inject: string[];
/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
    /** Literal DeepSeek API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
    apiKey: Volatile<string | undefined>;
    /** Credential reference resolved for each search; defaults to `DEEPSEEK_API_KEY`. */
    apiKeyEnv: Volatile<string>;
    /** Anthropic-compatible endpoint base; `/messages` is appended. */
    baseURL: Volatile<string | undefined>;
    /** Anthropic-format model name. Defaults to `deepseek-v4-flash`. */
    model: Volatile<string>;
    /** `anthropic-version` header value. Defaults to `2023-06-01`. */
    apiVersion: Volatile<string>;
    /** Upper bound on generated tokens for the Messages request. Defaults to 4096. */
    maxTokens: Volatile<number>;
    /** Maximum `web_search` server-tool uses per request. Defaults to 5. */
    maxUses: Volatile<number>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    apiKey: z<string, string, "volatile">;
    apiKeyEnv: z<string, string, "volatile-defined">;
    baseURL: z<string, string, "volatile">;
    model: z<string, string, "volatile-defined">;
    apiVersion: z<string, string, "volatile-defined">;
    maxTokens: z<number, number, "volatile-defined">;
    maxUses: z<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    apiKey: z<string, string, "volatile">;
    apiKeyEnv: z<string, string, "volatile-defined">;
    baseURL: z<string, string, "volatile">;
    model: z<string, string, "volatile-defined">;
    apiVersion: z<string, string, "volatile-defined">;
    maxTokens: z<number, number, "volatile-defined">;
    maxUses: z<number, number, "volatile-defined">;
}>>, "plain">;
/** Settings namespace carrying this provider's endpoint, model, and key reference. */
export declare const WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE = "web-search-deepseek";
/**
 * Register the DeepSeek search provider with `ctx.web`. Its `ready()` answers whether a
 * search for a model request on the given route would have a credential to send.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map