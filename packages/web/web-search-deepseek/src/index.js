import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { deepSeekApiKeyConfigured, rejectDeepSeekAccountToken, resolveDeepSeekAccountToken, resolveDeepSeekApiKey, } from '@deepseek-ai/dsh-llm-deepseek';
import { resolveAdapterOptions } from '@deepseek-ai/dsh-llm-deepseek-api-key';
import { WebError } from '@deepseek-ai/dsh-web';
import { DeepSeekSearchProvider, DEEPSEEK_DEFAULT_API_VERSION, DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MAX_TOKENS, DEEPSEEK_DEFAULT_MAX_USES, DEEPSEEK_DEFAULT_MODEL, messagesSearchEndpoint, } from "./provider.js";
export { DeepSeekSearchProvider, DEEPSEEK_DEFAULT_API_VERSION, DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MAX_TOKENS, DEEPSEEK_DEFAULT_MAX_USES, DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_PROVIDER_ID, } from "./provider.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-deepseek';
/** The web seam this provider registers into. */
export const inject = ['web'];
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY';
export const Config = z.object({
    apiKey: z.string().role('secret').volatile(),
    apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV).volatile(),
    // Declared here rather than only at the use site: a configuration surface
    // renders the resolved section, so a default the schema does not carry reads
    // there as no value at all.
    baseURL: z.string().volatile(),
    model: z.string().default(DEEPSEEK_DEFAULT_MODEL).volatile(),
    apiVersion: z.string().default(DEEPSEEK_DEFAULT_API_VERSION).volatile(),
    maxTokens: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_TOKENS).volatile(),
    maxUses: z.number().step(1).min(1).default(DEEPSEEK_DEFAULT_MAX_USES).volatile(),
});
/** Explicit endpoint override for the auxiliary search. */
const SEARCH_BASE_URL_ENV = 'DEEPSEEK_SEARCH_BASE_URL';
/** Provider route id `dsh-llm-deepseek-account` registers; `request/context` events record it per Session. */
const ACCOUNT_PROVIDER = 'deepseek-account';
const API_KEY_PROVIDER = 'deepseek-official';
const SEARCH_DEFAULT_ORIGIN = new URL(DEEPSEEK_DEFAULT_BASE_URL).origin;
/** Settings namespace carrying this provider's endpoint, model, and key reference. */
export const WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE = 'web-search-deepseek';
/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @param route - model provider route for this search, when known.
 * @returns options for one search.
 */
function resolveOptions(ctx, config, route) {
    const environment = launchEnvironmentOf(ctx);
    const explicitBaseURL = config.baseURL ?? environment.get(SEARCH_BASE_URL_ENV)?.value;
    let baseURL = explicitBaseURL ?? DEEPSEEK_DEFAULT_BASE_URL;
    let apiKeyEnv = credentialRef(config.apiKeyEnv);
    const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0
        ? config.apiKey
        : undefined;
    let keyError;
    if (literalApiKey === undefined) {
        try {
            const model = ctx.get('deepseekApiKeyRoute')?.activeOptions() ?? (environment.get('DEEPSEEK_BASE_URL') === undefined
                ? undefined : resolveAdapterOptions({}, environment));
            if (model !== undefined) {
                const modelOrigin = new URL(model.baseURL).origin;
                if (route === API_KEY_PROVIDER && explicitBaseURL === undefined && modelOrigin !== SEARCH_DEFAULT_ORIGIN
                    && config.apiKeyEnv === DEFAULT_API_KEY_ENV) {
                    baseURL = model.baseURL;
                    apiKeyEnv = model.apiKeyEnv;
                }
                if (apiKeyEnv === model.apiKeyEnv && URL.canParse(baseURL) && new URL(baseURL).origin !== modelOrigin) {
                    keyError = new WebError('The Messages search endpoint and the model API key belong to different origins. Set the search Base URL'
                        + ' to the model origin or configure a separate search API key reference.', 'WEB_PROVIDER_CREDENTIAL_ORIGIN_MISMATCH');
                }
            }
        }
        catch (cause) {
            keyError = new WebError('Correct the DeepSeek model endpoint before using a referenced key for Messages search.', 'WEB_PROVIDER_MISCONFIGURED', { cause });
        }
    }
    return {
        ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
        resolveAccountToken: endpoint => route === ACCOUNT_PROVIDER
            ? resolveDeepSeekAccountToken(ctx, endpoint) : Promise.resolve(undefined),
        rejectAccountToken: token => rejectDeepSeekAccountToken(ctx, token),
        resolveApiKey: () => keyError === undefined ? resolveDeepSeekApiKey(ctx, apiKeyEnv) : Promise.reject(keyError),
        ...keyError === undefined ? {} : { keyError },
        apiKeyEnv,
        baseURL,
        model: config.model,
        apiVersion: config.apiVersion,
        maxTokens: config.maxTokens,
        maxUses: config.maxUses,
        dispatch: (request, signal, send) => ctx.waterfall('web/deepseek-search-request', request, signal, send),
        recordRequest: (request) => {
            ctx.get('agents')?.currentInitiator()?.session.append('web/deepseek-search-llm-request', request);
        },
    };
}
/**
 * Whether the search a model request on `route` would make has a credential, checked in the order
 * the search resolves them: the account token first on the account route, then the API key. A failed
 * read answers false, because the search fails on that read instead of trying the next credential.
 * Only presence is checked: the API key's value is not read and the endpoint is not contacted, so a
 * wrong key or an endpoint without native search still counts as configured.
 * @param ctx - plugin context supplying the account, credential, and environment planes.
 * @param options - options the next search would use.
 * @param route - provider route of the model request being assembled.
 * @returns whether the account token or an API key is available to that search.
 */
async function searchConfigured(ctx, options, route) {
    const endpoint = messagesSearchEndpoint(options.baseURL);
    if (endpoint === undefined)
        return false;
    const account = ctx.get('deepseekAccount');
    if (route === ACCOUNT_PROVIDER && account !== undefined) {
        let token;
        try {
            token = await account.resolveToken(endpoint);
        }
        catch (_unreadableGrant) {
            return false; /* The search fails on this read before it tries the API key. */
        }
        if (token !== undefined && token.length > 0)
            return true;
    }
    if (options.apiKey !== undefined)
        return true;
    if (options.keyError !== undefined)
        return false;
    try {
        return await deepSeekApiKeyConfigured(ctx, options.apiKeyEnv);
    }
    catch (_unreadableStore) {
        return false; /* A store that cannot be read supplies no key to the search either. */
    }
}
/**
 * Register the DeepSeek search provider with `ctx.web`. Its `ready()` answers whether a
 * search for a model request on the given route would have a credential to send.
 */
export function apply(ctx, config) {
    const options = (route) => resolveOptions(ctx, {
        apiKey: config.apiKey.get(), apiKeyEnv: config.apiKeyEnv.get(), baseURL: config.baseURL.get(), model: config.model.get(),
        apiVersion: config.apiVersion.get(), maxTokens: config.maxTokens.get(), maxUses: config.maxUses.get(),
    }, route);
    const provider = new DeepSeekSearchProvider(() => options(ctx.get('agents')?.currentInitiator()?.session.requestContext()?.provider));
    ctx.web.registerSearchProvider({
        id: provider.id,
        description: provider.description,
        available: () => provider.available(),
        ready: llmProvider => searchConfigured(ctx, options(llmProvider), llmProvider),
        search: (request, signal) => provider.search(request, signal),
    });
}
//# sourceMappingURL=index.js.map