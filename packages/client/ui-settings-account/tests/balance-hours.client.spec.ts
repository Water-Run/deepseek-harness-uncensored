import { expect, it } from 'vitest'
import { balancePeriod, balancePeriodEnd } from '../src/client/balance-hours.ts'

it.each([
  ['2026-10-23T01:00:00Z', 'peak'], ['2026-10-23T03:59:59Z', 'peak'], ['2026-10-23T04:00:00Z', 'valley'],
  ['2026-10-23T06:00:00Z', 'peak'], ['2026-10-23T10:00:00Z', 'valley'], ['2026-10-01T01:30:00Z', 'valley'],
  ['2026-10-10T01:30:00Z', 'valley'], ['2026-10-11T01:30:00Z', 'valley'],
  ['2026-01-04T01:30:00Z', 'valley'], ['2026-02-14T01:30:00Z', 'valley'], ['2026-02-28T01:30:00Z', 'valley'],
  ['2026-05-09T01:30:00Z', 'valley'], ['2026-09-20T01:30:00Z', 'valley'],
  ['2027-01-04T01:30:00Z', 'unknown'],
] as const)('classifies the published pricing window at %s as %s', (time, expected) => {
  expect(balancePeriod(Date.parse(time))).toBe(expected)
})

it.each([
  // Friday morning peak ends at 12:00 Beijing; the 12:00–14:00 lunch break is valley.
  ['2026-10-23T02:00:00Z', '2026-10-23T04:00:00Z'],
  // Friday lunch valley ends at the 14:00 peak start.
  ['2026-10-23T05:30:00Z', '2026-10-23T06:00:00Z'],
  // The 18:00–09:00 valley runs across the weekend to Monday 09:00.
  ['2026-10-23T10:30:00Z', '2026-10-26T01:00:00Z'],
  // A weekend day is valley until the next working day's peak starts.
  ['2026-10-10T02:00:00Z', '2026-10-12T01:00:00Z'],
  // National Day 2026 runs straight to the first working morning.
  ['2026-10-01T02:00:00Z', '2026-10-08T01:00:00Z'],
] as const)('reads the %s window as ending at %s', (time, expected) => {
  expect(balancePeriodEnd(Date.parse(time))).toBe(Date.parse(expected))
})

it('has no countdown while the holiday calendar cannot classify the window', () => {
  expect(balancePeriodEnd(Date.parse('2027-01-04T01:30:00Z'))).toBeUndefined()
})
