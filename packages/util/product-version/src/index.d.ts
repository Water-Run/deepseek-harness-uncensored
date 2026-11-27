/** Validated calendar day, daily sequence, and both version representations. */
export interface CalendarVersion {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly sequence: number;
    readonly display: string;
    readonly runtime: string;
}
/**
 * Parse public or runtime calendar versions without accepting tag prefixes.
 * @param value - Exact version to validate.
 * @returns Calendar identity, or undefined for other or invalid formats.
 */
export declare const parseCalendarVersion: (value: string) => CalendarVersion | undefined;
/**
 * Format a product version for display while preserving legacy strings.
 * @param value - Calendar or legacy version.
 * @returns Public calendar version or the unchanged legacy value.
 */
export declare const displayProductVersion: (value: string) => string;
/**
 * Map calendar versions to their sortable package representation.
 * @param value - Calendar or legacy version; callers validate legacy formats.
 * @returns Ordered runtime version or the unchanged legacy value.
 */
export declare const runtimeProductVersion: (value: string) => string;
/**
 * Construct a runtime version from an explicit day and daily build sequence.
 * @param date - Eight-digit YYYYMMDD day.
 * @param sequence - Daily build number, 0 for the day's first build, at most 65535.
 * @returns Runtime version.
 * @throws When the date or sequence is invalid.
 */
export declare const calendarBuildVersion: (date: string, sequence: number) => string;
//# sourceMappingURL=index.d.ts.map