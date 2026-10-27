/** Stable execution refusals shared by the guarded HTTP consumers. @module */
import { WebError } from '@deepseek-ai/dsh-web'
import type { TargetDecision, TargetDenialCode } from './types.ts'

const REASONS: Readonly<Record<TargetDenialCode, string>> = {
  TARGET_FULLY_PROTECTED: 'This connection is blocked because the destination is fully protected.',
  TARGET_READ_ONLY: 'This operation cannot establish read-only effects on the protected destination.',
  TARGET_IDENTITY_UNVERIFIED: 'The destination identity or region could not be verified under the active protection rules.',
  TARGET_MAINLAND_PROTECTED: 'Mainland protection does not allow this operation on the destination.',
  TARGET_OWNER_RESOURCE: 'This operation cannot access an owner-managed protection resource.',
  TARGET_EXECUTION_UNCONFINED: 'This executor cannot constrain its effects to the selected targets.',
}

/**
 * Stop before transport admission when a target decision refuses the operation.
 * @param decision - Deterministic decision from the rule owner.
 * @throws A WebError carrying the stable refusal code and no request credentials.
 */
export function assertNetworkAllowed(decision: TargetDecision): void {
  if (!decision.allowed) throw new WebError(REASONS[decision.code], decision.code)
}
