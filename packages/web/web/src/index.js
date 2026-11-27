/**
 * Service Definition for the web access capability seam (`ctx.web`): registries and provider-selecting execution for search and
 * fetch. Duplicate ids are rejected. At execution time, a configured provider must exist and
 * be usable; without one, exactly one usable provider is required, except that a search prefers the
 * usable DeepSeek provider assigned to the route of the model request it serves, so selection never
 * depends on registration order.
 * @module @deepseek-ai/dsh-web
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import z from '@deepseek-ai/schemastery';
import { WebError } from "./types.js";
export { WebError, } from "./types.js";
/** Provider routes of the DeepSeek API-key and account models. */
const DEEPSEEK_MODEL_ROUTES = new Set(['deepseek-official', 'deepseek-account']);
/**
 * Search provider preferred for a model request on a DeepSeek model route while none is configured: DeepSeek
 * Messages search, which DeepSeek serves without a per-search charge.
 */
const DEEPSEEK_ROUTE_SEARCH_PROVIDER = 'deepseek-official';
/** Search provider preferred on every other route and outside a model request while none is configured. */
const OTHER_ROUTE_SEARCH_PROVIDER = 'deepseek-search-api';
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
let WebRuntime = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _listProviders_decorators;
    return class WebRuntime extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _listProviders_decorators = [Remote];
            __esDecorate(this, null, _listProviders_decorators, { kind: "method", name: "listProviders", static: false, private: false, access: { has: obj => "listProviders" in obj, get: obj => obj.listProviders }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        config = __runInitializers(this, _instanceExtraInitializers);
        /**
         * Provider selection config. Operational env overrides feed the SAME fields:
         * `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER` are equivalent to
         * `searchProvider` / `fetchProvider` and are NOT a hidden priority chain.
         */
        static Config = z.object({
            searchProvider: z.string().volatile(),
            fetchProvider: z.string().volatile(),
        });
        searchProviders = new Map();
        fetchProviders = new Map();
        searchProviderEnv;
        fetchProviderEnv;
        constructor(ctx, config) {
            super(ctx, 'web');
            this.config = config;
            this.searchProviderEnv = process.env.DSH_WEB_SEARCH_PROVIDER;
            this.fetchProviderEnv = process.env.DSH_WEB_FETCH_PROVIDER;
        }
        /**
         * Register a search provider. `listProviders()` lists it until the
         * registration is disposed, which happens with the calling fiber or through
         * the returned disposer; registration and disposal each emit
         * `web/providers-changed`. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
         * if its id is already registered for search.
         * @param provider - the provider; its `id` is the registry key.
         * @returns the disposer that unregisters the provider.
         */
        registerSearchProvider(provider) {
            return this.registerProvider(this.searchProviders, provider);
        }
        /**
         * Register a fetch provider, with the listing, disposal, and event behavior
         * of {@link WebRuntime.registerSearchProvider}. Throws {@link WebError}
         * `WEB_DUPLICATE_PROVIDER` if its id is already registered for fetch.
         * @param provider - the provider; its `id` is the registry key.
         * @returns the disposer that unregisters the provider.
         */
        registerFetchProvider(provider) {
            return this.registerProvider(this.fetchProviders, provider);
        }
        registerProvider(store, provider) {
            if (store.has(provider.id)) {
                throw new WebError(`a web provider with id "${provider.id}" is already registered`, 'WEB_DUPLICATE_PROVIDER');
            }
            const emitChanged = () => { this.emitProvidersChanged(); };
            const dispose = this.ctx.effect(function* () {
                store.set(provider.id, provider);
                emitChanged();
                yield () => {
                    store.delete(provider.id);
                    emitChanged();
                };
            }, 'web.registerProvider()');
            // ctx.effect's disposer returns Promise<void>; our disposer API is
            // synchronous fire-and-forget — discard the (always-resolved) promise.
            return () => void dispose();
        }
        /**
         * List every registered search and fetch provider for provider pickers.
         * Availability does not filter the lists.
         * @returns detached `{ id, title, description }` entries per capability, in registration order.
         */
        listProviders() {
            return {
                search: [...this.searchProviders.values()].map(providerInfo),
                fetch: [...this.fetchProviders.values()].map(providerInfo),
            };
        }
        /** Emit `web/providers-changed`, containing each listener's failure so none vetoes the mutation. */
        emitProvidersChanged() {
            for (const listener of this.ctx.events.dispatch('emit', ['web/providers-changed'])) {
                try {
                    const returned = listener();
                    void Promise.resolve(returned).catch((error) => { this.warnListenerFailure(error); });
                }
                catch (error) {
                    this.warnListenerFailure(error);
                }
            }
        }
        warnListenerFailure(error) {
            this.ctx.logger.warn('web: a web/providers-changed listener failed');
            this.ctx.logger.warn(error);
        }
        /**
         * Run one search through the selected provider. Resolves the provider at call
         * time with the selection rules above; throws {@link WebError} when the
         * capability cannot run. The seam enforces `request.maxResults` on the result:
         * if the provider over-returns, `sources[]` is truncated and `truncated` set.
         * @param request - the query, the optional result limit, and the route of the model request the search serves.
         * @param signal - optional cancellation signal forwarded to the provider.
         * @returns the provider's results, capped to `request.maxResults`.
         */
        async search(request, signal) {
            const result = await this.selectSearchProvider(request.llmProvider).search(request, signal);
            return capSources(result, request.maxResults);
        }
        /**
         * Whether the provider `search()` would select can authenticate a search made for a
         * model request on the `llmProvider` chat route. Asks only that provider's `ready()`;
         * one without `ready()` counts as ready. Makes no network calls. A selection failure
         * answers true, because `search()` reports that failure as a structured `WebError`.
         * @param llmProvider - the provider route id of the model request, when known.
         * @returns false only when the selected provider reports that it cannot authenticate.
         */
        async searchReady(llmProvider) {
            return await selectedProviderReady(() => this.selectSearchProvider(llmProvider), llmProvider);
        }
        /**
         * Select the search provider with the rules above, throwing the matching {@link WebError}.
         * @param llmProvider - provider route id of the model request the search serves, when known.
         * @returns the provider the search runs through.
         */
        selectSearchProvider(llmProvider) {
            const configuredId = this.config.searchProvider.get() ?? this.searchProviderEnv;
            const preferredId = llmProvider !== undefined && DEEPSEEK_MODEL_ROUTES.has(llmProvider)
                ? DEEPSEEK_ROUTE_SEARCH_PROVIDER
                : OTHER_ROUTE_SEARCH_PROVIDER;
            return resolveProvider({
                providers: this.searchProviders,
                preferredId,
                ...configuredId !== undefined ? { configuredId } : {},
            });
        }
        /**
         * Retrieve one URL through the selected provider. Resolves the provider at
         * call time with the selection rules above; throws {@link WebError} when the
         * capability cannot run. A non-2xx response is a result, not a throw.
         * @param request - the URL plus retrieval options.
         * @param signal - optional cancellation signal forwarded to the provider.
         * @returns the retrieval outcome; non-2xx responses resolve descriptively.
         */
        async fetch(request, signal) {
            return await this.selectFetchProvider().fetch(request, signal);
        }
        /**
         * Whether the provider `fetch()` would select can authenticate a fetch made for a
         * model request on the `llmProvider` chat route. Asks only that provider's `ready()`;
         * one without `ready()` counts as ready. Makes no network calls. A selection failure
         * answers true, because `fetch()` reports that failure as a structured `WebError`.
         * @param llmProvider - the provider route id of the model request, when known.
         * @returns false only when the selected provider reports that it cannot authenticate.
         */
        async fetchReady(llmProvider) {
            return await selectedProviderReady(() => this.selectFetchProvider(), llmProvider);
        }
        /** Select the fetch provider with the rules above, throwing the matching {@link WebError}. */
        selectFetchProvider() {
            const configuredId = this.config.fetchProvider.get() ?? this.fetchProviderEnv;
            return resolveProvider({
                providers: this.fetchProviders,
                ...configuredId !== undefined ? { configuredId } : {},
            });
        }
    };
})();
export { WebRuntime };
/** Project one provider to its picker entry, omitting an absent title or description. */
function providerInfo(provider) {
    return {
        id: provider.id,
        ...provider.title === undefined ? {} : { title: provider.title },
        ...provider.description === undefined ? {} : { description: provider.description },
    };
}
/**
 * Ask the provider an operation selects whether it can authenticate for one chat route.
 * @param select - the operation's selection; throws its {@link WebError} when no provider qualifies.
 * @param llmProvider - the provider route id of the model request, when known.
 * @returns the provider's answer; true when it has no `ready()` or selection fails, because the
 *   operation reports that failure itself.
 */
