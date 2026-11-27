/** Credential values shared by DeepSeek model and web providers; callers own protocol headers and missing-key errors. */
import type { Context } from '@deepseek-ai/cordis';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
/**
 * Read and validate one API key. An installed credentials service is authoritative, including absence;
 * only deployments without that service read the launch environment. Store and format failures propagate.
 * @param ctx - context providing the credential and launch-environment services.
 * @param ref - credential reference to resolve.
 * @returns the validated key, or undefined when no key is configured.
 */
export declare function resolveDeepSeekApiKey(ctx: Context, ref: CredentialRef): Promise<string | undefined>;
/**
 * Check key presence without resolving a credential-store value or validating its format. Store failures propagate.
 * @param ctx - context providing the credential and launch-environment services.
 * @param ref - credential reference to inspect.
 * @returns whether the authoritative credential source reports a configured key.
 */
export declare function deepSeekApiKeyConfigured(ctx: Context, ref: CredentialRef): Promise<boolean>;
/**
 * Read an account token only for a destination allowed by the account service. Credential-store failures propagate.
 * @param ctx - context providing the optional account service.
 * @param endpoint - destination that would receive the token.
 * @returns the token, or undefined without an allowed signed-in account.
 */
export declare function resolveDeepSeekAccountToken(ctx: Context, endpoint: string): Promise<string | undefined>;
/**
 * Invalidate the account token rejected by a request, without clearing a newer sign-in. Removal failure is contained
 * so callers can report the original request failure; the account service owns in-memory invalidation and persistence.
 * @param ctx - context providing the optional account service.
 * @param token - exact token sent by the rejected request.
 * @returns settlement after the invalidation attempt.
 */
export declare function rejectDeepSeekAccountToken(ctx: Context, token: string): Promise<void>;
//# sourceMappingURL=credential.d.ts.map