// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { StatPopover } from '../src/StatPopover.tsx'

afterEach(cleanup)

it('opens details from a reading and releases focus on Escape or outside pointer', async () => {
  render(<StatPopover label="5h 98%" title="Spending limits" icon={<svg />}><button>Settings</button></StatPopover>)
  const trigger = screen.getByRole('button', { name: 'Spending limits: 5h 98%' })
  trigger.focus()
  fireEvent.click(trigger)
  await waitFor(() => { expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' })) })
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  await waitFor(() => { expect(screen.getByRole('dialog')).toBeTruthy() })
  fireEvent.click(trigger)
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(trigger)
  await waitFor(() => { expect(screen.getByRole('dialog')).toBeTruthy() })
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('returns focus to the reading when pointer activation leaves focus elsewhere', async () => {
  render(<>
    <input aria-label="Composer" />
    <StatPopover label="￥0.22" title="Conversation cost" icon={<svg />}><button>Details</button></StatPopover>
  </>)
  screen.getByRole('textbox', { name: 'Composer' }).focus()
  const trigger = screen.getByRole('button', { name: 'Conversation cost: ￥0.22' })
  fireEvent.click(trigger)
  await waitFor(() => { expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Details' })) })
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
