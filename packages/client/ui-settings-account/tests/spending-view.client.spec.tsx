// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { SpendingState } from '../src/client/spending-controller.ts'
import { SpendingSettings } from '../src/client/SpendingView.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function fixture() {
  const limits = { '15m': 5, '1h': 15, '5h': 50, '1d': 100, '7d': 500, '30d': 2000 }
  const state = createSnapshotStore<SpendingState>({
    saving: false, failed: false, toast: null,
    data: { preferences: { enabled: false, autoResume: false, limits }, paused: false, waiting: 0, pending: 0,
      pausedSessions: [], nextExpiry: null, updatedAt: 0,
      windows: [{ period: '15m', limit: 5, spent: 0, reserved: 0, uncertain: 0, remaining: 5 }] },
  })
  const configureSpending = vi.fn(async () => true)
  const props = {
    useSpending: bindSnapshotSelector(state), configureSpending,
    resetSpending: vi.fn(async () => true), resumeSpending: vi.fn(async () => true),
    refreshSpending: vi.fn(), dismissSpendingToast: vi.fn(),
    t: (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/gu, (_, name: string) => String(params?.[name] ?? '')),
  } as Parameters<typeof SpendingSettings>[0]
  render(<SpendingSettings {...props} />)
  return { state, configureSpending }
}

it('identifies an invalid limit, links its error and prevents saving until corrected', async () => {
  const { configureSpending } = fixture()
  const input = screen.getByRole('spinbutton')
  const save = screen.getByRole<HTMLButtonElement>('button', { name: en['spending.save'] })
  fireEvent.change(input, { target: { value: '0' } })
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(en['spending.invalid'])
  expect(save.disabled).toBe(true)
  fireEvent.click(save)
  expect(configureSpending).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '6' } })
  expect(input.getAttribute('aria-invalid')).toBe('false')
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => { fireEvent.click(save) })
  expect(configureSpending).toHaveBeenCalledWith(expect.objectContaining({ limits: expect.objectContaining({ '15m': 6 }) }))
})

it('reports pending switch writes and prevents a second change while saving', () => {
  const { state, configureSpending } = fixture()
  act(() => { state.set({ ...state.getSnapshot(), saving: true }) })
  const toggle = screen.getByRole<HTMLButtonElement>('switch', { name: en['spending.enabled'] })
  expect(toggle.disabled).toBe(true)
  expect(toggle.getAttribute('aria-busy')).toBe('true')
  fireEvent.click(toggle)
  expect(configureSpending).not.toHaveBeenCalled()
})
