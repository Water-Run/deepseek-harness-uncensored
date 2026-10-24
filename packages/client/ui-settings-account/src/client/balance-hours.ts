/** DeepSeek pricing windows: https://api-docs.deepseek.com/quick_start/pricing/ */

// 2026 public holidays and makeup workdays: 国办发明电〔2025〕7号
// https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
const HOLIDAYS_2026 = [[1, 1, 3], [2, 15, 23], [4, 4, 6], [5, 1, 5], [6, 19, 21], [9, 25, 27], [10, 1, 7]] as const
const MAKEUP_WORKDAYS_2026 = new Set(['1-4', '2-14', '2-28', '5-9', '9-20', '10-10'])
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * Classify published Beijing-time windows without guessing an unrecorded holiday calendar.
 * Peak is 09:00–12:00 and 14:00–18:00 on weekdays. 2026 holidays are off-peak.
 * Official 2026 makeup workdays stay peak. Other years stay unknown during a weekday peak window.
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
  if (!peak) return 'valley'
  if (year !== 2026) return weekday === 0 || weekday === 6 ? 'valley' : 'unknown'
  const holiday = HOLIDAYS_2026.some(([holidayMonth, first, last]) => month === holidayMonth && day >= first && day <= last)
  if (holiday) return 'valley'
  const weekend = weekday === 0 || weekday === 6
  if (weekend && !MAKEUP_WORKDAYS_2026.has(`${month}-${day}`)) return 'valley'
  return 'peak'
}
