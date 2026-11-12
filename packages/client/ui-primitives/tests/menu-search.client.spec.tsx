// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Menu } from '../src/Menu.tsx'

afterEach(cleanup)

it('waits for a portal position before focusing search, then returns focus on Escape', () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const anchorRef: { current: HTMLElement | null } = { current: null }
  const close = vi.fn()
  try {
    const menu = () => <Menu open portal anchor={null} onClose={close} anchorRef={anchorRef}
      search={{ label: 'Find workspace', value: '', onChange: vi.fn() }} items={[{ id: 'one', label: 'Workspace one' }]} />
    const view = render(menu())
    expect(document.activeElement).toBe(trigger)
    anchorRef.current = trigger
    view.rerender(menu())
    const search = screen.getByRole('searchbox', { name: 'Find workspace' })
    expect(document.activeElement).toBe(search)
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Workspace one' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
  } finally { trigger.remove() }
})
