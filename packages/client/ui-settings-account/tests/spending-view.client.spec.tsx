// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SpendPeriod, SpendSnapshot } from '@deepseek-ai/dsh-spend-limit/types'
import type { SpendingState } from '../src/client/spending-controller.ts'
import { SpendingSettings, SpendingSidebar } from '../src/client/SpendingView.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const periods: SpendPeriod[] = ['15m', '1h', '5h', '1d', '7d', '30d']
function fixture(enabledPeriods: SpendPeriod[] = [], showSettings = true) {
  const limits = { '15m': 5, '1h': 15, '5h': 50, '1d': 100, '7d': 500, '30d': 2000 }
  const data: SpendSnapshot = { preferences: { enabledPeriods, autoResume: false, limits }, paused: false, waiting: 0, pending: 0,
    pausedSessions: [], nextExpiry: null, updatedAt: 0,
    windows: periods.map(period => ({ period, enabled: enabledPeriods.includes(period), limit: limits[period],
      spent: 0, reserved: 0, uncertain: 0, remaining: limits[period] })) }
  const state = createSnapshotStore<SpendingState>({ saving: false, failed: false, toast: null, data })
  const operations = { configureSpendingWindow: vi.fn(async () => true), setSpendingAutoResume: vi.fn(async () => true),
    disableAllSpending: vi.fn(async () => true), resetSpending: vi.fn(async () => true), resumeSpending: vi.fn(async () => true),
    refreshSpending: vi.fn(), dismissSpendingToast: vi.fn() }
  const props = { ...operations, useSpending: bindSnapshotSelector(state), t: makeTranslate(en) } as Parameters<typeof SpendingSettings>[0]
  if (showSettings) render(<SpendingSettings {...props} />)
  return { state, props, ...operations }
}

it('starts with only five-hour and weekly controls expanded and all windows off', async () => {
  fixture()
  expect(screen.getAllByRole('spinbutton')).toHaveLength(2)
  expect(screen.getByRole('group', { name: '5 hours' })).toBeTruthy()
  expect(screen.getByRole('group', { name: '7 days' })).toBeTruthy()
  expect(screen.queryByRole('group', { name: '15 minutes' })).toBeNull()
  expect(screen.getByRole('switch', { name: 'Enable limit for 5 hours' }).getAttribute('aria-checked')).toBe('false')
  fireEvent.click(screen.getByText(en['spending.other']))
  await waitFor(() => { expect(screen.getAllByRole('spinbutton')).toHaveLength(6) })
})

it('validates one window without blocking another and saves only the edited window', async () => {
  const { configureSpendingWindow } = fixture()
  const row = within(screen.getByRole('group', { name: '5 hours' }))
  const input = row.getByRole('spinbutton')
  fireEvent.change(input, { target: { value: '0' } })
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(en['spending.invalid'])
  expect(row.getByRole<HTMLButtonElement>('button', { name: en['spending.save'] }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('switch', { name: 'Enable limit for 7 days' }))
  expect(configureSpendingWindow).toHaveBeenCalledWith({ period: '7d', enabled: true })
  fireEvent.change(input, { target: { value: '75' } })
  expect(input.getAttribute('aria-invalid')).toBe('false')
  await act(async () => { fireEvent.click(row.getByRole('button', { name: en['spending.save'] })) })
  expect(configureSpendingWindow).toHaveBeenLastCalledWith({ period: '5h', limit: 75 })
})

it('increments and decrements through visible application controls', () => {
  fixture()
  const row = within(screen.getByRole('group', { name: '5 hours' }))
  fireEvent.click(row.getByRole('button', { name: 'Increase limit for 5 hours' }))
  expect(row.getByRole<HTMLInputElement>('spinbutton').value).toBe('51')
  fireEvent.click(row.getByRole('button', { name: 'Decrease limit for 5 hours' }))
  expect(row.getByRole<HTMLInputElement>('spinbutton').value).toBe('50')
})

it('routes per-window and global resets separately and disables all without rewriting amounts', async () => {
  const { resetSpending, disableAllSpending } = fixture(['5h', '7d'])
  fireEvent.click(within(screen.getByRole('group', { name: '5 hours' })).getByRole('button', { name: 'Reset' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en['spending.resetConfirm'] })) })
  expect(resetSpending).toHaveBeenLastCalledWith('5h')
  fireEvent.click(screen.getByRole('button', { name: en['spending.resetAll'] }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en['spending.resetConfirm'] })) })
  expect(resetSpending).toHaveBeenLastCalledWith(undefined)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en['spending.disableAll'] })) })
  expect(disableAllSpending).toHaveBeenCalledOnce()
})

it('reports pending writes and prevents duplicate changes', () => {
  const { state, configureSpendingWindow } = fixture()
  act(() => { state.set({ ...state.getSnapshot(), saving: true }) })
  const toggle = screen.getByRole<HTMLButtonElement>('switch', { name: 'Enable limit for 5 hours' })
  expect(toggle.disabled).toBe(true)
  expect(toggle.getAttribute('aria-busy')).toBe('true')
  fireEvent.click(toggle)
  expect(configureSpendingWindow).not.toHaveBeenCalled()
})

it('keeps the waiting count and recovery action in the compact sidebar notice', () => {
  const { state, props, resumeSpending } = fixture(['5h'], false)
  state.set({ ...state.getSnapshot(), data: { ...state.getSnapshot().data!, paused: true, waiting: 1 } })
  render(<SpendingSidebar {...props} wide />)
  expect(screen.getByRole('status').textContent).toContain('Budget paused · waiting: 1')
  fireEvent.click(screen.getByRole('button', { name: en['spending.resume'] }))
  expect(resumeSpending).toHaveBeenCalledOnce()
})
