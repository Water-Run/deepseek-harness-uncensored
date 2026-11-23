// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BalanceHistory } from '../src/client/BalanceHistory.tsx'
import { balanceChart, nearestBalanceSample } from '../src/client/balance-chart.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('reveals distinct sub-cent balances while moving across the original observations', () => {
  const values = ['63.889919', '63.885418', '63.880017']
  render(<BalanceHistory samples={values.map((exactValue, index) => ({ time: index * 1000, value: Number(exactValue), exactValue }))}
    symbol="¥" label="History" help="Inspect samples" />)
  const slider = screen.getByRole('slider', { name: 'History' })
  Object.defineProperty(slider, 'getBoundingClientRect', { value: () => new DOMRect(0, 0, 264, 110) })
  for (const [index, clientX] of [6, 132, 258].entries()) {
    fireEvent(slider, new MouseEvent('pointermove', { bubbles: true, clientX, clientY: 55 }))
    expect(screen.getByRole('status').textContent).toContain(`¥${values[index]}`)
    expect(slider.getAttribute('aria-valuenow')).toBe(String(index))
  }
  expect(screen.getByText('¥63.8899')).toBeTruthy()
  const tip = screen.getByRole('status')
  expect(tip.querySelector('strong')?.textContent).toBe('¥63.88')
  expect(tip.textContent).toContain('¥63.880017')
})

it('inspects original samples by keyboard and clears the tooltip after losing focus', () => {
  const samples = Array.from({ length: 500 }, (_, index) => ({ time: index * 1000, value: 500 - index }))
  render(<BalanceHistory samples={samples} symbol="¥" label="History" help="Inspect samples" />)
  const slider = screen.getByRole('slider', { name: 'History' })
  fireEvent.focus(slider)
  expect(slider.getAttribute('aria-valuenow')).toBe('499')
  fireEvent.keyDown(slider, { key: 'Home' })
  expect(slider.getAttribute('aria-valuetext')).toContain('¥500.00')
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(slider.getAttribute('aria-valuetext')).toContain('¥499.00')
  expect(screen.getByRole('status').textContent).toContain('¥499.00')
  fireEvent.keyDown(slider, { key: 'End' })
  expect(slider.getAttribute('aria-valuetext')).toContain('¥1.00')
  fireEvent.blur(slider)
  expect(screen.queryByRole('status')).toBeNull()
})

it.each(['pointer', 'keyboard'] as const)('keeps the selected %s observation as old samples roll out', (mode) => {
  const samples = [{ time: 0, value: 9 }, { time: 1000, value: 8.0001, exactValue: '8.0001' }, { time: 2000, value: 7 }]
  const chart = (observations: typeof samples) => <BalanceHistory samples={observations} symbol="¥" label="History" help="Inspect samples" />
  const view = render(chart(samples))
  const slider = screen.getByRole('slider', { name: 'History' })
  if (mode === 'keyboard') {
    fireEvent.focus(slider)
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
  } else {
    Object.defineProperty(slider, 'getBoundingClientRect', { value: () => new DOMRect(0, 0, 264, 110) })
    fireEvent(slider, new MouseEvent('pointermove', { bubbles: true, clientX: 132, clientY: 55 }))
  }
  const tip = screen.getByRole('status')
  expect(tip.textContent).toContain('¥8.0001')
  view.rerender(chart([...samples.slice(1).map(sample => ({ ...sample })), { time: 3000, value: 6 }]))
  expect(tip.textContent).toContain('¥8.0001')
  expect(tip.querySelector('time')?.dateTime).toBe(new Date(1000).toISOString())
  expect(slider.getAttribute('aria-valuenow')).toBe('0')
  view.rerender(chart([{ time: 1000, value: 8.0001, exactValue: '8.000100000000000001' }, ...samples.slice(1)]))
  expect(tip.querySelector('strong')?.textContent).toBe('¥8.00')
  expect(tip.textContent).toContain('¥8.0001')
  expect(slider.getAttribute('aria-valuenow')).toBe('1')
  view.rerender(chart([{ time: 2000, value: 7 }, { time: 3000, value: 6 }, { time: 4000, value: 5 }]))
  expect(tip.querySelector('time')?.dateTime).toBe(new Date(2000).toISOString())
})

