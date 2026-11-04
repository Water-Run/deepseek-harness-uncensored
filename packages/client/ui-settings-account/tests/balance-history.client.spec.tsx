// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BalanceHistory } from '../src/client/BalanceHistory.tsx'
import { nearestBalanceSample } from '../src/client/balance-chart.ts'

afterEach(cleanup)

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

it('chooses the nearest time, clamps pointer edges and handles coincident observations', () => {
  const samples = [{ time: 0, value: 1 }, { time: 90, value: 2 }, { time: 100, value: 3 }]
  expect(nearestBalanceSample(samples, -1)).toBe(0)
  expect(nearestBalanceSample(samples, .89)).toBe(1)
  expect(nearestBalanceSample(samples, .99)).toBe(2)
  expect(nearestBalanceSample(samples, 2)).toBe(2)
  expect(nearestBalanceSample(samples.map(sample => ({ ...sample, time: 0 })), .5)).toBe(1)
  expect(nearestBalanceSample([], .5)).toBe(0)
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
