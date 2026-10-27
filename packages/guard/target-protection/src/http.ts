/** HTTP fetch consumer whose mandatory target-policy owner cannot silently disappear. @module */
import type { Context } from '@deepseek-ai/cordis'
import { HttpFetchProvider, Config as HttpConfig, resolveHttpFetchLimits } from '@deepseek-ai/dsh-web-fetch-http'
import { WebError } from '@deepseek-ai/dsh-web'
import type {} from './index.ts'
import type { TargetHttpResolution } from './index.ts'
import { TargetProtectionError } from '@deepseek-ai/dsh-target-protection'
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
  TARGET_OWNER_RESOURCE: 'This operation cannot access an owner-managed protection resource.',
  TARGET_EXECUTION_UNCONFINED: 'This executor cannot constrain its effects to the selected targets.',
}

/**
 * Register the guarded provider under the normal HTTP id; do not mount the unguarded provider beside it.
 * @param ctx - Composition with a mandatory protection service.
 * @param config - Shared HTTP provider limits after schema defaults.
 */
export function apply(ctx: Context, config: Config): void {
  const protection = ctx.targetProtection
  const lifetime = new AbortController()
  const pending = new Set<Promise<boolean>>()
  ctx.effect(() => async () => { lifetime.abort(); await Promise.allSettled(pending) }, 'target-protected-http.lifetime')
  const limits = resolveHttpFetchLimits(config)
  ctx.web.registerFetchProvider({
    id: 'http', available: () => !lifetime.signal.aborted,
    async fetch(request, signal) {
      const release = protection.retainExecution()
      const settled = Promise.withResolvers<boolean>()
      pending.add(settled.promise)
      try {
        const policySignal = protection.executionSignal()
        const combined = AbortSignal.any([policySignal, lifetime.signal, ...signal === undefined ? [] : [signal]])
        let resolution: TargetHttpResolution | undefined
        const provider = new HttpFetchProvider(limits, async (hostname, requestSignal) => {
          resolution = await protection.resolveHttpTarget(hostname, requestSignal)
          return [...resolution.addresses]
        }, async (destination, requestSignal) => {
          if (destination.phase === 'before-resolution') resolution = undefined
          requestSignal.throwIfAborted()
          try {
            const extra = await ctx.serial('web-fetch/authorize', destination, requestSignal)
            if (extra !== undefined) throw new WebError(extra.reason, 'WEB_TARGET_PROTECTED')
            const decision = await protection.checkHttp(destination, requestSignal, resolution)
            requestSignal.throwIfAborted()
            if (!decision.allowed) throw new WebError(REASONS[decision.code], decision.code)
          } catch (error) {
            if (requestSignal.aborted) throw new Error('HTTP authorization cancelled.', { cause: requestSignal.reason })
            if (error instanceof WebError) throw error
            throw new WebError('Target protection could not validate this connection; the request was stopped.', 'TARGET_PROTECTION_UNAVAILABLE', { cause: error })
          }
        })
        try { return await provider.fetch(request, combined) }
        catch (error) {
          const reason: unknown = policySignal.reason
          if (policySignal.aborted && reason instanceof TargetProtectionError && reason.code === 'conflict' && !signal?.aborted) {
            throw new WebError('Target policy changed; the operation was stopped. Earlier network effects are not rolled back.', 'TARGET_POLICY_CHANGED', { cause: error })
          }
          throw error
        }
      } finally { settled.resolve(true); pending.delete(settled.promise); release() }
    },
  })
}