it('chooses the nearest time, clamps pointer edges and handles coincident observations', () => {
  const samples = [{ time: 0, value: 1 }, { time: 90, value: 2 }, { time: 100, value: 3 }]
  const { positions } = balanceChart(samples)
  expect(nearestBalanceSample(positions, -1)).toBe(0)
  expect(nearestBalanceSample(positions, .89)).toBe(1)
  expect(nearestBalanceSample(positions, .99)).toBe(2)
  expect(nearestBalanceSample(positions, 2)).toBe(2)
  expect(nearestBalanceSample(balanceChart(samples.map(sample => ({ ...sample, time: 0 }))).positions, .5)).toBe(1)
  expect(nearestBalanceSample([], .5)).toBe(0)
})

it('shortens the flat run while keeping earlier changes and the original samples inspectable', () => {
  const samples = [
    { time: 0, value: 12 }, { time: 60_000, value: 10 }, { time: 7_260_000, value: 10 },
    { time: 14_460_000, value: 10 }, { time: 14_520_000, value: 9 },
  ]
  const axis = balanceChart(samples, { dashes: true, stepIncreases: true })
  expect(axis.positions).toEqual([0, .4, .5, .6, 1])
  expect(axis.compressed).toMatch(/^M[^ ]+ H[^ ]+$/u)
  expect(axis.path?.match(/L/gu)).toHaveLength(2)
  render(<BalanceHistory samples={samples} symbol="¥" label="History" help="Inspect samples" dashHint="Shortened time" stepIncreases />)
  expect(screen.getByText('Shortened time')).toBeTruthy()
  const slider = screen.getByRole('slider', { name: 'History' })
  Object.defineProperty(slider, 'getBoundingClientRect', { value: () => new DOMRect(0, 0, 264, 110) })
  fireEvent(slider, new MouseEvent('pointermove', { bubbles: true, clientX: 132, clientY: 55 }))
  expect(slider.getAttribute('aria-valuenow')).toBe('2')
  expect(screen.getByRole('status').querySelector('time')?.dateTime).toBe(new Date(samples[2]!.time).toISOString())
})

it('marks a stretch without samples as dashed and explains the dashes', () => {
  const dense = Array.from({ length: 8 }, (_, index) => ({ time: index * 15_000, value: 10 + index / 100 }))
  const observed = render(<BalanceHistory samples={dense} symbol="¥" label="History" help="Inspect samples" dashHint="Dashes mean no sample" />)
  expect(screen.queryByText('Dashes mean no sample')).toBeNull()
  observed.unmount()
  render(<BalanceHistory samples={[...dense, { time: 7 * 15_000 + 4 * 3_600_000, value: 9.5 }]}
    symbol="¥" label="History" help="Inspect samples" dashHint="Dashes mean no sample" />)
  const hint = screen.getByText('Dashes mean no sample')
  const describedBy = screen.getByRole('slider', { name: 'History' }).getAttribute('aria-describedby')?.split(' ') ?? []
  expect(describedBy).toContain(hint.id)
  expect(describedBy).toHaveLength(2)
})

it('follows the pointer between samples and flips inside the plot at its edges', () => {
  render(<BalanceHistory samples={[{ time: 0, value: 1 }, { time: 100, value: 2 }]} symbol="¥" label="History" help="Inspect samples" />)
  const slider = screen.getByRole('slider', { name: 'History' })
  fireEvent.focus(slider)
  const tip = screen.getByRole('status')
  Object.defineProperties(slider, {
    clientWidth: { value: 240 }, clientHeight: { value: 110 },
    getBoundingClientRect: { value: () => new DOMRect(40, 60, 240, 110) },
  })
  Object.defineProperties(tip, { offsetWidth: { value: 120 }, offsetHeight: { value: 40 } })
  function move(clientX: number, clientY: number): void {
    const event = new MouseEvent('pointermove', { bubbles: true, clientX, clientY })
    Object.defineProperty(event, 'pointerType', { value: 'mouse' })
    fireEvent(slider, event)
  }
  move(50, 68)
  expect(tip.style.left).toBe('18px')
  expect(tip.style.top).toBe('16px')
  expect(tip.textContent).toContain('¥1.00')
  move(54, 74)
  expect(tip.style.left).toBe('22px')
  expect(tip.style.top).toBe('22px')
  expect(tip.textContent).toContain('¥1.00')
  move(278, 168)
  expect(tip.style.left).toBe('110px')
  expect(tip.style.top).toBe('60px')
  expect(tip.textContent).toContain('¥2.00')
  fireEvent.keyDown(slider, { key: 'Home' })
  expect(tip.style.left).toBe('')
  expect(tip.style.top).toBe('')
  expect(tip.textContent).toContain('¥1.00')
})

