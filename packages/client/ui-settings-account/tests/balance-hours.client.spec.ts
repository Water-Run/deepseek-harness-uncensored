import { expect, it } from 'vitest'
import { balancePeriod } from '../src/client/balance-hours.ts'

it.each([
  ['2026-10-23T01:00:00Z', 'peak'], ['2026-10-23T03:59:59Z', 'peak'], ['2026-10-23T04:00:00Z', 'valley'],
  ['2026-10-23T06:00:00Z', 'peak'], ['2026-10-23T10:00:00Z', 'valley'], ['2026-10-01T01:30:00Z', 'valley'],
  ['2026-10-10T01:30:00Z', 'valley'], ['2027-01-04T01:30:00Z', 'unknown'],
] as const)('classifies the published pricing window at %s as %s', (time, expected) => {
  expect(balancePeriod(Date.parse(time))).toBe(expected)
})
