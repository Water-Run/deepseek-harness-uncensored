/** Stable execution refusals shared by the guarded HTTP consumers. @module */
import type { Context } from '@deepseek-ai/cordis';
import { type HttpFetchDestination } from '@deepseek-ai/dsh-web-fetch-http';
import type { TargetDecision, TargetDenialCode } from './types.ts';
/** Credential-free explanations shared by guarded network protocol adapters. */
export declare const TARGET_REFUSAL_REASONS: Readonly<Record<TargetDenialCode, string>>;
/**
 * Stop before transport admission when a target decision refuses the operation.
 * @param decision - Deterministic decision from the rule owner.
 * @throws A WebError carrying the stable refusal code and no request credentials.
 */
export declare function assertNetworkAllowed(decision: TargetDecision): void;
/**
 * Apply the deployment veto shared by guarded HTTP transports.
 * @param ctx - Transport owner's context.
 * @param destination - Logical authority and available connection facts.
 * @param signal - Deadline and cancellation for this request.
 * @returns Completion of the checkpoint or rejection before transport admission.
 */
export declare function authorizeGuardedHttp(ctx: Context, destination: HttpFetchDestination, signal: AbortSignal): Promise<void>;
/**
 * Represent a CONNECT authority for HTTP destination checks.
 * @param host - CONNECT host or IP literal.
 * @param port - Effective CONNECT port.
 * @returns Validated authority URL without any inner request data.
 */
export declare function guardedTunnelUrl(host: string, port: number): URL;
//# sourceMappingURL=network-decision.d.ts.map