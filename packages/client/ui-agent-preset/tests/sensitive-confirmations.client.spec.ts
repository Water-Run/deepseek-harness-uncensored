/** Preference controller: immediate enabling, countdown disabling and the feedback that survives navigation. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SensitiveConfirmationChallengeId } from '@deepseek-ai/dsh-agent-preset-registry/types'
import { SensitiveConfirmationsController } from '../src/client/sensitive-confirmations-controller.ts'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

const t = makeTranslate(zh, commonZh)
const challengeId = 'sensitive-challenge' as SensitiveConfirmationChallengeId
afterEach(() => { vi.useRealTimers() })

function remote(initial = true) {
  let confirmations = initial
  return {
    read: vi.fn(async () => ({ confirmations })),
    begin: vi.fn(async (requested: boolean) => ({
      id: challengeId, confirmations: requested, waitMs: requested ? 0 : 10_000,
    })),
    confirm: vi.fn(async () => {
      confirmations = !confirmations
      return { confirmations }
    }),
    current: () => confirmations,
  }
}

describe('sensitive-action confirmation preference', () => {
  it('reads the preference into the snapshot', async () => {
    const rpc = remote(false)
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      expect(controller.state.getSnapshot()).toMatchObject({ status: 'ready', confirmations: false, writable: true })
    } finally { controller.dispose() }
  })

  it('reports an unreadable preference without enabling the switch', async () => {
    const rpc = remote()
    rpc.read.mockRejectedValueOnce(new Error('disconnected'))
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      expect(controller.state.getSnapshot()).toMatchObject({ status: 'error', writable: false })
    } finally { controller.dispose() }
  })

  it('turns confirmations back on without a countdown', async () => {
    const rpc = remote(false)
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      await controller.save(true)
      expect(rpc.begin).toHaveBeenCalledWith(true)
      expect(rpc.confirm).toHaveBeenCalledWith(challengeId)
      expect(controller.state.getSnapshot()).toMatchObject({ confirmations: true, confirmation: null })
      expect(controller.state.getSnapshot().toast?.text).toBe(zh['sensitive.saved'])
    } finally { controller.dispose() }
  })

  it('holds disabling behind the countdown and commits only after it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const rpc = remote()
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      await controller.save(false)
      expect(controller.state.getSnapshot().confirmation).toEqual({ remaining: 10, error: false })
      await controller.confirm()
      expect(rpc.confirm).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(controller.state.getSnapshot().confirmation?.remaining).toBe(0)
      await controller.confirm()
      expect(rpc.confirm).toHaveBeenCalledExactlyOnceWith(challengeId)
      expect(controller.state.getSnapshot()).toMatchObject({ confirmations: false, confirmation: null })
      expect(controller.state.getSnapshot().toast?.text).toBe(zh['sensitive.offSaved'])
    } finally { controller.dispose() }
  })

  it('ignores a change that matches the current preference', async () => {
    const rpc = remote()
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      await controller.save(true)
      expect(rpc.begin).not.toHaveBeenCalled()
    } finally { controller.dispose() }
  })

  it('cancels a countdown and reports a failed request without changing the preference', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const rpc = remote()
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      await controller.save(false)
      controller.cancel()
      expect(controller.state.getSnapshot().confirmation).toBeNull()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm()
      expect(rpc.confirm).not.toHaveBeenCalled()

      rpc.begin.mockRejectedValueOnce(new Error('disconnected'))
      await controller.save(false)
      expect(controller.state.getSnapshot().confirmation).toBeNull()
      expect(controller.state.getSnapshot().toast?.success).toBe(false)
      expect(controller.state.getSnapshot().confirmations).toBe(true)
    } finally { controller.dispose() }
  })

  it('keeps a rejected confirmation open for a retry', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const rpc = remote()
    rpc.confirm.mockRejectedValueOnce(new Error('write failed'))
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      await controller.save(false)
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm()
      expect(controller.state.getSnapshot().confirmation).toEqual({ remaining: 0, error: true })
      expect(controller.state.getSnapshot().confirmations).toBe(true)
      await controller.confirm()
      expect(controller.state.getSnapshot()).toMatchObject({ confirmations: false, confirmation: null })
    } finally { controller.dispose() }
  })

  it('drops a countdown another window made obsolete', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const rpc = remote()
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      await controller.save(false)
      controller.accept({ confirmations: false })
      expect(controller.state.getSnapshot().confirmation).toBeNull()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm()
      expect(rpc.confirm).not.toHaveBeenCalled()
    } finally { controller.dispose() }
  })

  it('ignores a late begin response after cancellation', async () => {
    const rpc = remote()
    const gate = Promise.withResolvers<{ id: SensitiveConfirmationChallengeId; confirmations: boolean; waitMs: number }>()
    rpc.begin.mockReturnValueOnce(gate.promise)
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      const saving = controller.save(false)
      controller.cancel()
      gate.resolve({ id: challengeId, confirmations: false, waitMs: 10_000 })
      await saving
      expect(controller.state.getSnapshot().confirmation).toBeNull()
    } finally { controller.dispose() }
  })

  it('drops notifications and timers once disposed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const rpc = remote()
    const controller = new SensitiveConfirmationsController(rpc, t)
    await controller.load()
    await controller.save(false)
    controller.dispose()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(controller.state.getSnapshot().confirmation?.remaining).toBe(10)
    await controller.save(false)
    expect(rpc.begin).toHaveBeenCalledOnce()
  })
})

describe('sensitive-action preference lifecycle edges', () => {
  it('ignores reads and saves that arrive after disposal', async () => {
    const rpc = remote()
    const controller = new SensitiveConfirmationsController(rpc, t)
    controller.dispose()
    await controller.load()
    await controller.save(false)
    controller.cancel()
    expect(controller.state.getSnapshot().confirmation).toBeNull()
    expect(rpc.read).not.toHaveBeenCalled()
    expect(rpc.begin).not.toHaveBeenCalled()
  })

  it('lets only the latest read land', async () => {
    const rpc = remote()
    const first = Promise.withResolvers<{ confirmations: boolean }>()
    rpc.read.mockReturnValueOnce(first.promise)
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      const pending = controller.load()
      await controller.load()
      first.reject(new Error('stale read failed'))
      await pending
      expect(controller.state.getSnapshot()).toMatchObject({ status: 'ready', confirmations: true })
    } finally { controller.dispose() }
  })

  it('shares an in-flight save and drops its busy flag after disposal', async () => {
    const rpc = remote()
    const gate = Promise.withResolvers<{ id: SensitiveConfirmationChallengeId; confirmations: boolean; waitMs: number }>()
    rpc.begin.mockReturnValueOnce(gate.promise)
    const controller = new SensitiveConfirmationsController(rpc, t)
    await controller.load()
    const saving = controller.save(false)
    expect(controller.save(false)).toBe(saving)
    expect(controller.state.getSnapshot().saving).toBe(true)
    controller.dispose()
    gate.resolve({ id: challengeId, confirmations: false, waitMs: 10_000 })
    await saving
    expect(rpc.begin).toHaveBeenCalledOnce()
    expect(controller.state.getSnapshot().confirmation).toBeNull()
  })

  it('does not notify when the challenge request fails after cancellation', async () => {
    const rpc = remote()
    const gate = Promise.withResolvers<never>()
    rpc.begin.mockReturnValueOnce(gate.promise)
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      const saving = controller.save(false)
      controller.cancel()
      gate.reject(new Error('disconnected'))
      await saving
      expect(controller.state.getSnapshot().toast).toBeNull()
    } finally { controller.dispose() }
  })

  it('reports an immediate commit failure without opening a countdown', async () => {
    const rpc = remote(false)
    rpc.confirm.mockRejectedValueOnce(new Error('write failed'))
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      await controller.save(true)
      expect(controller.state.getSnapshot()).toMatchObject({ confirmations: false, confirmation: null })
      expect(controller.state.getSnapshot().toast).toMatchObject({ success: false })
    } finally { controller.dispose() }
  })

  it('keeps a result that settles after disposal out of the snapshot', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const rpc = remote()
    const gate = Promise.withResolvers<{ confirmations: boolean }>()
    rpc.confirm.mockReturnValueOnce(gate.promise)
    const controller = new SensitiveConfirmationsController(rpc, t)
    await controller.load()
    await controller.save(false)
    await vi.advanceTimersByTimeAsync(10_000)
    const submitting = controller.confirm()
    controller.dispose()
    gate.resolve({ confirmations: false })
    await submitting
    // The accepted policy never reached this page and no outcome was announced.
    expect(controller.state.getSnapshot().confirmations).toBe(true)
    expect(controller.state.getSnapshot().toast).toBeNull()
  })

  it('drops a rejected confirmation that settles after disposal', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const rpc = remote()
    const gate = Promise.withResolvers<{ confirmations: boolean }>()
    rpc.confirm.mockReturnValueOnce(gate.promise)
    const controller = new SensitiveConfirmationsController(rpc, t)
    await controller.load()
    await controller.save(false)
    await vi.advanceTimersByTimeAsync(10_000)
    const submitting = controller.confirm()
    controller.dispose()
    gate.reject(new Error('disconnected'))
    await submitting
    expect(controller.state.getSnapshot().toast).toBeNull()
  })

  it('dismisses only the notification it names', async () => {
    const rpc = remote(false)
    const controller = new SensitiveConfirmationsController(rpc, t)
    try {
      await controller.load()
      await controller.save(true)
      const toast = controller.state.getSnapshot().toast
      expect(toast).not.toBeNull()
      controller.dismiss((toast?.id ?? 0) + 1)
      expect(controller.state.getSnapshot().toast).not.toBeNull()
      controller.dismiss(toast!.id)
      expect(controller.state.getSnapshot().toast).toBeNull()
    } finally { controller.dispose() }
  })
})
