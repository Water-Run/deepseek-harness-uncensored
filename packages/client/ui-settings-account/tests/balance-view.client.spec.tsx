// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import type { BalancePreferences, BalanceSnapshot } from '@deepseek-ai/dsh-balance/types'
import { BalanceSettings, BalanceSidebar } from '../src/client/BalanceView.tsx'
import type { BalanceViewState } from '../src/client/balance-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function fixture(granted = '0') {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: true }))
  const data: BalanceSnapshot = { status: 'ready', source: 'api', account: 'api-key', sampleCount: 2,
    samples: [0, 60_000].map(time => ({ time, wallets: [{ currency: 'CNY', toppedUp: '12.50', granted }] })) }
  const state = createSnapshotStore<BalanceViewState>({
    data, loading: false, failed: false, now: 0, saving: false, toast: null, toastId: 0,
  })
  const form = stubConfigForm<BalancePreferences>()
  form.publish({ status: 'ready', value: { enabled: true, source: 'api', refreshSeconds: 15 }, writable: true })
  const props = {
    useBalance: bindSnapshotSelector(state), useBalancePreferences: bindSnapshotSelector(form.scope),
    refresh: vi.fn(), save: vi.fn(async () => true), dismissToast: vi.fn(),
    t: (key: keyof typeof en, params?: Record<string, string | number>) =>
      en[key].replace(/\{(\w+)\}/gu, (_, name: string) => String(params?.[name] ?? '')),
  } as Parameters<typeof BalanceSettings>[0]
  return { props, state }
}

it('keeps the last balance and curve on refresh failure, and omits an empty grant', () => {
  const { props, state } = fixture()
  render(<BalanceSettings {...props} />)
  expect(screen.queryByText(en.bonusBalance)).toBeNull()
  expect(screen.getByText('¥12.50', { selector: 'strong span' })).toBeTruthy()
  const curve = screen.getByRole('slider', { name: en['balance.curve'] })
  act(() => { state.set({ ...state.getSnapshot(), loading: true }) })
  expect(screen.getByRole('status', { name: en['balance.refreshing'] })).toBeTruthy()
  act(() => { state.set({ ...state.getSnapshot(), loading: false, failed: true }) })
  expect(screen.getByRole('alert').textContent).toBe(en['balance.failed'])
  expect(screen.getByRole('slider', { name: en['balance.curve'] })).toBe(curve)
  expect(screen.getByText('¥12.50', { selector: 'strong span' })).toBeTruthy()
})

it('links invalid refresh intervals to the field and never saves them', async () => {
  const { props } = fixture('2.50')
  render(<BalanceSettings {...props} />)
  expect(screen.getByText('¥15.00', { selector: 'strong span' })).toBeTruthy()
  expect(screen.getByText('¥2.50', { selector: 'b' })).toBeTruthy()
  const interval = screen.getByRole('spinbutton', { name: en['balance.interval'] })
  fireEvent.change(interval, { target: { value: '0' } })
  fireEvent.blur(interval)
  expect(props.save).not.toHaveBeenCalled()
  expect(document.getElementById(interval.getAttribute('aria-describedby') ?? '')?.textContent).toBe(en['balance.intervalError'])
  fireEvent.change(interval, { target: { value: '30' } })
  await act(async () => { fireEvent.blur(interval) })
  expect(props.save).toHaveBeenCalledWith('refreshSeconds', 30)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('refreshes from the sidebar and releases its countdown when removed', () => {
  vi.useFakeTimers()
  const { props } = fixture()
  const view = render(<BalanceSidebar {...props} wide />)
  fireEvent.click(screen.getByRole('button', { name: en['balance.title'] }))
  expect(props.refresh).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBeGreaterThan(0)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
