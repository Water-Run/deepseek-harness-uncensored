import { describe, expect, it } from 'vitest'
import { compare } from 'semver'
import { calendarBuildVersion, displayProductVersion, parseCalendarVersion, runtimeProductVersion } from '../src/index.ts'

describe('calendar product versions', () => {
  it.each(['2026.11.14.1', '2026.1114.1'])('normalizes %s to one identity', (value) => {
    expect(parseCalendarVersion(value)).toEqual({ year: 2026, month: 11, day: 14, sequence: 1,
      display: '2026.11.14.1', runtime: '2026.1114.1' })
  })
  it.each(['2026.11.14.0', '2026.1114.0'])('starts a day at sequence 0 for %s', (value) => {
    expect(parseCalendarVersion(value)).toEqual({ year: 2026, month: 11, day: 14, sequence: 0,
      display: '2026.11.14.0', runtime: '2026.1114.0' })
  })
  it.each(['2026.02.29.1', '2026.04.31.1', '2026.00.14.1', '2026.13.01.1',
    '2026.11.14.01', '2026.11.14.65536', '2026.1114.1+metadata', '0.1.0', '2026.1.2.1'])('rejects %s as calendar identity', (value) => {
    expect(parseCalendarVersion(value)).toBeUndefined()
  })
  it('keeps daily, monthly and yearly builds ordered by the updater', () => {
    const values = ['2026.01.01.0', '2026.01.01.1', '2026.01.01.9', '2026.01.01.10', '2026.01.02.0', '2026.02.01.1', '2027.01.01.1']
    for (let i = 1; i < values.length; i++) {
      expect(compare(runtimeProductVersion(values[i]!), runtimeProductVersion(values[i - 1]!))).toBe(1)
    }
    expect(compare(runtimeProductVersion(values[0]!), '0.1.0-test.20261113.5')).toBe(1)
  })
  it('preserves legacy values and formats leap days and Windows-sized build fields', () => {
    expect(displayProductVersion('0.1.0-test.20261113.5')).toBe('0.1.0-test.20261113.5')
    expect(runtimeProductVersion('0.1.0')).toBe('0.1.0')
    expect(displayProductVersion(calendarBuildVersion('20280229', 65535))).toBe('2028.02.29.65535')
    expect(displayProductVersion(calendarBuildVersion('20261114', 0))).toBe('2026.11.14.0')
    expect(() => calendarBuildVersion('20260229', 1)).toThrow(/invalid calendar/)
    expect(() => calendarBuildVersion('20261114', -1)).toThrow(/invalid calendar/)
  })
})
