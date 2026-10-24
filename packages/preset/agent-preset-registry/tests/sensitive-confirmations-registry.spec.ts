/** The confirmation preference's effect on the other guards, and its persistence path. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import type { Context } from '@deepseek-ai/cordis'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { SecurityProtectionStatus, SensitiveConfirmationPolicy } from '../src/types.ts'
import { agentOn, contribution, declare, harness, liveRegistries } from './harness.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { 'confirmation-viewer-test': { kind: 'confirmation-viewer-test' } }
}

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

const DISABLED: SecurityProtectionStatus = { state: 'disabled', revision: 1, capabilities: [] }

function securityConfig() {
  return { default: 'standard', requireSecurityEntryAcknowledgement: true, securityEntryPreset: 'security' }
}

async function setup(extra: Record<string, unknown> = {}) {
  const ctx = await harness({ live: true, config: { ...securityConfig(), ...extra } })
  contexts.push(ctx)
  ctx.provide('securityProtection', { read: () => DISABLED })
  await declare(ctx, contribution('standard'))
  await declare(ctx, { ...contribution('security'), id: 'security' })
  return ctx
}

function afterWait(ms = 10_000) {
  const clock = vi.spyOn(performance, 'now')
  const base = performance.now()
  clock.mockReturnValue(base + ms)
  return clock
}

function failureOf(operation: () => unknown) {
  try { operation() } catch (error) { return remoteErrorOf(error) }
  throw new Error('operation did not fail')
}

describe('sensitive-action confirmation preference in the registry', () => {
  it('starts on and drops the first-entry requirement once the owner turns it off', async () => {
    const ctx = await setup()
    expect(ctx.agentPresets.sensitiveConfirmationPolicy()).toEqual({ confirmations: true })
    const agent = await agentOn(ctx, 'confirmation-on')
    await expect(ctx.agentPresets.select(agent, 'security')).rejects.toMatchObject({ code: 'security-entry/required' })

    const challenge = ctx.agentPresets.beginSensitiveConfirmation(false)
    expect(challenge).toMatchObject({ confirmations: false, waitMs: 10_000 })
    const clock = afterWait()
    let policy: SensitiveConfirmationPolicy
    try { policy = await ctx.agentPresets.confirmSensitiveConfirmation(challenge.id) } finally { clock.mockRestore() }
    expect(policy).toEqual({ confirmations: false })
    expect(ctx.agentPresets.securityEntryState()).toMatchObject({ required: false, acknowledged: false })
    expect(await ctx.agentPresets.select(agent, 'security')).toBe('security')
    expect(() => { ctx.agentPresets.assertNewConversationPreset('security') }).not.toThrow()
    expect(failureOf(() => ctx.agentPresets.beginSecurityEntry(agent.id, 'zh')))
      .toMatchObject({ code: 'security-entry/disabled' })
  })

  it('needs no countdown to turn confirmations back on and restores the guard', async () => {
    const ctx = await setup({ sensitiveConfirmations: false })
    expect(ctx.agentPresets.sensitiveConfirmationPolicy()).toEqual({ confirmations: false })

    const challenge = ctx.agentPresets.beginSensitiveConfirmation(true)
    expect(challenge).toMatchObject({ confirmations: true, waitMs: 0 })
    expect(await ctx.agentPresets.confirmSensitiveConfirmation(challenge.id)).toEqual({ confirmations: true })
    expect(ctx.agentPresets.securityEntryState().required).toBe(true)
  })

  it('enables established-conversation switching without a countdown while confirmations are off', async () => {
    const ctx = await setup({ sensitiveConfirmations: false })
    const challenge = ctx.agentPresets.beginModeSwitch()
    expect(challenge.waitMs).toBe(0)
    expect(ctx.agentPresets.confirmModeSwitch(challenge.id)).toEqual({ allowExistingSessionSwitch: true })
  })

  it('keeps the countdown for switching while confirmations are on', async () => {
    const ctx = await setup()
    const challenge = ctx.agentPresets.beginModeSwitch()
    expect(challenge.waitMs).toBe(10_000)
    expect(failureOf(() => ctx.agentPresets.confirmModeSwitch(challenge.id))).toMatchObject({
      code: 'agent-preset/confirmation', details: { remainingMs: 10_000 },
    })
  })

  it('refuses a preference change before the reading interval and publishes the committed one', async () => {
    const ctx = await setup()
    const seen: boolean[] = []
    ctx.on('agent-preset/sensitive-confirmations', (policy) => { seen.push(policy.confirmations) })
    const challenge = ctx.agentPresets.beginSensitiveConfirmation(false)
    await expect(ctx.agentPresets.confirmSensitiveConfirmation(challenge.id))
      .rejects.toMatchObject({ code: 'agent-preset/confirmation' })
    expect(ctx.agentPresets.sensitiveConfirmationPolicy()).toEqual({ confirmations: true })

    const clock = afterWait()
    try { await ctx.agentPresets.confirmSensitiveConfirmation(challenge.id) } finally { clock.mockRestore() }
    // The early attempt published nothing; the committed one announced once.
    expect(seen).toEqual([false])
  })

  it('drops an open first-entry challenge when the preference changes', async () => {
    const ctx = await setup()
    const agent = await agentOn(ctx, 'open-entry')
    const challenge = ctx.agentPresets.beginSecurityEntry(agent.id, 'zh')
    const preference = ctx.agentPresets.beginSensitiveConfirmation(false)
    const clock = afterWait()
    try { await ctx.agentPresets.confirmSensitiveConfirmation(preference.id) } finally { clock.mockRestore() }
    // The challenge was dropped with the guard, and the disabled policy answers first.
    expect(failureOf(() => {
      ctx.agentPresets.confirmSecurityEntry(challenge.id, agent.id, challenge.declaration)
    })).toMatchObject({ code: 'security-entry/disabled' })
    expect(ctx.agentPresets.securityEntryState().acknowledged).toBe(false)
  })

  it('refuses preference changes from a delegated principal', async () => {
    const ctx = await setup()
    const invocation = {
      request: { namespace: 'agentPresets', method: 'beginSensitiveConfirmation', args: {} }, service: 'agentPresets',
      peer: {
        id: 'confirmation-viewer', ctx, principal: { kind: 'confirmation-viewer-test' }, interactions: 'answer',
        signal: new AbortController().signal, dispose: async () => {},
      },
      signal: new AbortController().signal,
      uplink: <In>(): AsyncIterable<In> => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    }
    const guest = ctx.extend({ invocation }).agentPresets
    expect(() => guest.beginSensitiveConfirmation(false)).toThrow()
    expect(ctx.agentPresets.sensitiveConfirmationPolicy()).toEqual({ confirmations: true })
  })
})

describe('sensitive-action preference persistence', () => {
  it('writes the preference through the settings document', async () => {
    const ctx = await setup()
    // The real settings service commits volatile fields into the running fiber;
    // this stub does the same through the Loader update the harness exposes.
    const live = liveRegistries.get(ctx)!
    const update = vi.fn(async (_ns: string, patch: Record<string, unknown>) => { await live.update(patch) })
    ctx.provide('settings', { configure: () => () => {}, update } as never)
    const challenge = ctx.agentPresets.beginSensitiveConfirmation(false)
    const clock = afterWait()
    try { await ctx.agentPresets.confirmSensitiveConfirmation(challenge.id) } finally { clock.mockRestore() }
    expect(update).toHaveBeenCalledWith('agent-preset-registry', { sensitiveConfirmations: false })
    expect(ctx.agentPresets.sensitiveConfirmationPolicy()).toEqual({ confirmations: false })
  })

  it('applies the preference to this launch when the document cannot be written', async () => {
    const ctx = await setup()
    ctx.provide('settings', {
      configure: () => () => {},
      update: async () => { throw new Error('read-only profile') },
    } as never)
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const challenge = ctx.agentPresets.beginSensitiveConfirmation(false)
    const clock = afterWait()
    try { await ctx.agentPresets.confirmSensitiveConfirmation(challenge.id) } finally { clock.mockRestore() }
    expect(warn).toHaveBeenCalled()
    expect(ctx.agentPresets.sensitiveConfirmationPolicy()).toEqual({ confirmations: false })
    warn.mockRestore()
  })
})
