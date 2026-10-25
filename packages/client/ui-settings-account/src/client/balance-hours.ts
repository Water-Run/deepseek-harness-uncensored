/** DeepSeek pricing windows: https://api-docs.deepseek.com/quick_start/pricing/ */

// 2026 public holidays: 国办发明电〔2025〕7号
// https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
const HOLIDAYS_2026 = [[1, 1, 3], [2, 15, 23], [4, 4, 6], [5, 1, 5], [6, 19, 21], [9, 25, 27], [10, 1, 7]] as const
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** Published window boundaries in Beijing minutes: 09:00, 12:00, 14:00, 18:00. */
const BOUNDARY_MINUTES = [540, 720, 840, 1080] as const

/**
 * Classify published Beijing-time windows without guessing an unrecorded holiday calendar.
 * Peak is 09:00–12:00 and 14:00–18:00 on weekdays. 2026 holidays are off-peak.
 * Weekends, including makeup workdays, are off-peak under the API pricing rules.
 * Other years stay unknown during a weekday peak window.
 * @param time - Current timestamp.
 * @returns Peak, off-peak, or unknown during a potentially peak window in an unrecorded year.
 */
export function balancePeriod(time: number): 'peak' | 'valley' | 'unknown' {
  const beijing = new Date(time + BEIJING_OFFSET_MS)
  const year = beijing.getUTCFullYear()
  const month = beijing.getUTCMonth() + 1
  const day = beijing.getUTCDate()
  const weekday = beijing.getUTCDay()
  const minute = beijing.getUTCHours() * 60 + beijing.getUTCMinutes()
  const peak = (minute >= 540 && minute < 720) || (minute >= 840 && minute < 1080)
  if (!Number.isFinite(time)) return 'unknown'
  if (!peak || weekday === 0 || weekday === 6) return 'valley'
  if (year !== 2026) return 'unknown'
  const holiday = HOLIDAYS_2026.some(([holidayMonth, first, last]) => month === holidayMonth && day >= first && day <= last)
  if (holiday) return 'valley'
  return 'peak'
}

/** Start of the Beijing calendar day containing `time`. */
function beijingDayStart(time: number): number {
  const shifted = time + BEIJING_OFFSET_MS
  return shifted - ((shifted % DAY_MS) + DAY_MS) % DAY_MS - BEIJING_OFFSET_MS
}

/** First published window boundary strictly after `time`. */
function nextBoundary(time: number): number {
  const dayStart = beijingDayStart(time)
  for (const minute of BOUNDARY_MINUTES) {
    const boundary = dayStart + minute * 60_000
    if (boundary > time) return boundary
  }
  return dayStart + DAY_MS + BOUNDARY_MINUTES[0] * 60_000
}

/**
 * End of the pricing window in effect at `time`: the next boundary at which the
 * classification changes. A weekday off-peak slot ends at the next peak start,
 * while a weekend or holiday runs to the next working day's 09:00. Used for the
 * sidebar's live "time left in this period" reading.
 * @param time - Current timestamp.
 * @returns the period end as epoch milliseconds, or undefined when the period is unknown.
 */
export function balancePeriodEnd(time: number): number | undefined {
  const period = balancePeriod(time)
  if (period === 'unknown') return undefined
  let boundary = nextBoundary(time)
  // A weekend plus a long holiday block is the extreme case (2026-10-01..07 is
  // 28 boundaries); the bound only guards against a calendar that never changes class.
  for (let steps = 0; steps < 64; steps += 1) {
    if (balancePeriod(boundary) !== period) return boundary
    boundary = nextBoundary(boundary)
  }
  return undefined
}
