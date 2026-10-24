// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RollingAmount } from '../src/client/RollingAmount.tsx'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function animation() {
  let time = 0, id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const media = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => media)
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => { frames.delete(frame) })
  const tick = (next: number): void => {
    time = next
    const current = [...frames.values()]; frames.clear()
    act(() => { for (const callback of current) callback(time) })
  }
  return { tick, media, frames }
}

it('retargets from the displayed amount and cancels its frame when unmounted', () => {
  const { tick, frames } = animation()
  const view = render(<RollingAmount text="¥1.00" />)
  view.rerender(<RollingAmount text="¥2.00" />)
  tick(225)
  expect(view.container.textContent).toBe('¥1.88')
  view.rerender(<RollingAmount text="¥3.00" />)
  expect(view.container.textContent).toBe('¥1.88')
  tick(675)
  expect(view.container.textContent).toBe('¥3.00')
  view.rerender(<RollingAmount text="¥4.00" />)
  expect(frames.size).toBe(1)
  view.unmount()
  expect(frames.size).toBe(0)
})

it('snaps on currency changes and when reduced motion is enabled during an animation', () => {
  const { media, frames } = animation()
  const view = render(<RollingAmount text="¥1.00" />)
  view.rerender(<RollingAmount text="$2.00" />)
  expect(view.container.textContent).toBe('$2.00')
  expect(frames.size).toBe(0)
  view.rerender(<RollingAmount text="$3.00" />)
  act(() => { media.matches = true; media.dispatchEvent(new Event('change')) })
  expect(view.container.textContent).toBe('$3.00')
  expect(frames.size).toBe(0)
})
