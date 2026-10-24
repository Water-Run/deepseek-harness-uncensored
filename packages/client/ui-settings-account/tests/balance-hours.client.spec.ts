import { expect, it } from 'vitest'
import { balancePeriod } from '../src/client/balance-hours.ts'

it.each([
  ['2026-10-23T01:00:00Z', 'peak'], ['2026-10-23T03:59:59Z', 'peak'], ['2026-10-23T04:00:00Z', 'valley'],
  ['2026-10-23T06:00:00Z', 'peak'], ['2026-10-23T10:00:00Z', 'valley'], ['2026-10-01T01:30:00Z', 'valley'],
  ['2026-10-10T01:30:00Z', 'peak'], ['2026-10-11T01:30:00Z', 'valley'],
  ['2026-01-04T01:30:00Z', 'peak'], ['2026-02-14T01:30:00Z', 'peak'], ['2026-02-28T01:30:00Z', 'peak'],
  ['2026-05-09T01:30:00Z', 'peak'], ['2026-09-20T01:30:00Z', 'peak'],
  ['2027-01-04T01:30:00Z', 'unknown'],
] as const)('classifies the published pricing window at %s as %s', (time, expected) => {
  expect(balancePeriod(Date.parse(time))).toBe(expected)
})
