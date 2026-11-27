/**
 * DeepSeek search through an Anthropic-compatible Messages model call with the native
 * `web_search_20250305` server tool. Each search costs a model turn, but returns structured
 * result blocks; absence of those blocks is an error rather than a prose-scraping fallback.
 * The wire format and native `fetch` client are provider-private and do not use `ctx.llm`.
 * @module @deepseek-ai/dsh-web-search-deepseek/provider
 */
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import type { AnthropicResponse, ContentBlock } from './types.ts';
/** Stable id this provider registers under. */
export declare const DEEPSEEK_PROVIDER_ID = "deepseek-official";
/**
 * Default auxiliary-search endpoint, including `/v1`; `/messages` is appended.
 * `$DEEPSEEK_SEARCH_BASE_URL` overrides it independently of the conversation
 * adapter's endpoint. Both providers share the API key.
 */
export declare const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic/v1";
/**
 * Resolve the credential-free Messages request path from a configured base URL.
 * @param baseURL - HTTP(S) endpoint prefix supplied by the deployment.
 * @returns Canonical Messages URL, or undefined when the base cannot name a request path.
 */
export declare function messagesSearchEndpoint(baseURL: string): string | undefined;
/** Default Anthropic-format model name (aligned with the repo's DeepSeek model vocabulary). */
export declare const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
/** Default `anthropic-version` header value. */
export declare const DEEPSEEK_DEFAULT_API_VERSION = "2023-06-01";
/** Default upper bound on generated tokens for the Messages request. */
export declare const DEEPSEEK_DEFAULT_MAX_TOKENS = 4096;
/** Default maximum `web_search` server-tool uses per request. */
export declare const DEEPSEEK_DEFAULT_MAX_USES = 5;
/**
 * Exact secret-free DeepSeek Messages request recorded immediately before one
 * auxiliary search dispatch.
 */
export interface DeepSeekSearchLlmRequest {
    /** Fully resolved Messages endpoint. */
    readonly endpoint: string;
    /** `anthropic-version` header value. */
    readonly apiVersion: string;
    /** Exact JSON body sent to the provider. */
    readonly body: {
        readonly model: string;
        readonly max_tokens: number;
        readonly messages: readonly [
            {
                readonly role: 'user';
                readonly content: readonly [
                    {
                        readonly type: 'text';
                        readonly text: string;
                    }
                ];
            }
        ];
        readonly tools: readonly [
            {
                readonly type: 'web_search_20250305';
                readonly name: 'web_search';
                readonly max_uses: number;
            }
        ];
        /**
         * Thinking mode for the auxiliary turn. The provider always sends
         * `disabled`: it discards the generated text, so reasoning tokens have no
         * consumer. Absent means the request omitted the field and the provider
         * applied its default.
         */
        readonly thinking?: {
            readonly type: 'disabled';
        };
    };
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** Secret-free auxiliary DeepSeek search request recorded before dispatch. */
        'web/deepseek-search-llm-request': DeepSeekSearchLlmRequest;
    }
}
/** Resolved provider options (the plugin's `apply` supplies credential and constant defaults). */
export interface DeepSeekSearchProviderOptions {
    /** Admission and accounting around the complete HTTP exchange; absent for standalone providers. */
    dispatch?: (request: DeepSeekSearchLlmRequest, signal: AbortSignal | undefined, send: () => Promise<AnthropicResponse>) => Promise<AnthropicResponse>;
    /**
     * Resolve the DeepSeek account token for one search endpoint. A token takes
     * precedence over every API key and is sent only as `x-dsh-auth-token`;
     * `undefined` selects API-key authentication.
     */
    resolveAccountToken?: (endpoint: string) => Promise<string | undefined>;
    /** Invalidate the exact account token rejected by HTTP 401; failures must not replace the search error. */
    rejectAccountToken?: (token: string) => Promise<void>;
    /** Literal DeepSeek API key; when present it wins over {@link resolveApiKey}. */
    apiKey?: string;
    /** Resolve the current DeepSeek API key for one search operation. */
    resolveApiKey?: () => Promise<string | undefined>;
    /** Credential reference named by missing-credential diagnostics. */
    apiKeyEnv?: CredentialRef;
    /** Endpoint base; `/messages` is appended. */
    baseURL: string;
    /** Anthropic-format model name. */
    model: string;
    /** `anthropic-version` header value. */
    apiVersion: string;
    /** Upper bound on generated tokens for the Messages request. */
    maxTokens: number;
    /** Maximum `web_search` server-tool uses per request. */
    maxUses: number;
    /**
     * Record the exact secret-free request immediately before dispatch. A throw
     * prevents dispatch so model-visible auxiliary input cannot escape logging.
     */
    recordRequest?: (request: DeepSeekSearchLlmRequest) => void;
}
/**
 * Build a `url → cited_text` map from every `text` block's `citations[]`. This
 * is the snippet source for a `web_search_result` item that carries no `snippet`
 * of its own: the excerpt then lives in a separate `text` block's citation, keyed
 * by `url` (first occurrence wins).
 *
 * @param blocks - the response's content blocks; non-`text` blocks are skipped.
 * @returns the `url → cited_text` map (empty when no citations are present).
 */
export declare function citationSnippets(blocks: readonly ContentBlock[]): Map<string, string>;
/**
 * Map a DeepSeek Anthropic Messages response to a normalized search result. Walks
 * `web_search_tool_result` blocks for citeable `web_search_result` items, takes each item's own
 * `snippet` or else its citation excerpt as `snippet`, and dedupes by `url` (a `max_uses > 1`
 * request can surface the same URL across searches). The web service owns the final `maxResults`
 * truncation, so `truncated` is always `false` here.
 *
 * @param response - the parsed Messages response body.
 * @returns the normalized result with deduped sources and their snippets.
 * @throws {@link WebError} when native search produced no result block.
 */
export declare function mapAnthropicResponse(response: AnthropicResponse): WebSearchResult;
/**
 * The DeepSeek-backed search provider. HTTP redirects fail as `WEB_PROVIDER_ERROR`;
 * failures after dispatch name the endpoint and tell the model how the user can configure it.
 */
export declare class DeepSeekSearchProvider implements WebSearchProvider {
    private readonly resolveOptions;
    readonly id = "deepseek-official";
    /** Picker description: what this provider suits and what it costs or cannot do. */
    readonly description: NonNullable<WebSearchProvider['description']>;
    /**
     * @param resolveOptions - the options for the NEXT operation, snapshotted
     * once at each operation's entry so one search never mixes two sections. A
     * thunk rather than a value because the plugin's settings section can change
     * between searches, and re-registering the provider to carry a new endpoint
     * would make the seam's selection observable to the user as a flicker.
     */
    constructor(resolveOptions: () => DeepSeekSearchProviderOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    private send;
    /**
     * Resolve one operation's authentication headers without retaining a credential on the provider.
     * @param options - the caller's snapshot, so the credential and the endpoint it is sent to come from one section.
     * @param endpoint - the Messages endpoint this operation dispatches to.
     * @param signal - abort signal for the surrounding search.
     * @returns the account-token header when one resolves, otherwise the API-key headers, tagged by credential kind.
     */
    private authHeaders;
    /**
     * Resolve one operation's API key without retaining it on the provider.
     * @param options - the caller's snapshot, so the key and the endpoint it is sent to come from one section.
     * @param signal - abort signal for the surrounding search.
     * @returns the resolved key.
     */
    private apiKey;
}
//# sourceMappingURL=provider.d.ts.map