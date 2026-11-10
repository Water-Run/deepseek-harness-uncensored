/** Stable execution refusals shared by the guarded HTTP consumers. @module */
import type { Context } from '@deepseek-ai/cordis'
import { WebError } from '@deepseek-ai/dsh-web'
import { validateFetchUrl, type HttpFetchDestination } from '@deepseek-ai/dsh-web-fetch-http'
import type { TargetDecision, TargetDenialCode } from './types.ts'

/** Credential-free explanations shared by guarded network protocol adapters. */
export const TARGET_REFUSAL_REASONS: Readonly<Record<TargetDenialCode, string>> = {
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
  if (!decision.allowed) throw new WebError(TARGET_REFUSAL_REASONS[decision.code], decision.code)
}

/**
 * Apply the deployment veto shared by guarded HTTP transports.
 * @param ctx - Transport owner's context.
 * @param destination - Logical authority and available connection facts.
 * @param signal - Deadline and cancellation for this request.
 * @returns Completion of the checkpoint or rejection before transport admission.
 */
export async function authorizeGuardedHttp(ctx: Context, destination: HttpFetchDestination, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const veto = await ctx.serial('web-fetch/authorize', Object.freeze(destination), signal)
  signal.throwIfAborted()
  if (veto !== undefined) throw new WebError(veto.reason, 'WEB_TARGET_PROTECTED')
}

/**
 * Represent a CONNECT authority for HTTP destination checks.
 * @param host - CONNECT host or IP literal.
 * @param port - Effective CONNECT port.
 * @returns Validated authority URL without any inner request data.
 */
export function guardedTunnelUrl(host: string, port: number): URL {
  const name = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return validateFetchUrl(`https://${name}:${String(port)}/`)
}
