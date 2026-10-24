/**
 * Sunrise and sunset estimates for the `sun` theme preference. A time zone
 * names a region, not a position, so the automatic location is the zone's
 * representative city; every result is an estimate for that city, not for the
 * device. Times follow the sunrise equation (about one minute of error at
 * mid latitudes) with the standard 0.833 degree refraction and solar-disc
 * allowance.
 */

/** One selectable city with its position and the IANA zones it represents. */
export interface SunCity {
  /** Stable settings identity. */
  readonly id: string
  /** Degrees north; south is negative. */
  readonly latitude: number
  /** Degrees east; west is negative. */
  readonly longitude: number
  /** IANA zones for which this city is the automatic estimate. */
  readonly zones: readonly string[]
}

/** Selectable cities: Chinese regions first, then major cities by UTC offset. */
export const SUN_CITIES = [
  { id: 'beijing', latitude: 39.9, longitude: 116.4, zones: [] },
  { id: 'shanghai', latitude: 31.23, longitude: 121.47, zones: ['Asia/Shanghai', 'PRC', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin'] },
  { id: 'guangzhou', latitude: 23.13, longitude: 113.26, zones: [] },
  { id: 'shenzhen', latitude: 22.54, longitude: 114.06, zones: [] },
  { id: 'chengdu', latitude: 30.57, longitude: 104.07, zones: [] },
  { id: 'chongqing', latitude: 29.56, longitude: 106.55, zones: [] },
  { id: 'wuhan', latitude: 30.59, longitude: 114.31, zones: [] },
  { id: 'hangzhou', latitude: 30.27, longitude: 120.16, zones: [] },
  { id: 'xian', latitude: 34.34, longitude: 108.94, zones: [] },
  { id: 'harbin', latitude: 45.8, longitude: 126.53, zones: [] },
  { id: 'kunming', latitude: 25.04, longitude: 102.71, zones: [] },
  { id: 'lhasa', latitude: 29.65, longitude: 91.17, zones: [] },
  { id: 'urumqi', latitude: 43.83, longitude: 87.62, zones: ['Asia/Urumqi', 'Asia/Kashgar'] },
  { id: 'hong-kong', latitude: 22.32, longitude: 114.17, zones: ['Asia/Hong_Kong', 'Hongkong'] },
  { id: 'macau', latitude: 22.2, longitude: 113.54, zones: ['Asia/Macau', 'Asia/Macao'] },
  { id: 'taipei', latitude: 25.03, longitude: 121.57, zones: ['Asia/Taipei', 'ROC'] },
  { id: 'tokyo', latitude: 35.68, longitude: 139.69, zones: ['Asia/Tokyo', 'Japan'] },
  { id: 'seoul', latitude: 37.57, longitude: 126.98, zones: ['Asia/Seoul', 'ROK'] },
  { id: 'singapore', latitude: 1.35, longitude: 103.82, zones: ['Asia/Singapore', 'Singapore', 'Asia/Kuala_Lumpur'] },
  { id: 'bangkok', latitude: 13.76, longitude: 100.5, zones: ['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Jakarta'] },
  { id: 'new-delhi', latitude: 28.61, longitude: 77.21, zones: ['Asia/Kolkata', 'Asia/Calcutta'] },
  { id: 'dubai', latitude: 25.2, longitude: 55.27, zones: ['Asia/Dubai'] },
  { id: 'moscow', latitude: 55.76, longitude: 37.62, zones: ['Europe/Moscow', 'W-SU'] },
  { id: 'berlin', latitude: 52.52, longitude: 13.4, zones: ['Europe/Berlin', 'Europe/Amsterdam', 'Europe/Vienna', 'Europe/Zurich'] },
  { id: 'paris', latitude: 48.86, longitude: 2.35, zones: ['Europe/Paris', 'Europe/Brussels', 'Europe/Madrid', 'Europe/Rome'] },
  { id: 'london', latitude: 51.51, longitude: -0.13, zones: ['Europe/London', 'GB', 'Europe/Dublin', 'Europe/Lisbon'] },
  { id: 'new-york', latitude: 40.71, longitude: -74.01, zones: ['America/New_York', 'US/Eastern', 'America/Toronto', 'EST5EDT'] },
  { id: 'chicago', latitude: 41.88, longitude: -87.63, zones: ['America/Chicago', 'US/Central', 'CST6CDT'] },
  { id: 'denver', latitude: 39.74, longitude: -104.99, zones: ['America/Denver', 'US/Mountain', 'MST7MDT'] },
  { id: 'los-angeles', latitude: 34.05, longitude: -118.24, zones: ['America/Los_Angeles', 'US/Pacific', 'America/Vancouver', 'PST8PDT'] },
  { id: 'sao-paulo', latitude: -23.55, longitude: -46.63, zones: ['America/Sao_Paulo', 'Brazil/East'] },
  { id: 'sydney', latitude: -33.87, longitude: 151.21, zones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/ACT', 'Australia/NSW'] },
  { id: 'auckland', latitude: -36.85, longitude: 174.76, zones: ['Pacific/Auckland', 'NZ'] },
] as const satisfies readonly SunCity[]

/** Identity of one selectable city. */
export type SunCityId = typeof SUN_CITIES[number]['id']

/** Location setting value that estimates the city from the time zone. */
export const SUN_LOCATION_AUTO = 'auto'

/** Accepted location settings: automatic, then every city. */
export const SUN_LOCATIONS = [SUN_LOCATION_AUTO, ...SUN_CITIES.map(city => city.id)] as const

/** Persisted location setting. */
export type SunLocation = typeof SUN_LOCATIONS[number]

/** How a city was chosen: by the user, by an exact zone match, or by sharing the zone's current UTC offset. */
export type SunCitySource = 'manual' | 'zone' | 'offset'

/** City used for the estimate and how it was chosen. */
export interface ResolvedSunCity {
  readonly city: SunCity
  readonly source: SunCitySource
}

const DAY_MS = 86_400_000
const J1970 = 2440587.5
const J2000 = 2451545
const J2000_NOON_MS = Date.UTC(2000, 0, 1, 12)
const RAD = Math.PI / 180
const OBLIQUITY = 23.4397 * RAD
const HORIZON = -0.833 * RAD

/**
 * Narrow a stored value to a location setting.
 * @param value - Value read from settings or a control.
 * @returns whether the value names automatic or a known city.
 */
export function isSunLocation(value: unknown): value is SunLocation {
  return SUN_LOCATIONS.some(location => location === value)
}

function utcOffset(timeZone: string, at: number): string | undefined {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at).find(part => part.type === 'timeZoneName')?.value
  } catch (error) {
    // An unknown zone name throws RangeError; the caller then has no offset to compare.
    if (error instanceof RangeError) return undefined
    throw error
  }
}

/**
 * Choose the city for the estimate.
 * @param location - Stored location setting.
 * @param timeZone - IANA zone of the device, absent when unknown.
 * @param at - Instant whose UTC offset an unlisted zone is compared at.
 * @returns the city and how it was chosen, or undefined when an automatic location matches no city.
 */
export function resolveSunCity(location: SunLocation, timeZone: string | undefined, at: number): ResolvedSunCity | undefined {
  if (location !== SUN_LOCATION_AUTO) {
    const city = SUN_CITIES.find(candidate => candidate.id === location)
    return city === undefined ? undefined : { city, source: 'manual' }
  }
  if (timeZone === undefined) return undefined
  const zoned = SUN_CITIES.find(candidate => candidate.zones.some(zone => zone === timeZone))
  if (zoned !== undefined) return { city: zoned, source: 'zone' }
  const offset = utcOffset(timeZone, at)
  if (offset === undefined) return undefined
  const shared = SUN_CITIES.find((candidate) => {
    const zone: string | undefined = candidate.zones[0]
    return zone !== undefined && utcOffset(zone, at) === offset
  })
  return shared === undefined ? undefined : { city: shared, source: 'offset' }
}

/** Sunrise and sunset of one UTC day, or the polar state when the sun stays up or down all day. */
export type SunDay =
  | { readonly kind: 'cycle'; readonly sunrise: number; readonly sunset: number }
  | { readonly kind: 'polar-day' }
  | { readonly kind: 'polar-night' }

/**
 * Estimate sunrise and sunset around the solar noon of one UTC day.
 * @param dayStart - UTC midnight in epoch milliseconds.
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 * @returns whole epoch-millisecond sunrise and sunset, or the polar state.
 */
export function sunDay(dayStart: number, latitude: number, longitude: number): SunDay {
  const day = Math.round((dayStart + DAY_MS / 2 - J2000_NOON_MS) / DAY_MS)
  const meanNoon = day - longitude / 360
  const anomaly = ((357.5291 + 0.98560028 * meanNoon) % 360) * RAD
  const center = 1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly)
  const ecliptic = ((anomaly / RAD + center + 180 + 102.9372) % 360) * RAD
  const transit = J2000 + meanNoon + 0.0053 * Math.sin(anomaly) - 0.0069 * Math.sin(2 * ecliptic)
  const declination = Math.asin(Math.sin(ecliptic) * Math.sin(OBLIQUITY))
  const phi = latitude * RAD
  const cosHour = (Math.sin(HORIZON) - Math.sin(phi) * Math.sin(declination)) / (Math.cos(phi) * Math.cos(declination))
  if (cosHour > 1) return { kind: 'polar-night' }
  if (cosHour < -1) return { kind: 'polar-day' }
  const hour = Math.acos(cosHour) / RAD / 360
  return {
    kind: 'cycle',
    sunrise: Math.round((transit - hour - J1970) * DAY_MS),
    sunset: Math.round((transit + hour - J1970) * DAY_MS),
  }
}

