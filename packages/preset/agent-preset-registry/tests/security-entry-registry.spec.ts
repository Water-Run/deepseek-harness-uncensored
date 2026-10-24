import { afterEach, describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { SecurityProtectionStatus } from '../src/types.ts'
import { agentOn, contribution, declare, harness } from './harness.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { 'security-viewer-test': { kind: 'security-viewer-test' } }
}

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

const DISABLED: SecurityProtectionStatus = { state: 'disabled', revision: 1, capabilities: [] }

function securityConfig() {
  return { default: 'standard', requireSecurityEntryAcknowledgement: true, securityEntryPreset: 'security' }
}

async function setup(protection: () => SecurityProtectionStatus = () => DISABLED) {
  const ctx = await harness({ live: true, config: securityConfig() })
  contexts.push(ctx)
  ctx.provide('securityProtection', { read: protection })
  await declare(ctx, contribution('standard'))
  await declare(ctx, { ...contribution('security'), id: 'security' })
  return ctx
}

function afterWait() {
  const clock = vi.spyOn(performance, 'now')
  const base = performance.now()
  clock.mockReturnValue(base + 10_000)
  return clock
}

function captured(operation: () => unknown): unknown {
  try { operation() } catch (error) { return error }
  throw new Error('operation did not fail')
}

function confirm(ctx: Context, sessionId: SessionId, locale: 'zh' | 'en' = 'zh') {
  const challenge = ctx.agentPresets.beginSecurityEntry(sessionId, locale)
  const clock = afterWait()
  try { return ctx.agentPresets.confirmSecurityEntry(challenge.id, sessionId, challenge.declaration) } finally { clock.mockRestore() }
}

