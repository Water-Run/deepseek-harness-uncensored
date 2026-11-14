/** Calendar identity read by source-only packaging scripts. */
export interface CalendarVersion {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly sequence: number
  readonly display: string
  readonly runtime: string
}
/** @param value Exact version. @returns Calendar identity, or undefined for other or invalid formats. */
export function parseCalendarVersion(value: string): CalendarVersion | undefined
/** @param value Calendar or legacy version. @returns Public calendar version, preserving legacy strings. */
export function displayProductVersion(value: string): string
/** @param value Calendar or legacy version. @returns Ordered runtime version, preserving legacy strings. */
export function runtimeProductVersion(value: string): string
/** @param date YYYYMMDD day. @param sequence Positive daily build number. @returns Runtime version. */
export function calendarBuildVersion(date: string, sequence: number): string
