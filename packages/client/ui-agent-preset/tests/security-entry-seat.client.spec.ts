/* oxlint-disable typescript/unbound-method -- the gate is a plain test double built from vi.fn properties. */
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { AgentPresetSeatController, OPEN_ENTRY, type AgentPresetStage } from '../src/client/seat-store.ts'
import type { SecurityEntryGate } from '../src/client/security-entry-controller.ts'

const session = SessionId('session-seat-security')

function summary(id: SessionId = session, blank = true): Pick<SessionSummary, 'id' | 'blank' | 'projectionValues'> {
  return { id, blank, projectionValues: { agentPreset: 'standard' } }
}

function setup(options: { session?: Pick<SessionSummary, 'id' | 'blank' | 'projectionValues'> | undefined; gate?: Partial<SecurityEntryGate> } = {}) {
  let current = 'session' in options ? options.session : summary()
  const select = vi.fn(async () => ({ ok: true as const, value: 'security' }))
  const ctx = { remote: { agentPresets: { select } } } as never
  const gate: SecurityEntryGate = {
    protects: vi.fn((preset: string) => preset === 'security'),
    mayProtect: vi.fn((preset: string) => preset === 'security'),
    acknowledged: vi.fn(() => false),
    ready: vi.fn(async () => {}),
    request: vi.fn(async () => true),
    ...options.gate,
  }
  const staged: AgentPresetStage = { id: undefined, introduce: false }
  const seat = new AgentPresetSeatController(ctx, () => current, staged, gate)
  return {
    seat, gate, select, staged,
    setSession: (next: Pick<SessionSummary, 'id' | 'blank' | 'projectionValues'> | undefined) => { current = next },
  }
}

describe('Security entry gate in the preset seat', () => {
  it('waits for the confirmation before staging and selecting', async () => {
    const response = Promise.withResolvers<boolean>()
    const { seat, gate, select } = setup({ gate: { request: vi.fn(() => response.promise) } })
    const before = seat.store.getSnapshot().current
    const selecting = seat.select('security')
    await Promise.resolve()
    await Promise.resolve()
    expect(gate.request).toHaveBeenCalledExactlyOnceWith(session)
    expect(seat.store.getSnapshot().current).toBe(before)
    expect(seat.store.getSnapshot().busy).toBe(true)
    expect(select).not.toHaveBeenCalled()

    response.resolve(true)
    await selecting
    expect(seat.store.getSnapshot().current).toBe('security')
    expect(select).toHaveBeenCalledExactlyOnceWith(session, 'security')
  })

  it('leaves the mode and stage untouched when the confirmation is cancelled', async () => {
    const { seat, select, staged } = setup({ gate: { request: vi.fn(async () => false) } })
    const before = seat.store.getSnapshot().current
    await seat.select('security')
    expect(seat.store.getSnapshot().current).toBe(before)
    expect(staged.id).toBeUndefined()
    expect(select).not.toHaveBeenCalled()
  })

  it('skips the dialog when this Host already acknowledged the launch', async () => {
    const { seat, gate, select } = setup({ gate: { acknowledged: vi.fn(() => true) } })
    await seat.select('security')
    expect(gate.request).not.toHaveBeenCalled()
    expect(select).toHaveBeenCalledExactlyOnceWith(session, 'security')
  })

  it('defers a protected pick until a blank session appears', async () => {
    const { seat, gate, select, setSession } = setup({ session: undefined })
    const before = seat.store.getSnapshot().current
    await seat.select('security')
    expect(seat.store.getSnapshot().current).toBe(before)
    expect(gate.request).not.toHaveBeenCalled()

    setSession(summary())
    await seat.apply()
    expect(gate.request).toHaveBeenCalledExactlyOnceWith(session)
    expect(select).toHaveBeenCalledExactlyOnceWith(session, 'security')
    expect(seat.store.getSnapshot().current).toBe('security')
  })

  it('does not gate ordinary presets', async () => {
    const { seat, gate, select } = setup({ gate: { protects: vi.fn(() => false) } })
    await seat.select('reverse')
    expect(gate.request).not.toHaveBeenCalled()
    expect(select).toHaveBeenCalledExactlyOnceWith(session, 'reverse')
  })

  it('drops a deferred protected pick when the session already started', async () => {
    const { seat, select, setSession } = setup({ session: undefined })
    const before = seat.store.getSnapshot().current
    await seat.select('security')
    setSession(summary(session, false))
    await seat.apply()
    expect(select).not.toHaveBeenCalled()
    expect(seat.store.getSnapshot().current).toBe(before)
  })

  it('keeps the previous mode when the deferred confirmation is cancelled', async () => {
    const request = vi.fn(async () => false)
    const { seat, select, setSession } = setup({ session: undefined, gate: { request } })
    const before = seat.store.getSnapshot().current
    await seat.select('security')
    setSession(summary())
    await seat.apply()
    expect(request).toHaveBeenCalledExactlyOnceWith(session)
    expect(select).not.toHaveBeenCalled()
    expect(seat.store.getSnapshot().current).toBe(before)
  })

  it('leaves a non-blank session to the established-conversation policy', async () => {
    const { seat, gate, select } = setup({ session: summary(session, false) })
    await seat.select('security')
    expect(gate.request).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('exposes an open gate for compositions without the policy', async () => {
    expect(OPEN_ENTRY.mayProtect('security')).toBe(false)
    expect(OPEN_ENTRY.protects('security')).toBe(false)
    expect(OPEN_ENTRY.acknowledged()).toBe(true)
    await expect(OPEN_ENTRY.ready()).resolves.toBeUndefined()
    await expect(OPEN_ENTRY.request(session)).resolves.toBe(true)
  })
})
