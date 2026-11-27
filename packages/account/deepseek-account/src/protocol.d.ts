/** Validated platform HTTP messages and restricted browser destinations. */
import { z } from 'zod';
import type { AccountNotificationEvent, AccountNotificationId, SignInErrorCode } from './types.ts';
/** Request header carrying the account token on every request the token authenticates. */
export declare const ACCOUNT_TOKEN_HEADER = "x-dsh-auth-token";
/** Protocol errors expose a stable code, never a response body or authorization URL. */
export declare class PlatformAuthError extends Error {
    readonly code: SignInErrorCode;
    /** @param code - safe error classification. */
    constructor(code: SignInErrorCode);
}
/** An authenticated Platform request was rejected with HTTP 401 or code 40003. */
export declare class AccountUnauthorizedError extends PlatformAuthError {
    constructor();
}
/**
 * Accept HTTPS platform endpoints, or explicitly configured loopback development HTTP.
 * @param value - configured origin.
 * @param allowLoopbackHttp - development-only opt-in.
 * @param field - configuration field named in validation errors.
 * @returns normalized origin.
 */
export declare function platformOrigin(value: string, allowLoopbackHttp: boolean, field: 'platformOrigin' | 'harnessOrigin'): string;
/**
 * Validate platform-owned browser destinations without forwarding arbitrary URLs.
 * @param value - returned browser URL.
 * @param origin - configured platform origin.
 * @param path - fixed authorize or completion path.
 * @param rewriteOrigin - map validated browser pages to the configured development origin.
 * @returns normalized URL on the configured origin.
 */
export declare function browserUrl(value: string, origin: string, path: string, rewriteOrigin?: boolean): string;
/**
 * Validate Host-only deployment headers without exposing their values in diagnostics.
 * @param values - configured headers for the Platform origin.
 * @returns normalized headers; authorization, routing and framing remain provider-owned.
 */
export declare function platformHeaders(values: Record<string, string>): Record<string, string>;
/** Successful initialization response. */
export declare const initialization: z.ZodObject<{
    authorize_url: z.ZodURL;
    authorize_id: z.ZodString;
    expires_in: z.ZodNumber;
}, z.core.$strip>;
/** Successful code exchange response. */
export declare const exchange: z.ZodObject<{
    token: z.ZodString;
    authorized_url: z.ZodURL;
    user: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
/**
 * Read one bounded platform response; non-cancellation failures emit non-secret diagnostics to stderr.
 * @param origin - validated platform origin.
 * @param method - platform endpoint suffix.
 * @param body - protocol request, never logged.
 * @param signal - attempt cancellation and timeout.
 * @param headers - validated deployment headers for this origin.
 * @returns successful business payload, validated by its caller.
 */
export declare function requestPlatform(origin: string, method: string, body: unknown, signal: AbortSignal, headers: Record<string, string>): Promise<unknown>;
/**
 * Fetch a fixed Platform account endpoint with the grant kept in Host request headers.
 * @param origin - configured and grant-matched origin.
 * @param path - account endpoint.
 * @param token - account grant.
 * @param signal - credential lifetime and request timeout.
 * @param headers - validated deployment headers for this origin.
 * @returns successful business payload.
 */
export declare function requestAccount(origin: string, path: '/auth-api/v0/users/current' | '/api/v0/users/get_user_summary', token: string, signal: AbortSignal, headers: Record<string, string>): Promise<unknown>;
/**
 * Read unconsumed account notifications in server order.
 * @param origin - configured account API origin.
 * @param token - stored account grant.
 * @param signal - credential lifetime and request timeout.
 * @param headers - deployment and client identity headers for this origin.
 * @returns successful business payload holding the notification list.
 */
export declare function requestNotifications(origin: string, token: string, signal: AbortSignal, headers: Record<string, string>): Promise<unknown>;
/**
 * Read localized notification content, including a consumed notification.
 * @param origin - configured account API origin.
 * @param token - stored account grant.
 * @param id - notification requested by its owning account.
 * @param signal - credential lifetime and request timeout.
 * @param headers - deployment and client identity headers for this origin.
 * @returns successful business payload containing one notification.
 */
export declare function requestNotificationContent(origin: string, token: string, id: AccountNotificationId, signal: AbortSignal, headers: Record<string, string>): Promise<unknown>;
/**
 * Report an account notification interaction to the events endpoint.
 * @param origin - configured account API origin.
 * @param token - stored account grant.
 * @param id - notification the user interacted with.
 * @param event - displayed frame, business-action click, or explicit dismissal.
 * @param signal - credential lifetime and request timeout.
 * @param headers - deployment and client identity headers for this origin.
 * @returns successful business payload containing the consumption decision.
 */
export declare function requestNotificationEvent(origin: string, token: string, id: AccountNotificationId, event: AccountNotificationEvent, signal: AbortSignal, headers: Record<string, string>): Promise<unknown>;
/**
 * End the Platform session using its existing logout endpoint.
 * @param origin - configured account API origin.
 * @param token - stored account token.
 * @param signal - logout request deadline.
 * @param headers - validated deployment headers for this origin.
 * @returns after Platform confirms logout.
 */
export declare function logoutAccount(origin: string, token: string, signal: AbortSignal, headers: Record<string, string>): Promise<void>;
/**
 * Accept a browser-accessible loopback HTTP origin for local or SSH-forwarded login.
 * @param value - loopback HTTP origin with an explicit port supplied by the authenticated initiating client.
 * @returns normalized origin; remote domains and path-based proxies are unsupported.
 */
export declare function loginOrigin(value: string): string;
//# sourceMappingURL=protocol.d.ts.map