import { expect, it } from 'vitest'
import { balanceChart } from '../src/client/balance-chart.ts'
import { amountNumber, amountPrefix, formatRolling } from '../src/client/rolling-amount.ts'

it('draws additions vertically at the new sample time while preserving declines and expense curves', () => {
  const samples = [{ time: 0, value: 10 }, { time: 10, value: 0 }, { time: 20, value: 10 }, { time: 30, value: 5 }]
  const balance = balanceChart(samples, { stepIncreases: true })
  expect(balance.path).toBe('M52,12 L136,98 H220 M220,12 L304,55')
  expect(balance.increases).toBe('M220,98 V12')
  expect(balanceChart(samples).path).toBeUndefined()
  expect(balanceChart([{ time: 0, value: 10 }, { time: 10, value: 10 }], { stepIncreases: true }).increases).toBe('')
})

it('draws nothing, one dot, or a bounded curve', () => {
  expect(balanceChart([])).toEqual({ kind: 'empty', points: '', positions: [] })
  const single = balanceChart([{ time: 10, value: 4 }])
  expect(single.kind).toBe('single')
  expect(single.dot).toEqual({ x: 52, y: 55 })
  expect(single.range).toEqual({ low: 4, high: 4 })
  const series = balanceChart([{ time: 0, value: 1 }, { time: 10, value: 3 }])
  expect(series.kind).toBe('series')
  expect(series.points.split(' ')).toHaveLength(2)
  expect(series.range).toEqual({ low: 1, high: 3 })
  const long = balanceChart(Array.from({ length: 500 }, (_, index) => ({ time: index, value: index })))
  expect(long.kind).toBe('series')
  expect(long.points.split(' ').length).toBeLessThanOrEqual(121)
  expect(long.points.startsWith('52,')).toBe(true)
  expect(long.points.endsWith('304,12')).toBe(true)
})

it('snaps across currency marks and keeps two decimals while rolling', () => {
  expect(amountPrefix('¥12.00')).toBe('¥')
  expect(amountPrefix('$12.00')).toBe('$')
  expect(amountPrefix('<¥0.01')).toBe('<¥')
  expect(amountNumber('<¥0.01')).toBeUndefined()
  expect(amountNumber('—')).toBeUndefined()
  expect(amountNumber('')).toBeUndefined()
  expect(amountNumber('-¥12.00')).toBe(-12)
  expect(amountNumber('¥1,234.50')).toBe(1234.5)
  expect(formatRolling('¥10.00', 1.2)).toBe('¥1.20')
  expect(formatRolling('-¥10.00', -1.5)).toBe('-¥1.50')
})

it('preserves brief balance peaks and troughs when reducing long histories', () => {
  const data = Array.from({ length: 5000 }, (_, time) => ({ time, value: time === 2513 ? 100 : time === 3517 ? -100 : 0 }))
  const points = balanceChart(data).points.split(' ')
  expect(points.length).toBeLessThanOrEqual(120)
  expect(points.some(point => point.endsWith(',12'))).toBe(true)
  expect(points.some(point => point.endsWith(',98'))).toBe(true)
})
