/** Sunrise and sunset estimates and the city chosen for them. */
import { describe, expect, it } from 'vitest'
import { daylightIntervals, isSunLocation, resolveSunCity, SUN_CITIES, SUN_LOCATIONS, sunDay, sunPhase } from '../src/sun.ts'

/** Minutes since local midnight of one instant in a zone. */
function localMinutes(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const value = (type: string): number => Number(parts.find(part => part.type === type)?.value)
  return value('hour') * 60 + value('minute')
}

describe('sunDay', () => {
  it.each([
    ['Shanghai, June solstice', 31.23, 121.47, Date.UTC(2026, 5, 21), 'Asia/Shanghai', 4 * 60 + 50, 19 * 60 + 1],
    ['Beijing, December solstice', 39.9, 116.4, Date.UTC(2026, 11, 21), 'Asia/Shanghai', 7 * 60 + 33, 16 * 60 + 53],
    ['London, June solstice', 51.51, -0.13, Date.UTC(2026, 5, 21), 'Europe/London', 4 * 60 + 43, 21 * 60 + 21],
    ['Sydney, June solstice', -33.87, 151.21, Date.UTC(2026, 5, 21), 'Australia/Sydney', 7 * 60, 16 * 60 + 54],
  ] as const)('matches published times within three minutes: %s', (_name, latitude, longitude, day, zone, sunrise, sunset) => {
    const result = sunDay(day, latitude, longitude)
    if (result.kind !== 'cycle') throw new Error(`expected a sunrise and sunset, got ${result.kind}`)
    expect(Math.abs(localMinutes(result.sunrise, zone) - sunrise)).toBeLessThanOrEqual(3)
    expect(Math.abs(localMinutes(result.sunset, zone) - sunset)).toBeLessThanOrEqual(3)
    expect(Number.isInteger(result.sunrise) && Number.isInteger(result.sunset)).toBe(true)
  })

  it('reports polar day and polar night', () => {
    expect(sunDay(Date.UTC(2026, 5, 21), 69.65, 18.96)).toEqual({ kind: 'polar-day' })
    expect(sunDay(Date.UTC(2026, 11, 21), 69.65, 18.96)).toEqual({ kind: 'polar-night' })
  })
})

describe('daylight intervals and phase', () => {
  const noon = Date.UTC(2026, 5, 21, 4)
  const evening = Date.UTC(2026, 5, 21, 14)

  it('classifies daylight with the current interval and the sunset as the next change', () => {
    const phase = sunPhase(noon, 31.23, 121.47)
    expect(phase.daylight).toBe(true)
    expect(phase.interval?.[0]).toBeLessThan(noon)
    expect(phase.next).toBe(phase.interval?.[1])
  })

  it('classifies night with the next interval and its sunrise as the next change', () => {
    const phase = sunPhase(evening, 31.23, 121.47)
    expect(phase.daylight).toBe(false)
    expect(phase.interval?.[0]).toBeGreaterThan(evening)
    expect(phase.next).toBe(phase.interval?.[0])
  })

  it('merges adjacent polar days into one interval and omits polar nights', () => {
    expect(daylightIntervals(Date.UTC(2026, 5, 21, 12), 78.22, 15.65)).toHaveLength(1)
    expect(daylightIntervals(Date.UTC(2026, 11, 21, 12), 78.22, 15.65)).toEqual([])
    expect(sunPhase(Date.UTC(2026, 11, 21, 12), 78.22, 15.65)).toEqual({ daylight: false })
  })
})

describe('resolveSunCity', () => {
  it('lists automatic first and accepts only listed locations', () => {
    expect(SUN_LOCATIONS[0]).toBe('auto')
    expect(SUN_LOCATIONS).toHaveLength(SUN_CITIES.length + 1)
    expect(isSunLocation('beijing')).toBe(true)
    expect(isSunLocation('atlantis')).toBe(false)
  })

  it('prefers a manual city, then an exact zone, then a shared UTC offset', () => {
    const at = Date.UTC(2026, 5, 21)
    expect(resolveSunCity('beijing', 'Europe/London', at)).toMatchObject({ city: { id: 'beijing' }, source: 'manual' })
    expect(resolveSunCity('auto', 'Asia/Shanghai', at)).toMatchObject({ city: { id: 'shanghai' }, source: 'zone' })
    expect(resolveSunCity('auto', 'Asia/Chita', at)).toMatchObject({ city: { id: 'tokyo' }, source: 'offset' })
  })

  it('returns nothing for an unknown or absent zone', () => {
    expect(resolveSunCity('auto', 'Etc/Unknown', 0)).toBeUndefined()
    expect(resolveSunCity('auto', undefined, 0)).toBeUndefined()
    expect(resolveSunCity('auto', 'Pacific/Chatham', Date.UTC(2026, 0, 1))).toBeUndefined()
  })
})
