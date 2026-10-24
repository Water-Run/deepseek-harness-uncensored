// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Select } from '../src/Select.tsx'

afterEach(cleanup)
const options = [{ value: 'auto', label: 'Automatic' }, { value: 'beijing', label: 'Beijing' },
  { value: 'closed', label: 'Unavailable', disabled: true }]

it('uses the application menu, commits a choice, and restores focus', () => {
  const change = vi.fn()
  render(<Select label="Location" value="auto" options={options} onChange={change} />)
  const trigger = screen.getByRole('button', { name: 'Location' })
  expect(document.querySelector('select')).toBeNull()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Unavailable' }))
  expect(change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Beijing' }))
  expect(change).toHaveBeenCalledExactlyOnceWith('beijing')
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('opens from the keyboard and closes without changing the value on Escape', async () => {
  const change = vi.fn()
  render(<Select label="Location" value="auto" options={options} onChange={change} />)
  const trigger = screen.getByRole('button', { name: 'Location' })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  await waitFor(() => { expect(screen.getByRole('menu')).toBeTruthy() })
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Automatic' }), { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(change).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(trigger)
})

it('closes when disabled and stays closed when re-enabled', () => {
  const props = { label: 'Location', value: 'auto', options, onChange: vi.fn() }
  const view = render(<Select {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Location' }))
  view.rerender(<Select {...props} disabled />)
  expect(screen.queryByRole('menu')).toBeNull()
  view.rerender(<Select {...props} />)
  expect(screen.queryByRole('menu')).toBeNull()
})
