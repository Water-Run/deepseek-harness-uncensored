/** The active official API-key route: shared resolution plus the service that publishes it. */
import { FiberState, Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { Config, plainOptions, resolveAdapterOptions } from './config.ts'
import type { ResolvedDeepSeekOptions } from './config.ts'

/** Provider id this package authenticates. */
export const PROVIDER = 'deepseek-official'

/** Entry name the composed profile carries for this package. */
export const PACKAGE_NAME = '@deepseek-ai/dsh-llm-deepseek-api-key'

/**
 * Resolve the endpoint and credential reference of the active API-key route.
 * @param ctx - context with the model directory and Loader.
 * @returns a settings snapshot, or undefined when this package owns no active route.
 */
export function activeDeepSeekApiKeyOptions(ctx: Context): ResolvedDeepSeekOptions | undefined {
  const llm = ctx.get('llm')
  const loader = ctx.get('loader')
  if (llm === undefined || loader === undefined || !llm.listProviders().some(row => row.id === PROVIDER)) return undefined
  const directory = llm.listConfigurableProviders().find(row => row.provider === PROVIDER)
  if (directory === undefined || directory.settingsPath.length !== 0) return undefined
  const entry = [...loader.entries()].find(row => row.options.id === directory.settingsNs && row.options.name === PACKAGE_NAME)
  if (entry?.fiber?.state !== FiberState.ACTIVE) return undefined
  return resolveAdapterOptions(plainOptions(entry.fiber.effectiveConfig as Config), launchEnvironmentOf(ctx))
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Settings snapshot of the active official API-key route, when this package owns it. */
    deepseekApiKeyRoute: DeepSeekApiKeyRoute
  }
}

/** Publishes the active route to packages that read the same composed settings. */
export class DeepSeekApiKeyRoute extends Service {
  /**
   * @param ctx - Host context that owns this service; unloading it unregisters the service.
   */
  constructor(ctx: Context) { super(ctx, 'deepseekApiKeyRoute') }

  /**
   * Read the route from the model directory and the Loader entry.
   * @returns a settings snapshot, or undefined when this package owns no active route.
   */
  activeOptions(): ResolvedDeepSeekOptions | undefined { return activeDeepSeekApiKeyOptions(this.ctx) }
}
