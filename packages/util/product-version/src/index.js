/** Calendar product identities shared by displays and package-manager readers. @module @deepseek-ai/dsh-product-version */
import * as calendar from './calendar.mjs';
/**
 * Parse public or runtime calendar versions without accepting tag prefixes.
 * @param value - Exact version to validate.
 * @returns Calendar identity, or undefined for other or invalid formats.
 */
export const parseCalendarVersion = calendar.parseCalendarVersion;
/**
 * Format a product version for display while preserving legacy strings.
 * @param value - Calendar or legacy version.
 * @returns Public calendar version or the unchanged legacy value.
 */
export const displayProductVersion = calendar.displayProductVersion;
/**
 * Map calendar versions to their sortable package representation.
 * @param value - Calendar or legacy version; callers validate legacy formats.
 * @returns Ordered runtime version or the unchanged legacy value.
 */
export const runtimeProductVersion = calendar.runtimeProductVersion;
/**
 * Construct a runtime version from an explicit day and daily build sequence.
 * @param date - Eight-digit YYYYMMDD day.
 * @param sequence - Daily build number, 0 for the day's first build, at most 65535.
 * @returns Runtime version.
 * @throws When the date or sequence is invalid.
 */
export const calendarBuildVersion = calendar.calendarBuildVersion;
//# sourceMappingURL=index.js.map