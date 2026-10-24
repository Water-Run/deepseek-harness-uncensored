/** Reading interval, single-use challenge and replacement rules of the sensitive-action preference. */
import { describe, expect, it } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import {
  SENSITIVE_CONFIRMATION_CHALLENGE_LIFETIME_MS, SENSITIVE_CONFIRMATION_WAIT_MS, SensitiveConfirmationPermission,
} from '../src/sensitive-confirmations.ts'

function failureOf(operation: () => unknown) {
  try { operation() } catch (error) { return remoteErrorOf(error) }
  throw new Error('operation did not fail')
}

function setup(configured = true) {
  let now = 0
  let value = configured
  const permission = new SensitiveConfirmationPermission(() => value, () => now)
  return {
    permission,
    advance: (ms: number) => { now += ms },
    setConfigured: (next: boolean) => { value = next },
  }
}

describe('sensitive-action confirmation preference', () => {
  it('reads the configured preference live', () => {
    const { permission, setConfigured } = setup()
    expect(permission.read()).toBe(true)
    setConfigured(false)
    expect(permission.read()).toBe(false)
  })

  it('commits enabling without a reading interval and disabling only after one', () => {
    const { permission, advance } = setup(false)
    const enable = permission.begin(true)
    expect(enable).toMatchObject({ confirmations: true, waitMs: 0 })
    expect(permission.confirm(enable.id)).toBe(true)

    const disable = permission.begin(false)
    expect(disable).toMatchObject({ confirmations: false, waitMs: SENSITIVE_CONFIRMATION_WAIT_MS })
    advance(SENSITIVE_CONFIRMATION_WAIT_MS - 1)
    expect(failureOf(() => permission.confirm(disable.id))).toMatchObject({
      code: 'agent-preset/confirmation', details: { remainingMs: 1 },
    })
    advance(1)
    expect(permission.confirm(disable.id)).toBe(false)
  })

  it('consumes a challenge exactly once', () => {
    const { permission, advance } = setup()
    const challenge = permission.begin(false)
    advance(SENSITIVE_CONFIRMATION_WAIT_MS)
    expect(permission.confirm(challenge.id)).toBe(false)
    expect(failureOf(() => permission.confirm(challenge.id))).toMatchObject({ code: 'agent-preset/confirmation' })
  })

  it('replaces an older challenge instead of pooling confirmations', () => {
    const { permission, advance } = setup()
    const first = permission.begin(false)
    const second = permission.begin(true)
    advance(SENSITIVE_CONFIRMATION_WAIT_MS)
    expect(failureOf(() => permission.confirm(first.id))).toMatchObject({ code: 'agent-preset/confirmation' })
    expect(permission.confirm(second.id)).toBe(true)
  })

  it('expires and invalidates a pending challenge', () => {
    const { permission, advance } = setup()
    const expired = permission.begin(false)
    advance(SENSITIVE_CONFIRMATION_CHALLENGE_LIFETIME_MS + 1)
    expect(failureOf(() => permission.confirm(expired.id))).toMatchObject({ code: 'agent-preset/confirmation' })

    const invalidated = permission.begin(false)
    permission.invalidate()
    expect(failureOf(() => permission.confirm(invalidated.id))).toMatchObject({
      code: 'agent-preset/confirmation', details: { remainingMs: 0 },
    })
  })
})
