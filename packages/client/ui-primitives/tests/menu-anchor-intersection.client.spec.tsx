// @vitest-environment jsdom
/** Anchored menus release their state when scrolling or reflow clips the trigger. */
import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { Menu } from '../src/Menu.tsx'

const observers: VisibilityObserver[] = []

class VisibilityObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly scrollMargin = '0px'
  readonly thresholds = [0]
  readonly observe = vi.fn<(element: Element) => void>()
  readonly unobserve = vi.fn<(element: Element) => void>()
  readonly disconnect = vi.fn()
  readonly takeRecords = (): IntersectionObserverEntry[] => []
  constructor(private readonly callback: IntersectionObserverCallback) { observers.push(this) }
  report(target: Element, isIntersecting: boolean): void {
    const rect = target.getBoundingClientRect()
    this.callback([{ target, isIntersecting, time: 0, rootBounds: null,
      boundingClientRect: rect, intersectionRect: rect, intersectionRatio: isIntersecting ? 1 : 0 }], this)
  }
}

afterEach(() => { cleanup(); observers.length = 0; vi.unstubAllGlobals() })

it('dismisses a clipped trigger once and discards visibility notifications after closing', () => {
  vi.stubGlobal('IntersectionObserver', VisibilityObserver)
  const close = vi.fn()
  function Fixture() {
    const [open, setOpen] = useState(true)
    return <Menu open={open} portal anchor={<button>Options</button>} items={[{ id: 'one', label: 'One' }]}
      onClose={() => { close(); setOpen(false) }} />
  }
  const view = render(<Fixture />)
  const observer = observers[0]
  if (observer === undefined) throw new Error('The menu must observe its trigger visibility')
  const target = observer.observe.mock.calls[0]?.[0]
  if (target === undefined) throw new Error('The menu trigger was not observed')
  act(() => { observer.report(target, true) })
  expect(screen.getByRole('menu')).toBeTruthy()
  act(() => { observer.report(target, false); observer.report(target, false) })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(close).toHaveBeenCalledTimes(1)
  expect(observer.disconnect).toHaveBeenCalledTimes(1)
  view.unmount()
  act(() => { observer.report(target, false) })
  expect(close).toHaveBeenCalledTimes(1)
})

it('ignores a queued visibility entry after the external ref points to a new trigger', () => {
  vi.stubGlobal('IntersectionObserver', VisibilityObserver)
  const original = document.createElement('button'), replacement = document.createElement('button')
  document.body.append(original, replacement)
  onTestFinished(() => { original.remove(); replacement.remove() })
  const anchorRef = { current: original }
  const close = vi.fn()
  const view = render(<Menu open portal anchor={null} anchorRef={anchorRef} items={[{ id: 'one', label: 'One' }]} onClose={close} />)
  const observer = observers[0]
  if (observer === undefined) throw new Error('The menu must observe its external trigger')
  anchorRef.current = replacement
  act(() => { observer.report(original, false) })
  expect(close).not.toHaveBeenCalled()
  view.unmount()
  expect(observer.disconnect).toHaveBeenCalledTimes(1)
  original.remove(); replacement.remove()
})

it('keeps pointer-positioned context menus independent of a synthetic zero-size anchor', () => {
  vi.stubGlobal('IntersectionObserver', VisibilityObserver)
  render(<Menu open portal contextual anchor={null} anchorPoint={{ x: 24, y: 24 }}
    items={[{ id: 'one', label: 'One' }]} onClose={vi.fn()} />)
  expect(screen.getByRole('menu')).toBeTruthy()
  expect(observers).toHaveLength(0)
})