it('keeps the sample bubble inside a resized plot without another pointer move', () => {
  const view = render(<BalanceHistory samples={[{ time: 0, value: 1 }, { time: 100, value: 2 }]} symbol="¥" label="History" help="Inspect samples" />)
  const slider = screen.getByRole('slider', { name: 'History' })
  fireEvent.focus(slider)
  const tip = screen.getByRole('status')
  let width = 480
  Object.defineProperties(slider, {
    clientWidth: { get: () => width }, clientHeight: { value: 110 },
    getBoundingClientRect: { value: () => new DOMRect(40, 60, width, 110) },
  })
  Object.defineProperties(tip, { offsetWidth: { value: 120 }, offsetHeight: { value: 40 } })
  const pointer = new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 80 })
  Object.defineProperty(pointer, 'pointerType', { value: 'mouse' })
  fireEvent(slider, pointer)
  expect(tip.style.left).toBe('168px')
  const selected = slider.getAttribute('aria-valuenow')
  width = 170
  fireEvent(window, new Event('resize'))
  expect(Number.parseFloat(tip.style.left) + tip.offsetWidth).toBeLessThanOrEqual(width)
  expect(tip.style.left).toBe('32px')
  expect(slider.getAttribute('aria-valuenow')).toBe(selected)
  view.unmount()
  width = 480
  fireEvent(window, new Event('resize'))
  expect(tip.style.left).toBe('32px')
})

it('reuses the mounted bubble observer across pointer movement and stops it on unmount', () => {
  const observers: RecordingObserver[] = []
  class RecordingObserver implements ResizeObserver {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
    constructor(private readonly callback: ResizeObserverCallback) { observers.push(this) }
    notify(): void { this.callback([], this) }
  }
  vi.stubGlobal('ResizeObserver', RecordingObserver)
  const view = render(<BalanceHistory samples={[{ time: 0, value: 1 }, { time: 100, value: 2 }]} symbol="¥" label="History" help="Inspect samples" />)
  const slider = screen.getByRole('slider', { name: 'History' })
  fireEvent.focus(slider)
  const tip = screen.getByRole('status')
  let width = 240, size = 120, left = 40
  Object.defineProperties(slider, {
    clientWidth: { get: () => width }, clientHeight: { value: 110 },
    getBoundingClientRect: { value: () => new DOMRect(left, 60, width * 2, 220) },
  })
  Object.defineProperties(tip, { offsetWidth: { get: () => size }, offsetHeight: { value: 40 } })
  const move = (clientX: number): void => {
    const event = new MouseEvent('pointermove', { bubbles: true, clientX, clientY: 76 })
    Object.defineProperty(event, 'pointerType', { value: 'mouse' })
    fireEvent(slider, event)
  }
  move(60)
  expect(tip.style.left).toBe('18px')
  expect(tip.style.top).toBe('16px')
  const first = observers[0]!
  expect(first.observe).toHaveBeenCalledWith(slider)
  expect(first.observe).toHaveBeenCalledWith(tip)
  move(360)
  expect(observers).toEqual([first])
  expect(first.disconnect).not.toHaveBeenCalled()
  width = 170
  first.notify()
  expect(tip.style.left).toBe('32px')
  size = 140
  first.notify()
  expect(tip.style.left).toBe('12px')
  left = 0
  fireEvent(window, new Event('scroll'))
  expect(tip.style.left).toBe('30px')
  view.unmount()
  expect(first.disconnect).toHaveBeenCalledOnce()
  width = 240
  first.notify()
  fireEvent(window, new Event('scroll'))
  expect(tip.style.left).toBe('30px')
})