async function selectedProviderReady(select, llmProvider) {
    let provider;
    try {
        provider = select();
    }
    catch (_selectionFailure) {
        return true; /* The operation surfaces the same failure when called. */
    }
    return await provider.ready?.(llmProvider) ?? true;
}
/** Resolve the selected provider or throw the matching {@link WebError}. */
function resolveProvider(selection) {
    const { configuredId, providers } = selection;
    if (configuredId !== undefined) {
        const provider = providers.get(configuredId);
        if (!provider) {
            throw new WebError(`configured web provider "${configuredId}" is not registered`, 'WEB_PROVIDER_CONFIGURED_MISSING');
        }
        if (!provider.available()) {
            throw new WebError(`configured web provider "${configuredId}" is registered but unavailable`, 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE');
        }
        return provider;
    }
    const usable = [...providers.values()].filter(provider => provider.available());
    const preferred = usable.find(provider => provider.id === selection.preferredId);
    if (preferred !== undefined)
        return preferred;
    const [single] = usable;
    if (single === undefined) {
        throw new WebError('no usable web provider is registered', 'WEB_PROVIDER_UNAVAILABLE');
    }
    if (usable.length > 1) {
        const ids = usable.map(provider => provider.id).join(', ');
        throw new WebError(`multiple usable web providers are registered (${ids}); configure one explicitly`, 'WEB_PROVIDER_AMBIGUOUS');
    }
    return single;
}
/** Enforce `maxResults` on a search result: truncate `sources[]` and flag it. */
function capSources(result, maxResults) {
    if (maxResults === undefined || result.sources.length <= maxResults)
        return result;
    return { ...result, sources: result.sources.slice(0, maxResults), truncated: true };
}
export default WebRuntime;
//# sourceMappingURL=index.js.map