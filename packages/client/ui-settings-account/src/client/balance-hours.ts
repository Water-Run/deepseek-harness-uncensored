/** DeepSeek pricing windows: https://api-docs.deepseek.com/quick_start/pricing/ */

// 2026 public holidays: https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
const HOLIDAYS_2026 = [[1, 1, 3], [2, 15, 23], [4, 4, 6], [5, 1, 5], [6, 19, 21], [9, 25, 27], [10, 1, 7]] as const

/**
 * Classify the published UTC windows without guessing future holiday calendars.
 * @param time - Current timestamp.
 * @returns Peak, off-peak, or unknown during a potentially peak window in an unrecorded year.
 */
export function balancePeriod(time: number): 'peak' | 'valley' | 'unknown' {
  const date = new Date(time)
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes()
  const weekday = date.getUTCDay()
  if (weekday === 0 || weekday === 6 || !((minute >= 60 && minute < 240) || (minute >= 360 && minute < 600))) return 'valley'
  if (date.getUTCFullYear() !== 2026) return 'unknown'
  return HOLIDAYS_2026.some(([month, first, last]) => date.getUTCMonth() + 1 === month && date.getUTCDate() >= first && date.getUTCDate() <= last) ? 'valley' : 'peak'
}
