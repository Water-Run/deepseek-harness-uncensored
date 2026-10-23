/** Mode-setting and selection operations retain their lifetime through navigation and teardown. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ModeSwitchController } from '../src/client/mode-switch.tsx'
import type { ModeSwitchChallengeId } from '@deepseek-ai/dsh-agent-preset-registry/types'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

const id = 'session-mode-test' as SessionId
const t = makeTranslate(zh, commonZh)
const challengeId = 'challenge-test' as ModeSwitchChallengeId
afterEach(() => { vi.useRealTimers() })
function policyRemote() {
  return {
    read: vi.fn(async () => ({ allowExistingSessionSwitch: false })),
    begin: vi.fn(async () => ({ id: challengeId, waitMs: 10000 })),
    confirm: vi.fn(async () => ({ allowExistingSessionSwitch: true })),
    disable: vi.fn(async () => ({ allowExistingSessionSwitch: false })),
  }
}

describe('mode switch operations', () => {
  it('shares an in-flight selection and reports the confirmed outcome', async () => {
    const gate = Promise.withResolvers<undefined>()
    const select = vi.fn(() => gate.promise)
    const remote = policyRemote()
    const controller = new ModeSwitchController(remote, select, t)
    try {
      const first = controller.change(id, 'reverse')
      expect(controller.change(id, 'reverse')).toBe(first)
      expect(controller.state.getSnapshot().busy.has(id)).toBe(true)
      gate.resolve(undefined)
      await first
      expect(select).toHaveBeenCalledExactlyOnceWith(id, 'reverse')
      expect(controller.state.getSnapshot().busy.size).toBe(0)
      expect(controller.state.getSnapshot().toast?.success).toBe(true)
    } finally { gate.resolve(undefined); await controller.dispose() }
  })

  it('waits ten seconds, requires a click and then applies runtime permission', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const remote = policyRemote()
    const controller = new ModeSwitchController(remote, vi.fn(async () => {}), t)
    try {
      await controller.load()
      await controller.save(true)
      await controller.confirm()
      expect(remote.confirm).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(9999)
      expect(controller.policy.getSnapshot().value.allowExistingSessionSwitch).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(controller.state.getSnapshot().confirmation?.remaining).toBe(0)
      expect(remote.confirm).not.toHaveBeenCalled()
      await controller.confirm()
      expect(remote.confirm).toHaveBeenCalledExactlyOnceWith(challengeId)
      expect(controller.policy.getSnapshot().value.allowExistingSessionSwitch).toBe(true)
      await controller.save(false)
      expect(remote.disable).toHaveBeenCalledOnce()
      expect(controller.policy.getSnapshot().value.allowExistingSessionSwitch).toBe(false)
    } finally { await controller.dispose() }
  })

  it('cancels an acknowledgement and rejects late reads after a pushed permission change', async () => {
    const remote = policyRemote()
    const reading = Promise.withResolvers<{ allowExistingSessionSwitch: boolean }>()
    remote.read.mockReturnValueOnce(reading.promise)
    const controller = new ModeSwitchController(remote, vi.fn(async () => {}), t)
    try {
      const load = controller.load()
      controller.accept({ allowExistingSessionSwitch: true })
      reading.resolve({ allowExistingSessionSwitch: false })
      await load
      expect(controller.policy.getSnapshot().value.allowExistingSessionSwitch).toBe(true)
      await controller.save(true)
      controller.cancel()
      await controller.confirm()
      expect(remote.confirm).not.toHaveBeenCalled()
      expect(controller.state.getSnapshot().confirmation).toBeNull()
    } finally { reading.resolve({ allowExistingSessionSwitch: false }); await controller.dispose() }
  })

  it('keeps failed confirmation visible and permits a fresh acknowledgement', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const remote = policyRemote()
    remote.confirm.mockRejectedValueOnce(new Error('disconnected'))
    const controller = new ModeSwitchController(remote, vi.fn(async () => {}), t)
    try {
      await controller.save(true)
      await vi.advanceTimersByTimeAsync(10000)
      await controller.confirm()
      expect(controller.state.getSnapshot().confirmation?.error).toBe(true)
      expect(controller.policy.getSnapshot().value.allowExistingSessionSwitch).toBe(false)
      await controller.save(true)
      expect(controller.state.getSnapshot().confirmation).toEqual({ remaining: 10, error: false })
    } finally { await controller.dispose() }
  })

  it('does not overwrite a newer revocation with a late confirmation response', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const remote = policyRemote()
    const response = Promise.withResolvers<{ allowExistingSessionSwitch: boolean }>()
    remote.confirm.mockReturnValueOnce(response.promise)
    const controller = new ModeSwitchController(remote, vi.fn(async () => {}), t)
    try {
      await controller.save(true)
      await vi.advanceTimersByTimeAsync(10000)
      const confirmation = controller.confirm()
      controller.accept({ allowExistingSessionSwitch: false })
      response.resolve({ allowExistingSessionSwitch: true })
      await confirmation
      expect(controller.policy.getSnapshot().value.allowExistingSessionSwitch).toBe(false)
    } finally { response.resolve({ allowExistingSessionSwitch: false }); await controller.dispose() }
  })

  it('drains a pending change without publishing a notification after disposal', async () => {
    const gate = Promise.withResolvers<undefined>()
    const remote = policyRemote()
    const select = vi.fn(() => gate.promise)
    const controller = new ModeSwitchController(remote, select, t)
    const changing = controller.change(id, 'reverse')
    let disposed = false
    const closing = controller.dispose().then(() => { disposed = true })
    await Promise.resolve()
    expect(disposed).toBe(false)
    gate.resolve(undefined)
    await changing
    await closing
    expect(controller.state.getSnapshot().toast).toBeNull()
    await controller.change(id, 'writing')
    expect(select).toHaveBeenCalledOnce()
  })
})
