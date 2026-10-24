import { afterEach, expect, it, vi } from 'vitest'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import type { BalancePreferences, BalanceSnapshot } from '@deepseek-ai/dsh-balance/types'
import { BalanceController } from '../src/client/balance-controller.ts'

afterEach(() => { vi.useRealTimers() })
const sample = (amount: string): BalanceSnapshot => ({ status: 'ready', source: 'api', account: 'api-key', sampleCount: 1,
  samples: [{ time: 1, wallets: [{ currency: 'CNY', toppedUp: amount, granted: '0' }] }] })
function preferences() {
  const form = stubConfigForm<BalancePreferences>()
  form.publish({ status: 'ready', value: { enabled: true, source: 'api', refreshSeconds: 15 }, writable: true })
  return form
}

it('polls at fifteen seconds, keeps the last observation on failure and refreshes immediately on request', async () => {
  vi.useFakeTimers()
  const form = preferences(), first = sample('10.00'), next = sample('9.50')
  const query = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(next)
  const controller = new BalanceController(form.scope, query)
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.state.getSnapshot().data).toBe(first)
    await vi.advanceTimersByTimeAsync(14999)
    expect(query).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(query).toHaveBeenCalledTimes(2)
    expect(controller.state.getSnapshot()).toMatchObject({ data: first, failed: true, loading: false })
    controller.refresh()
    await vi.advanceTimersByTimeAsync(0)
    expect(query).toHaveBeenCalledTimes(3)
    expect(controller.state.getSnapshot()).toMatchObject({ data: next, failed: false })
  } finally { await controller.dispose() }
  expect(form.listenerCount()).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('coalesces pending refreshes and never republishes the previous account after invalidation', async () => {
  vi.useFakeTimers()
  const old = Promise.withResolvers<BalanceSnapshot>(), current = Promise.withResolvers<BalanceSnapshot>()
  const query = vi.fn().mockReturnValueOnce(old.promise).mockReturnValue(current.promise)
  const form = preferences(), controller = new BalanceController(form.scope, query)
  try {
    controller.invalidate()
    controller.refresh()
    controller.refresh()
    expect(query).toHaveBeenCalledTimes(1)
    old.resolve(sample('100.00'))
    await vi.advanceTimersByTimeAsync(0)
    expect(query).toHaveBeenCalledTimes(2)
    expect(controller.state.getSnapshot().data).toBeUndefined()
    const latest = sample('2.00')
    current.resolve(latest)
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.state.getSnapshot().data).toBe(latest)
    form.publish({ value: { enabled: false, source: 'api', refreshSeconds: 15 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.state.getSnapshot().data).toBeUndefined()
    expect(query).toHaveBeenCalledTimes(2)
  } finally {
    old.resolve(sample('0')); current.resolve(sample('0'))
    await controller.dispose()
  }
  expect(vi.getTimerCount()).toBe(0)
})
