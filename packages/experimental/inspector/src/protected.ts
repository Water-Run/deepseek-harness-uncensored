/** Optional target-policy admission for Host debugging; ordinary Inspector composition is unchanged. */
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-error'
import type {} from '@deepseek-ai/dsh-target-protection'

export { Config } from './index.ts'

/** Explicit protected composition entry. */
export const name = 'target-protected-inspector'
/** Target checks are required before the unavailable debugger can be requested. */
export const inject = ['targetProtection']

/**
 * Refuse arbitrary Host debugging in an explicitly protected composition.
 * @param ctx - Host context with the mandatory target-policy owner.
 * @throws HarnessError with the policy denial code or `INSPECTOR_PROTECTED_EXECUTION_UNAVAILABLE` when rules allow unconfined execution.
 */
export function apply(ctx: Context): void {
  const decision = ctx.targetProtection.checkUnconfined()
  throw new HarnessError(
    'Host debugging cannot constrain or revoke arbitrary Host effects. Use read-only Session Inspector in protected compositions.',
    decision.allowed ? 'INSPECTOR_PROTECTED_EXECUTION_UNAVAILABLE' : decision.code)
}
