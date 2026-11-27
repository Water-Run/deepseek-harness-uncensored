/**
 * Service Definition for the web access capability seam (`ctx.web`): registries and provider-selecting execution for search and
 * fetch. Duplicate ids are rejected. At execution time, a configured provider must exist and
 * be usable; without one, exactly one usable provider is required, except that a search prefers the
 * usable DeepSeek provider assigned to the route of the model request it serves, so selection never
 * depends on registration order.
 * @module @deepseek-ai/dsh-web
 */
import { Context, type Volatile } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import z from '@deepseek-ai/schemastery';
import type { WebFetchProvider, WebFetchRequest, WebFetchResult, WebProviderList, WebSearchProvider, WebSearchRequest, WebSearchResult } from './types.ts';
export { WebError, } from './types.ts';
export type { WebFetchBody, WebFetchProvider, WebFetchRequest, WebFetchResult, WebProviderInfo, WebProviderList, WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource, } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        web: WebRuntime;
    }
}
/**
 * Config for the web seam. `searchProvider` / `fetchProvider` pin which provider
 * wins for each capability; both are optional (a single registered usable
 * provider auto-selects). Each operation reads the current value, so a settings
 * change applies to the next search or fetch without remounting the service.
 * Operational overrides such as environment variables must feed these same
 * fields rather than introduce a hidden priority chain.
 */
export interface WebRuntimeConfig {
    /**
     * Explicit search provider id. Omitted = the usable DeepSeek provider assigned to the route of the model
     * request, and otherwise auto-select when exactly one usable.
     */
    readonly searchProvider: Volatile<string | undefined>;
    /** Explicit fetch provider id. Omitted = auto-select when exactly one usable. */
    readonly fetchProvider: Volatile<string | undefined>;
}
/**
 * The web access service. Registered as `ctx.web` (one instance per context)
 * and exposed to Clients as the `web` Remote namespace (`listProviders`).
 *
 * Selection semantics (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No search id configured, and the provider assigned to the route of the model request
 *   the search serves is usable → that provider: `deepseek-official` (Messages search) on the
 *   `deepseek-official` and `deepseek-account` routes, `deepseek-search-api` on every other
 *   route and outside a model request.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.
 */
export declare class WebRuntime extends TypertRemoteService {
    private readonly config;
    /**
     * Provider selection config. Operational env overrides feed the SAME fields:
     * `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER` are equivalent to
     * `searchProvider` / `fetchProvider` and are NOT a hidden priority chain.
     */
    static Config: z<Schemastery.ObjectS<NoInfer<{
        searchProvider: z<string, string, "volatile">;
        fetchProvider: z<string, string, "volatile">;
    }>>, Schemastery.ObjectT<NoInfer<{
        searchProvider: z<string, string, "volatile">;
        fetchProvider: z<string, string, "volatile">;
    }>>, "plain">;
    private searchProviders;
    private fetchProviders;
    private readonly searchProviderEnv;
    private readonly fetchProviderEnv;
    constructor(ctx: Context, config: WebRuntimeConfig);
    /**
     * Register a search provider. `listProviders()` lists it until the
     * registration is disposed, which happens with the calling fiber or through
     * the returned disposer; registration and disposal each emit
     * `web/providers-changed`. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
     * if its id is already registered for search.
     * @param provider - the provider; its `id` is the registry key.
     * @returns the disposer that unregisters the provider.
     */
    registerSearchProvider(provider: WebSearchProvider): () => void;
    /**
     * Register a fetch provider, with the listing, disposal, and event behavior
     * of {@link WebRuntime.registerSearchProvider}. Throws {@link WebError}
     * `WEB_DUPLICATE_PROVIDER` if its id is already registered for fetch.
     * @param provider - the provider; its `id` is the registry key.
     * @returns the disposer that unregisters the provider.
     */
    registerFetchProvider(provider: WebFetchProvider): () => void;
    private registerProvider;
    /**
     * List every registered search and fetch provider for provider pickers.
     * Availability does not filter the lists.
     * @returns detached `{ id, title, description }` entries per capability, in registration order.
     */
    listProviders(): WebProviderList;
    /** Emit `web/providers-changed`, containing each listener's failure so none vetoes the mutation. */
    private emitProvidersChanged;
    private warnListenerFailure;
    /**
     * Run one search through the selected provider. Resolves the provider at call
     * time with the selection rules above; throws {@link WebError} when the
     * capability cannot run. The seam enforces `request.maxResults` on the result:
     * if the provider over-returns, `sources[]` is truncated and `truncated` set.
     * @param request - the query, the optional result limit, and the route of the model request the search serves.
     * @param signal - optional cancellation signal forwarded to the provider.
     * @returns the provider's results, capped to `request.maxResults`.
     */
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    /**
     * Whether the provider `search()` would select can authenticate a search made for a
     * model request on the `llmProvider` chat route. Asks only that provider's `ready()`;
     * one without `ready()` counts as ready. Makes no network calls. A selection failure
     * answers true, because `search()` reports that failure as a structured `WebError`.
     * @param llmProvider - the provider route id of the model request, when known.
     * @returns false only when the selected provider reports that it cannot authenticate.
     */
    searchReady(llmProvider?: string): Promise<boolean>;
    /**
     * Select the search provider with the rules above, throwing the matching {@link WebError}.
     * @param llmProvider - provider route id of the model request the search serves, when known.
     * @returns the provider the search runs through.
     */
    private selectSearchProvider;
    /**
     * Retrieve one URL through the selected provider. Resolves the provider at
     * call time with the selection rules above; throws {@link WebError} when the
     * capability cannot run. A non-2xx response is a result, not a throw.
     * @param request - the URL plus retrieval options.
     * @param signal - optional cancellation signal forwarded to the provider.
     * @returns the retrieval outcome; non-2xx responses resolve descriptively.
     */
    fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>;
    /**
     * Whether the provider `fetch()` would select can authenticate a fetch made for a
     * model request on the `llmProvider` chat route. Asks only that provider's `ready()`;
     * one without `ready()` counts as ready. Makes no network calls. A selection failure
     * answers true, because `fetch()` reports that failure as a structured `WebError`.
     * @param llmProvider - the provider route id of the model request, when known.
     * @returns false only when the selected provider reports that it cannot authenticate.
     */
    fetchReady(llmProvider?: string): Promise<boolean>;
    /** Select the fetch provider with the rules above, throwing the matching {@link WebError}. */
    private selectFetchProvider;
}
export default WebRuntime;
//# sourceMappingURL=index.d.ts.map