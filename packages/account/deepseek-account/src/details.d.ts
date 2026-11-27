import type { AccountDetails, AccountProfile } from './types.ts';
/** Project Platform user data without retaining credentials or unneeded fields.
 * @param value - current or exchange user response.
 * @returns UI account profile.
 */
export declare function profile(value: unknown): AccountProfile;
/**
 * Read one Platform account field without waiting for the other query.
 * @param field - profile or recharge and bonus wallet balances.
 * @param origin - configured account API origin.
 * @param token - stored authorization token; response tokens are discarded.
 * @param signal - request and credential lifetime.
 * @param headers - validated deployment headers for the configured origin.
 * @returns sanitized query outcome; failure never becomes a zero balance.
 * @throws AccountUnauthorizedError when Platform rejects the stored token with HTTP 401 or response code 40003.
 */
export declare function readAccountDetail<K extends keyof AccountDetails>(field: K, origin: string, token: string, signal: AbortSignal, headers: Record<string, string>): Promise<AccountDetails[K]>;
//# sourceMappingURL=details.d.ts.map