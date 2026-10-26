// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Menu } from '../src/Menu.tsx'

afterEach(cleanup)

it('waits for a portal position before focusing search, then returns focus on Escape', () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  let rect: DOMRect | null = null
  const close = vi.fn()
  try {
    render(<Menu open portal anchor={null} onClose={close} getAnchorRect={() => rect}
      search={{ label: 'Find workspace', value: '', onChange: vi.fn() }} items={[{ id: 'one', label: 'Workspace one' }]} />)
    expect(document.activeElement).toBe(trigger)
    act(() => { rect = new DOMRect(20, 20, 100, 30); fireEvent(window, new Event('resize')) })
    const search = screen.getByRole('searchbox', { name: 'Find workspace' })
    expect(document.activeElement).toBe(search)
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Workspace one' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
  } finally { trigger.remove() }
})
