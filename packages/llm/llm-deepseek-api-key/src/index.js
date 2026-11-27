import { APP_IDENTITY, LlmError } from '@deepseek-ai/dsh-llm';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { catalogModelInfo, createModelListingCache, refuseListedModel, registerDeepSeekProvider, requestModelListing, resolveListedCatalog, resolveDeepSeekApiKey, } from '@deepseek-ai/dsh-llm-deepseek';
import { plainOptions, resolveAdapterOptions } from "./config.js";
import { DeepSeekApiKeyRoute, PROVIDER } from "./route.js";
export { Config, plainOptions, resolveAdapterOptions } from "./config.js";
export const name = 'llm-deepseek-api-key';
export const inject = ['llm'];
/** Console tag of listing diagnostics; product profiles mount no console exporter for `ctx.logger`. */
const LOG_TAG = '[llm-deepseek-api-key]';
export function apply(ctx, config) {
    // Registered first: other packages read the active route through this service.
    new DeepSeekApiKeyRoute(ctx);
    const options = () => resolveAdapterOptions(plainOptions(config), launchEnvironmentOf(ctx));
    options();
    const resolveApiKey = async (connection) => {
        const ref = connection.apiKeyEnv;
        const key = await resolveDeepSeekApiKey(ctx, ref);
        if (key !== undefined)
            return key;
        throw new LlmError(`llm-deepseek: no API key for provider route "${PROVIDER}"; store ${ref} through the credentials`
            + ` service (the web Models page writes it), or export ${ref} in the launching environment`, 'MISSING_CREDENTIAL');
    };
    /** The API key, or `undefined` when none is configured; other credential failures propagate. */
    const presentApiKey = async (connection) => {
        try {
            return await resolveApiKey(connection);
        }
        catch (error) {
            if (error instanceof LlmError && error.code === 'MISSING_CREDENTIAL')
                return undefined;
            throw error;
        }
    };
    const listings = createModelListingCache(ctx, name, PROVIDER, {
        settings: () => options().listing,
        credential: async () => { const key = await presentApiKey(options()); return key === undefined ? undefined : { 'x-api-key': key }; },
        load: (url, headers, signal) => requestModelListing(url, headers, signal),
    });
    let reportedListing;
    /** Resolve the catalog, reporting each listing's hidden entries and dropped badges once. */
    const connectionOf = (connection, view) => {
        if (view === undefined)
            return { ...connection, offered: connection.models, refusals: new Map(), badges: new Map() };
        const catalog = resolveListedCatalog({
            visibleModels: connection.visibleModels,
            listing: view.listing?.entries,
            supported: connection.models,
            overrides: {},
            routeMaxTokens: connection.maxTokens,
            clientVersion: APP_IDENTITY.version,
        });
        if (view.listing !== reportedListing) {
            reportedListing = view.listing;
            for (const problem of catalog.problems)
                console.warn(LOG_TAG, problem);
        }
        return { ...connection, models: catalog.resolution, offered: catalog.offered, refusals: catalog.refusals, badges: catalog.badges };
    };
    ctx.llm.registerConfigurableProviders([
        { provider: PROVIDER, displayName: 'DeepSeek', settingsNs: ctx.fiber.entry?.options.id ?? name, settingsPath: [] },
    ]);
    registerDeepSeekProvider(ctx, PROVIDER, {
        providerName: 'DeepSeek',
        options: () => {
            const connection = options();
            return connectionOf(connection, connection.listing === undefined ? undefined : listings.current());
        },
        connect: async (signal) => {
            const connection = options();
            if (connection.listing === undefined)
                return connectionOf(connection, undefined);
            let view;
            try {
                view = await listings.view(connection.listing, signal);
            }
            catch (error) {
                if (signal?.aborted === true)
                    throw error;
                // The cache keeps the previous credential's listing when this lookup fails, so gate nothing;
                // `resolveAuth` reports the failure on the model request, after the turn records the prompt.
                return connectionOf(connection, undefined);
            }
            return connectionOf(connection, view);
        },
        resolveAuth: async (connection) => ({ headers: { 'x-api-key': await resolveApiKey(connection) } }),
        admit: (connection, model) => { refuseListedModel(model, connection.refusals.get(model)); },
        discoverModels: async (provider) => {
            const connection = options();
            if (connection.listing === undefined) {
                if (await presentApiKey(connection) === undefined)
                    return [];
                return connection.models.map(model => catalogModelInfo(provider, model));
            }
            const view = await listings.view(connection.listing);
            if (!view.authenticated)
                return [];
            const { offered, badges } = connectionOf(connection, view);
            return offered.map(model => catalogModelInfo(provider, model, badges.get(model.id)));
        },
    });
    // Starting or stopping to follow the listing discards it, so restoring the built-in
    // catalog after a customization reloads the listing on the next access.
    let following = options().listing !== undefined;
    ctx.on('loader/volatile-update', () => {
        let next;
        // The transport's own listener reports a configuration the adapter rejects.
        try {
            next = options().listing !== undefined;
        }
        catch (_rejectedConfiguration) {
            return;
        }
        if (next !== following)
            listings.invalidate();
        following = next;
    });
}
//# sourceMappingURL=index.js.map