import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { deepSeekConfigFields, isBuiltInCatalog, modelListingConfigFields, modelListingURL, plainOptions as protocolOptions, PUBLIC_BASE_URL, resolveAdapterOptions as resolveProtocolOptions, resolveListingTiming, resolveVisibleModels, } from '@deepseek-ai/dsh-llm-deepseek';
/** Origin of the official API, the only endpoint whose `/models` listing this route follows. */
const OFFICIAL_ORIGIN = new URL(PUBLIC_BASE_URL).origin;
export const Config = z.object({
    ...deepSeekConfigFields,
    ...modelListingConfigFields,
    apiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY').volatile(),
});
/** Read one validated provider configuration.
 * @param config - live plugin configuration.
 * @returns detached resolver inputs.
 */
export function plainOptions(config) {
    return { ...protocolOptions(config), apiKeyEnv: config.apiKeyEnv.get() };
}
/** Resolve API-key, listing, and protocol settings together.
 * @param config - raw deployment settings.
 * @param environment - application launch environment.
 * @returns validated endpoint facts, the matching credential reference, and the listing the catalog follows.
 */
export function resolveAdapterOptions(config, environment) {
    const { modelsTimeoutMs: _timeout, modelsMaxAgeMs: _maxAge, visibleModels: _visible, apiKeyEnv, ...messages } = config;
    const timing = resolveListingTiming(config, 'llm-deepseek-api-key');
    const connection = resolveProtocolOptions(messages, environment);
    const listed = new URL(connection.baseURL).origin === OFFICIAL_ORIGIN && isBuiltInCatalog(connection.models);
    return {
        ...connection,
        visibleModels: resolveVisibleModels(config, 'llm-deepseek-api-key'),
        apiKeyEnv: credentialRef(apiKeyEnv ?? 'DEEPSEEK_API_KEY'),
        ...listed ? { listing: { url: modelListingURL(connection.baseURL), ...timing } } : {},
    };
}
//# sourceMappingURL=config.js.map