import { expect, it } from 'vitest'
import { balanceChart } from '../src/client/balance-chart.ts'
import { amountNumber, amountPrefix, formatRolling } from '../src/client/rolling-amount.ts'

it('draws nothing, one dot, or a bounded curve', () => {
  expect(balanceChart([])).toEqual({ kind: 'empty', points: '' })
  const single = balanceChart([{ time: 10, value: 4 }])
  expect(single.kind).toBe('single')
  expect(single.dot).toEqual({ x: 12, y: 55 })
  const series = balanceChart([{ time: 0, value: 1 }, { time: 10, value: 3 }])
  expect(series.kind).toBe('series')
  expect(series.points.split(' ')).toHaveLength(2)
  const long = balanceChart(Array.from({ length: 500 }, (_, index) => ({ time: index, value: index })))
  expect(long.kind).toBe('series')
  expect(long.points.split(' ').length).toBeLessThanOrEqual(121)
  expect(long.points.startsWith('12,')).toBe(true)
  expect(long.points.endsWith('288,12')).toBe(true)
})

it('snaps across currency marks and keeps two decimals while rolling', () => {
  expect(amountPrefix('¥12.00')).toBe('¥')
  expect(amountPrefix('$12.00')).toBe('$')
  expect(amountPrefix('<¥0.01')).toBe('<¥')
  expect(amountNumber('<¥0.01')).toBeUndefined()
  expect(amountNumber('¥1,234.50')).toBe(1234.5)
  expect(formatRolling('¥10.00', 1.2)).toBe('¥1.20')
  expect(formatRolling('-¥10.00', -1.5)).toBe('-¥1.50')
})
