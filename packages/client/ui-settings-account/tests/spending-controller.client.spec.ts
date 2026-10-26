import { expect, it } from 'vitest'
import { SpendingController } from '../src/client/spending-controller.ts'
import type { SpendSnapshot } from '@deepseek-ai/dsh-spend-limit/types'

const snapshot = (enabled: boolean): SpendSnapshot => ({ preferences: { enabledPeriods: enabled ? ['5h'] : [], autoResume: false, limits: { '15m': 5, '1h': 15, '5h': 50, '1d': 100, '7d': 500, '30d': 2000 } }, windows: [], paused: false, pending: 0, waiting: 0, pausedSessions: [], nextExpiry: null, updatedAt: 1000 })

it('does not overwrite a committed save with an older poll response', async () => {
  const read = Promise.withResolvers<SpendSnapshot>()
  const controller = new SpendingController(() => read.promise)
  try {
    expect(await controller.mutate(async () => snapshot(true))).toBe(true)
    read.resolve(snapshot(false))
    await read.promise
    await Promise.resolve()
    expect(controller.state.getSnapshot().data?.preferences.enabledPeriods).toEqual(['5h'])
  } finally { read.resolve(snapshot(false)); await controller.dispose() }
})

it('serializes settings writes and reports synchronous failures', async () => {
  const controller = new SpendingController(async () => snapshot(false))
  try {
    const mutation = Promise.withResolvers<SpendSnapshot>()
    const pending = controller.mutate(() => mutation.promise)
    expect(await controller.mutate(async () => snapshot(false))).toBe(false)
    mutation.resolve(snapshot(true))
    expect(await pending).toBe(true)
    expect(await controller.mutate(() => { throw new Error('offline') })).toBe(false)
    expect(controller.state.getSnapshot()).toMatchObject({ saving: false, toast: { success: false } })
  } finally { await controller.dispose() }
})

it('drains pending writes on disposal without publishing late feedback', async () => {
  const controller = new SpendingController(async () => snapshot(false))
  const mutation = Promise.withResolvers<SpendSnapshot>()
  const pending = controller.mutate(() => mutation.promise)
  const before = controller.state.getSnapshot()
  let disposed = false
  const closing = controller.dispose().then(() => { disposed = true })
  await Promise.resolve()
  expect(disposed).toBe(false)
  mutation.resolve(snapshot(true))
  await pending
  await closing
  expect(controller.state.getSnapshot()).toBe(before)
})
