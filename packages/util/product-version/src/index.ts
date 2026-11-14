/** Calendar product identities shared by displays and package-manager readers. @module @deepseek-ai/dsh-product-version */
import * as calendar from './calendar.mjs'

/** Validated calendar day, daily sequence, and both version representations. */
export interface CalendarVersion {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly sequence: number
  readonly display: string
  readonly runtime: string
}

/** @param value Exact version. @returns Calendar identity, or undefined for other or invalid formats. */
export const parseCalendarVersion: (value: string) => CalendarVersion | undefined = calendar.parseCalendarVersion
/** @param value Calendar or legacy version. @returns Public calendar version, preserving legacy strings. */
export const displayProductVersion: (value: string) => string = calendar.displayProductVersion
/** @param value Calendar or legacy version. @returns Ordered runtime version, preserving legacy strings. */
export const runtimeProductVersion: (value: string) => string = calendar.runtimeProductVersion
/** @param date YYYYMMDD day. @param sequence Positive daily build number. @returns Runtime version. */
export const calendarBuildVersion: (date: string, sequence: number) => string = calendar.calendarBuildVersion