describe('Security first-entry policy in the preset registry', () => {
  it('refuses a new conversation until this Host records the acknowledgement', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'first-security-entry')
    await expect(ctx.agentPresets.select(agent, 'security')).rejects.toMatchObject({
      code: 'security-entry/required', details: { protection: DISABLED },
    })
    expect(ctx.agentPresets.composedPreset(agent.ctx)).toBe('standard')
    expect(ctx.agentPresets.securityEntryState()).toEqual({
      required: true, preset: 'security', acknowledged: false, protection: DISABLED,
    })
  })

  it('acknowledges once per Host lifetime and then lets every new conversation enter Security', async () => {
    const ctx = await setup()
    const first = await agentOn(ctx, 'first-security-ack')
    expect(confirm(ctx, first.id)).toMatchObject({ acknowledged: true })
    expect(await ctx.agentPresets.select(first, 'security')).toBe('security')

    const second = await agentOn(ctx, 'second-security-ack')
    expect(await ctx.agentPresets.select(second, 'security')).toBe('security')
    expect(ctx.agentPresets.securityEntryState().acknowledged).toBe(true)
  })

  it('does not prompt when an established conversation switches under the temporary policy', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'established-security')
    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await expect(ctx.agentPresets.select(agent, 'security')).rejects.toMatchObject({ code: 'agent-preset/locked' })

    const challenge = ctx.agentPresets.beginModeSwitch()
    const clock = afterWait()
    try { ctx.agentPresets.confirmModeSwitch(challenge.id) } finally { clock.mockRestore() }
    expect(await ctx.agentPresets.select(agent, 'security')).toBe('security')
    expect(ctx.agentPresets.securityEntryState().acknowledged).toBe(false)
  })

  it('refuses an explicit Security create until the launch is acknowledged', async () => {
    const ctx = await setup()
    expect(() => ctx.agentPresets.assertNewConversationPreset('security')).toThrowError(/security-mode notice/)
    expect(() => ctx.agentPresets.assertNewConversationPreset(undefined)).not.toThrow()
    expect(() => ctx.agentPresets.assertNewConversationPreset('standard')).not.toThrow()

    const agent = await agentOn(ctx, 'create-gate-ack')
    confirm(ctx, agent.id)
    expect(() => ctx.agentPresets.assertNewConversationPreset('security')).not.toThrow()
  })

  it('keeps the policy off in compositions that do not opt in', async () => {
    const ctx = await harness()
    contexts.push(ctx)
    await declare(ctx, contribution('standard'))
    await declare(ctx, { ...contribution('security'), id: 'security' })
    const agent = await agentOn(ctx, 'headless-security')
    expect(ctx.agentPresets.securityEntryState().required).toBe(false)
    expect(await ctx.agentPresets.select(agent, 'security')).toBe('security')
    expect(() => ctx.agentPresets.assertNewConversationPreset('security')).not.toThrow()
    expect(() => ctx.agentPresets.beginSecurityEntry(agent.id, 'zh')).toThrowError(/not enabled/)
  })

  it('rejects a challenge for a conversation that already started', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'started-security')
    agent.session.append('turn/start', { turn: 1 })
    expect(remoteErrorOf(captured(() => ctx.agentPresets.beginSecurityEntry(agent.id, 'zh'))))
      .toMatchObject({ code: 'security-entry/session' })
  })

  it('rejects a challenge for an absent conversation', async () => {
    const ctx = await setup()
    expect(remoteErrorOf(captured(() => ctx.agentPresets.beginSecurityEntry(SessionId('missing-security'), 'zh'))))
      .toMatchObject({ code: 'security-entry/session' })
  })

  it('keeps owner-only operations closed to delegated principals', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'owner-security')
    const invocation = {
      request: { namespace: 'agentPresets', method: 'beginSecurityEntry', args: {} }, service: 'agentPresets',
      peer: {
        id: 'security-viewer', ctx, principal: { kind: 'security-viewer-test' }, interactions: 'answer',
        signal: new AbortController().signal, dispose: async () => {},
      },
      signal: new AbortController().signal,
      uplink: <In>(): AsyncIterable<In> => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    }
    const guest = ctx.extend({ invocation }).agentPresets
    expect(() => guest.beginSecurityEntry(agent.id, 'zh')).toThrowError()
    expect(ctx.agentPresets.securityEntryState().acknowledged).toBe(false)
  })

  it('invalidates the challenge when the provider changes during the reading interval', async () => {
    let protection = DISABLED
    const ctx = await setup(() => protection)
    const agent = await agentOn(ctx, 'changing-protection')
    const challenge = ctx.agentPresets.beginSecurityEntry(agent.id, 'zh')
    protection = { state: 'enabled', revision: 2, capabilities: ['mainland-domains'] }
    const clock = afterWait()
    try {
      expect(() => ctx.agentPresets.confirmSecurityEntry(challenge.id, agent.id, challenge.declaration)).toThrowError(/Protection changed/)
    } finally { clock.mockRestore() }
    expect(ctx.agentPresets.securityEntryState()).toMatchObject({
      acknowledged: false, protection: { state: 'enabled', revision: 2, capabilities: ['mainland-domains'] },
    })
  })

  it('reports an unavailable protection backend instead of claiming it is enabled', async () => {
    const ctx = await harness({ live: true, config: securityConfig() })
    contexts.push(ctx)
    ctx.provide('securityProtection', { read: () => { throw new Error('backend down') } })
    expect(ctx.agentPresets.securityEntryState().protection).toEqual({
      state: 'unavailable', revision: 0, capabilities: [],
    })
  })

  it('publishes acknowledgement and protection changes to observers', async () => {
    let protection = DISABLED
    const ctx = await setup(() => protection)
    const events: boolean[] = []
    ctx.on('agent-preset/security-entry', state => { events.push(state.acknowledged) })
    const agent = await agentOn(ctx, 'event-security')
    confirm(ctx, agent.id)
    protection = { state: 'enabled', revision: 2, capabilities: [] }
    ctx.emit('security-protection/changed')
    expect(events).toEqual([true, true])
  })

  it('reports an already acknowledged launch when a window opens late', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'late-begin')
    confirm(ctx, agent.id)
    expect(remoteErrorOf(captured(() => ctx.agentPresets.beginSecurityEntry(agent.id, 'zh'))))
      .toMatchObject({ code: 'security-entry/consumed', details: { acknowledged: true } })
  })

  it('cancels a pending challenge without acknowledging the launch', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'cancel-entry')
    const challenge = ctx.agentPresets.beginSecurityEntry(agent.id, 'zh')
    expect(ctx.agentPresets.cancelSecurityEntry(challenge.id)).toMatchObject({ acknowledged: false })
    expect(remoteErrorOf(captured(() => ctx.agentPresets.confirmSecurityEntry(challenge.id, agent.id, challenge.declaration))))
      .toMatchObject({ code: 'security-entry/confirmation' })
  })

  it('rejects a child conversation as a first entry target', async () => {
    const ctx = await setup()
    const parent = await agentOn(ctx, 'parent-security')
    const child = await ctx.agents.create({
      sessionId: SessionId('side-security'),
      meta: { parentSession: parent.id },
      setup: async (scope) => { await ctx.agentPresets.mount(scope) },
    })
    expect(remoteErrorOf(captured(() => ctx.agentPresets.beginSecurityEntry(child.agent.id, 'zh'))))
      .toMatchObject({ code: 'security-entry/session' })
  })

  it('does not re-gate a session that already records the protected preset', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'already-security')
    agent.session.append('agent-preset/selected', { agentPreset: 'security' })
    expect(await ctx.agentPresets.select(agent, 'security')).toBe('security')
    expect(ctx.agentPresets.securityEntryState().acknowledged).toBe(false)
  })

  it('keeps the state change visible when an observer throws', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'throwing-observer')
    ctx.on('agent-preset/security-entry', () => { throw new Error('observer failed') })
    expect(confirm(ctx, agent.id)).toMatchObject({ acknowledged: true })
  })
})
