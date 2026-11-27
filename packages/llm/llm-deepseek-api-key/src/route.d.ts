/** The active official API-key route: shared resolution plus the service that publishes it. */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { ResolvedDeepSeekOptions } from './config.ts';
/** Provider id this package authenticates. */
export declare const PROVIDER = "deepseek-official";
/** Entry name the composed profile carries for this package. */
export declare const PACKAGE_NAME = "@deepseek-ai/dsh-llm-deepseek-api-key";
/**
 * Resolve the endpoint and credential reference of the active API-key route.
 * @param ctx - context with the model directory and Loader.
 * @returns a settings snapshot, or undefined when this package owns no active route.
 */
export declare function activeDeepSeekApiKeyOptions(ctx: Context): ResolvedDeepSeekOptions | undefined;
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Settings snapshot of the active official API-key route, when this package owns it. */
        deepseekApiKeyRoute: DeepSeekApiKeyRoute;
    }
}
/** Publishes the active route to packages that read the same composed settings. */
export declare class DeepSeekApiKeyRoute extends Service {
    /**
     * @param ctx - Host context that owns this service; unloading it unregisters the service.
     */
    constructor(ctx: Context);
    /**
     * Read the route from the model directory and the Loader entry.
     * @returns a settings snapshot, or undefined when this package owns no active route.
     */
    activeOptions(): ResolvedDeepSeekOptions | undefined;
}
//# sourceMappingURL=route.d.ts.map