// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Menu } from '../src/Menu.tsx'
import { Modal } from '../src/Modal.tsx'
import { closeTopModal } from '../src/useModalLayer.ts'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('puts a retained dialog above a newer dialog when reopened', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const closeReference = vi.fn()
  const closeSettings = vi.fn()
  const overlays = (reference: boolean, settings: boolean) => <>
    <Modal open={reference} onClose={closeReference} title="Reference" closeLabel="Close reference"><input aria-label="Search" /></Modal>
    <Modal open={settings} onClose={closeSettings} title="Settings" closeLabel="Close settings"><button>Preferences</button></Modal>
  </>
  const view = render(overlays(true, false))
  const reference = screen.getByRole('dialog', { name: 'Reference' })
  view.rerender(overlays(false, false))
  expect(reference.closest('[inert]')).not.toBeNull()
  view.rerender(overlays(false, true))
  const settings = screen.getByRole('dialog', { name: 'Settings' })
  view.rerender(overlays(true, true))
  expect(screen.getByRole('dialog', { name: 'Reference' })).toBe(reference)
  expect(screen.getAllByRole('dialog').map(node => node.getAttribute('aria-label'))).toEqual(['Settings', 'Reference'])
  expect(reference.contains(document.activeElement)).toBe(true)
  closeTopModal(document)
  expect(closeReference).toHaveBeenCalledOnce()
  expect(closeSettings).not.toHaveBeenCalled()
  view.rerender(overlays(false, true))
  expect(settings.contains(document.activeElement)).toBe(true)
  act(() => { vi.advanceTimersByTime(120) })
  expect(document.contains(reference)).toBe(false)
})

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
