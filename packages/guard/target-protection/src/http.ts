/** HTTP fetch consumer whose mandatory target-policy owner cannot silently disappear. @module */
import type { Context } from '@deepseek-ai/cordis'
import { HttpFetchProvider, Config as HttpConfig, resolveHttpFetchLimits } from '@deepseek-ai/dsh-web-fetch-http'
import { WebError } from '@deepseek-ai/dsh-web'
import type {} from './index.ts'
import type { TargetDenialCode } from './types.ts'

/** Cordis diagnostics name. */
export const name = 'target-protected-http'
/** Both services are required; removing protection removes this provider. */
export const inject = ['targetProtection', 'web']
/** Shared HTTP transport limits and validation. */
export const Config = HttpConfig
/** Configuration of the shared HTTP provider. */
export type Config = HttpConfig

const REASONS: Record<TargetDenialCode, string> = {
  TARGET_FULLY_PROTECTED: 'This connection is blocked because the destination is fully protected.',
  TARGET_READ_ONLY: 'This operation cannot establish read-only effects on the protected destination.',
  TARGET_IDENTITY_UNVERIFIED: 'The destination identity or region could not be verified under the active protection rules.',
  TARGET_MAINLAND_PROTECTED: 'Mainland protection does not allow this operation on the destination.',
}

/**
 * Register the guarded provider under the normal HTTP id; do not mount the unguarded provider beside it.
 * @param ctx - Composition with a mandatory protection service.
 * @param config - Shared HTTP provider limits after schema defaults.
 */
export function apply(ctx: Context, config: Config): void {
  const protection = ctx.targetProtection
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'target-protected-http.lifetime')
  ctx.web.registerFetchProvider(new HttpFetchProvider(resolveHttpFetchLimits(config), undefined, async (destination, signal) => {
    const combined = AbortSignal.any([signal, lifetime.signal])
    combined.throwIfAborted()
    try {
      const extra = await ctx.serial('web-fetch/authorize', destination, combined)
      if (extra !== undefined) throw new WebError(extra.reason, 'WEB_TARGET_PROTECTED')
      const decision = await protection.checkHttp(destination, combined)
      combined.throwIfAborted()
      if (!decision.allowed) throw new WebError(REASONS[decision.code], decision.code)
    } catch (error) {
      if (signal.aborted) throw new Error('HTTP authorization cancelled.', { cause: signal.reason })
      if (error instanceof WebError) throw error
      throw new WebError('Target protection could not validate this connection; the request was stopped.', 'TARGET_PROTECTION_UNAVAILABLE', { cause: error })
    }
  }))
}
