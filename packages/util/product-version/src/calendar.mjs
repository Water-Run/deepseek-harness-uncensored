/** Calendar identity with a sortable, stable SemVer representation for package managers. */
/**
 * @typedef {object} CalendarVersion
 * @property {number} year Calendar year.
 * @property {number} month Calendar month.
 * @property {number} day Calendar day.
 * @property {number} sequence Daily sequence, whose first build is 0.
 * @property {string} display Public YYYY.MM.DD.N version.
 * @property {string} runtime Ordered YYYY.MMDD.N package version.
 */

/**
 * Parse public YYYY.MM.DD.N or internal YYYY.MMDD.N calendar versions.
 * @param {string} value - Exact version without a tag prefix.
 * @returns {CalendarVersion | undefined} Validated date and both representations.
 */
export function parseCalendarVersion(value) {
  const display = /^(\d{4})\.(\d{2})\.(\d{2})\.(0|[1-9]\d*)$/u.exec(value)
  const runtime = display === null ? /^(\d{4})\.([1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value) : null
  if (display === null && runtime === null) return undefined
  const year = Number((display ?? runtime)[1])
  const monthDay = runtime === null ? 0 : Number(runtime[2])
  const month = display === null ? Math.floor(monthDay / 100) : Number(display[2])
  const day = display === null ? monthDay % 100 : Number(display[3])
  const sequence = Number(display === null ? runtime[3] : display[4])
  if (year < 2000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31
    || !Number.isSafeInteger(sequence) || sequence > 65535) return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return undefined
  return Object.freeze({ year, month, day, sequence,
    display: `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}.${sequence}`,
    runtime: `${year}.${month * 100 + day}.${sequence}`,
  })
}

/**
 * Format a product version for people, retaining legacy version strings.
 * @param {string} value - Calendar or legacy version.
 * @returns {string} Public calendar version or the unchanged legacy value.
 */
export function displayProductVersion(value) {
  return parseCalendarVersion(value)?.display ?? value
}

/**
 * Normalize calendar versions for SemVer-based dependencies and update engines.
 * @param {string} value - Calendar or legacy version.
 * @returns {string} Runtime calendar version or the unchanged legacy value; callers validate legacy formats.
 */
export function runtimeProductVersion(value) {
  return parseCalendarVersion(value)?.runtime ?? value
}

/**
 * Construct the runtime version for an explicit calendar day and build sequence.
 * @param {string} date - Eight-digit YYYYMMDD day.
 * @param {number} sequence - Daily sequence from 0 for the day's first build, at most 65535.
 * @returns {string} Sortable runtime version.
 * @throws {Error} When the date or sequence is invalid.
 */
export function calendarBuildVersion(date, sequence) {
  const parts = /^(\d{4})(\d{2})(\d{2})$/u.exec(date)
  const parsed = parts === null ? undefined : parseCalendarVersion(`${parts[1]}.${parts[2]}.${parts[3]}.${sequence}`)
  if (parsed === undefined) throw new Error('product version: invalid calendar day or daily build sequence')
  return parsed.runtime
}
