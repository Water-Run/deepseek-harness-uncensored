import { afterEach, expect, it, vi } from 'vitest'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import type { BalanceCleanupRequest, BalancePreferences, BalanceSnapshot } from '@deepseek-ai/dsh-balance/types'
import { BalanceController } from '../src/client/balance-controller.ts'

afterEach(() => { vi.useRealTimers() })
const sample = (amount: string): BalanceSnapshot => ({ status: 'ready', source: 'api', account: 'api-key', sampleCount: 1,
  samples: [{ time: 1, wallets: [{ currency: 'CNY', toppedUp: amount, granted: '0' }] }] })
const clearSamples = vi.fn(async (_request: BalanceCleanupRequest): Promise<BalanceSnapshot> => sample('0'))

function preferences() {
  const form = stubConfigForm<BalancePreferences>()
  form.publish({ status: 'ready', value: { enabled: true, source: 'api', refreshSeconds: 15, autoCleanup: 'off', retainCount: 2000, retainDays: 30 }, writable: true })
  return form
}

it('polls at fifteen seconds, keeps the last observation on failure and refreshes immediately on request', async () => {
  vi.useFakeTimers()
  const form = preferences(), first = sample('10.00'), next = sample('9.50')
  const query = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(next)
  const controller = new BalanceController(form.scope, query, clearSamples)
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
  const form = preferences(), controller = new BalanceController(form.scope, query, clearSamples)
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
    form.publish({ value: { enabled: false, source: 'api', refreshSeconds: 15, autoCleanup: 'off', retainCount: 2000, retainDays: 30 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.state.getSnapshot().data).toBeUndefined()
    expect(query).toHaveBeenCalledTimes(2)
  } finally {
    old.resolve(sample('0')); current.resolve(sample('0'))
    await controller.dispose()
  }
  expect(vi.getTimerCount()).toBe(0)
})

it('hides saved observations immediately when disabled during a refresh', async () => {
  vi.useFakeTimers()
  const inFlight = Promise.withResolvers<BalanceSnapshot>()
  const query = vi.fn().mockResolvedValueOnce(sample('10.00')).mockReturnValue(inFlight.promise)
  const form = preferences()
  const controller = new BalanceController(form.scope, query, clearSamples)
  try {
    await vi.advanceTimersByTimeAsync(0)
    controller.refresh()
    expect(query).toHaveBeenCalledTimes(2)
    expect(controller.state.getSnapshot().loading).toBe(true)
    form.publish({ value: { enabled: false, source: 'api', refreshSeconds: 15, autoCleanup: 'off', retainCount: 2000, retainDays: 30 } })
    expect(controller.state.getSnapshot()).toMatchObject({ data: undefined, loading: false, failed: false })

    inFlight.resolve(sample('9.00'))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(controller.state.getSnapshot()).toMatchObject({ data: undefined, loading: false, failed: false })
    expect(query).toHaveBeenCalledTimes(2)
  } finally { inFlight.resolve(sample('9.00')); await controller.dispose() }
})

it('publishes the remaining history after a cleanup and reports its outcome', async () => {
  vi.useFakeTimers()
  const form = preferences()
  const query = vi.fn(async () => sample('10.00'))
  const cleanup = vi.fn(async (_request: BalanceCleanupRequest): Promise<BalanceSnapshot> => ({ ...sample('0'), status: 'empty', sampleCount: 0, samples: [] }))
  const controller = new BalanceController(form.scope, query, cleanup)
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(await controller.clear({ mode: 'count', keep: 500 })).toBe(true)
    expect(cleanup).toHaveBeenCalledWith({ mode: 'count', keep: 500 })
    expect(controller.state.getSnapshot()).toMatchObject({
      data: { status: 'empty', sampleCount: 0 }, clearing: false, toast: 'cleared',
    })
  } finally { await controller.dispose() }
})

it('reports a failed cleanup without discarding the shown history', async () => {
  vi.useFakeTimers()
  const form = preferences()
  const query = vi.fn(async () => sample('10.00'))
  const cleanup = vi.fn(async (_request: BalanceCleanupRequest): Promise<BalanceSnapshot> => { throw new Error('offline') })
  const controller = new BalanceController(form.scope, query, cleanup)
  try {
    await vi.advanceTimersByTimeAsync(0)
    const shown = controller.state.getSnapshot().data
    expect(await controller.clear({ mode: 'all' })).toBe(false)
    expect(controller.state.getSnapshot()).toMatchObject({ data: shown, clearing: false, toast: 'clearFailed' })
  } finally { await controller.dispose() }
})
