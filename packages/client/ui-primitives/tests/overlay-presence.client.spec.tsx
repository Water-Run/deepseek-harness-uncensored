// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Menu } from '../src/Menu.tsx'
import { Modal } from '../src/Modal.tsx'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

for (const kind of ['menu', 'dialog'] as const) {
  const overlay = (open: boolean) => kind === 'menu'
    ? <Menu open={open} onClose={() => {}} anchor={<button>Choose</button>} items={[{ id: 'one', label: 'One' }]} />
    : <Modal open={open} onClose={() => {}} title="Options" closeLabel="Close"><button>One</button></Modal>

  it(`${kind} stops accepting input immediately and cancels stale removal when reopened`, () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const view = render(overlay(true))
    const element = screen.getByRole(kind)
    view.rerender(overlay(false))
    expect(screen.queryByRole(kind)).toBeNull()
    expect(element.closest('[inert][aria-hidden="true"]')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(60) })
    view.rerender(overlay(true))
    act(() => { vi.advanceTimersByTime(120) })
    expect(screen.getByRole(kind)).toBe(element)
    view.rerender(overlay(false))
    act(() => { vi.advanceTimersByTime(120) })
    expect(document.contains(element)).toBe(false)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it(`${kind} removes its dismissed paint immediately when motion is reduced`, () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const view = render(overlay(true))
    const element = screen.getByRole(kind)
    view.rerender(overlay(false))
    expect(document.contains(element)).toBe(false)
  })
}
