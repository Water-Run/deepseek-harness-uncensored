/** Platform client identity headers and deployment cookies. */
import type { AccountClientMetadata } from './types.ts';
/** Merge Cookie header pairs by case-sensitive name, retaining unrelated cookies.
 * @param base - existing request cookies.
 * @param override - deployment cookies whose values take precedence.
 * @returns one Cookie header with at most one pair per name.
 */
export declare function mergePlatformCookies(base: string, override: string): string;
/**
 * Identify native desktop API requests; null leaves non-desktop requests unchanged.
 * @param platform - Operating system supplied by the desktop composition.
 * @returns Platform request headers shared by account and update-policy clients.
 */
export declare function desktopClientHeaders(platform: 'darwin' | 'win32' | null): Record<string, string>;
/**
 * Build the Platform client identity headers for one call.
 * @param platform - Operating system supplied by the desktop composition; null identifies the client as web.
 * @param client - identity of the requesting UI for this call.
 * @returns the five client headers; the bundle ID is intentionally empty.
 */
export declare function platformClientHeaders(platform: 'darwin' | 'win32' | null, client: AccountClientMetadata): Record<string, string>;
/**
 * Reduce a caller's UI language to the region-tagged Platform locale.
 * Shares one normalization with the header and with request body locale fields.
 * @param locale - active UI language such as `zh-CN`, `zh_TW`, or `en-US`.
 * @returns the region-tagged Platform locale for that language, `zh_CN` or `en_US`.
 */
export declare function platformWireLocale(locale: string): 'zh_CN' | 'en_US';
//# sourceMappingURL=client-metadata.d.ts.map