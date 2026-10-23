/** Mode-setting and selection operations retain their lifetime through navigation and teardown. */
import { describe, expect, it, vi } from 'vitest'
import { makeTranslate, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ModeSwitchController, type ModeSwitchPolicy } from '../src/client/mode-switch.tsx'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

const id = 'session-mode-test' as SessionId
const t = makeTranslate(zh, commonZh)

describe('mode switch operations', () => {
  it('shares an in-flight selection and reports the confirmed outcome', async () => {
    const gate = Promise.withResolvers<undefined>()
    const select = vi.fn(() => gate.promise)
    const form = stubConfigForm<ModeSwitchPolicy>()
    const controller = new ModeSwitchController(form.scope, select, t)
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

  it.each(['rejected', 'throws'] as const)('reports %s writes and keeps subsequent settings changes available', async (outcome) => {
    const form = stubConfigForm<ModeSwitchPolicy>()
    if (outcome === 'rejected') form.set.mockResolvedValueOnce(false)
    else form.set.mockImplementationOnce(() => { throw new Error('disconnected') })
    const controller = new ModeSwitchController(form.scope, vi.fn(async () => { throw new Error('locked') }), t)
    try {
      await controller.save(true)
      expect(controller.state.getSnapshot().toast?.success).toBe(false)
      await controller.save(false)
      expect(form.set).toHaveBeenLastCalledWith('allowExistingSessionSwitch', false)
      expect(controller.state.getSnapshot().toast?.success).toBe(true)
      await controller.change(id, 'writing')
      expect(controller.state.getSnapshot().toast?.success).toBe(false)
      expect(controller.state.getSnapshot().busy.size).toBe(0)
    } finally { await controller.dispose() }
  })

  it('drains a pending change without publishing a notification after disposal', async () => {
    const gate = Promise.withResolvers<undefined>()
    const form = stubConfigForm<ModeSwitchPolicy>()
    const select = vi.fn(() => gate.promise)
    const controller = new ModeSwitchController(form.scope, select, t)
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