/**
 * Daylight intervals for the UTC days around an instant, in ascending order.
 * @param at - Instant the window is centered on.
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 * @returns half-open `[start, end)` epoch-millisecond intervals from the day before through two days after.
 */
export function daylightIntervals(at: number, latitude: number, longitude: number): [number, number][] {
  const today = Math.floor(at / DAY_MS) * DAY_MS
  const intervals: [number, number][] = []
  for (let offset = -1; offset <= 2; offset++) {
    const dayStart = today + offset * DAY_MS
    const day = sunDay(dayStart, latitude, longitude)
    if (day.kind === 'polar-night') continue
    const interval: [number, number] = day.kind === 'polar-day' ? [dayStart, dayStart + DAY_MS] : [day.sunrise, day.sunset]
    const last = intervals.at(-1)
    if (last !== undefined && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1])
    else intervals.push(interval)
  }
  return intervals
}

/** Whether the sun is up and when that next changes. */
export interface SunPhase {
  readonly daylight: boolean
  /** Next sunrise or sunset within the computed window, absent through a long polar period. */
  readonly next?: number
  /** The current daylight interval, or the next one while it is dark. */
  readonly interval?: readonly [number, number]
}

/**
 * Classify one instant at a position.
 * @param at - Instant to classify.
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 * @returns daylight state, the next change, and the relevant daylight interval.
 */
export function sunPhase(at: number, latitude: number, longitude: number): SunPhase {
  const intervals = daylightIntervals(at, latitude, longitude)
  const current = intervals.find(([start, end]) => start <= at && at < end)
  const upcoming = intervals.find(([start]) => start > at)
  const next = current?.[1] ?? upcoming?.[0]
  const interval = current ?? upcoming
  return {
    daylight: current !== undefined,
    ...(next === undefined ? {} : { next }),
    ...(interval === undefined ? {} : { interval }),
  }
}
