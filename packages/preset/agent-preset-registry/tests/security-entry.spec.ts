import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { SecurityEntryChallengeId, SecurityProtectionStatus } from '../src/types.ts'
import {
  SECURITY_ENTRY_CHALLENGE_LIFETIME_MS, SECURITY_ENTRY_WAIT_MS, SecurityEntryPermission,
  sameProtection, securityEntryDeclaration,
} from '../src/security-entry.ts'

const session = SessionId('session-security-entry')
const other = SessionId('session-security-entry-other')

function failureOf(operation: () => unknown) {
  try { operation() } catch (error) { return remoteErrorOf(error) }
  throw new Error('operation did not fail')
}

function setup(initial: SecurityProtectionStatus = { state: 'disabled', revision: 1, capabilities: [] }) {
  let now = 0
  let protection = initial
  const permission = new SecurityEntryPermission(() => protection, () => now)
  return {
    permission,
    advance: (ms: number) => { now += ms },
    setProtection: (next: SecurityProtectionStatus) => { protection = next },
  }
}

describe('Security first-entry permission', () => {
  it.each(['zh', 'en'] as const)('accepts equivalent character widths for %s without accepting different words', (locale) => {
    const { permission, advance } = setup()
    const challenge = permission.begin(session, locale)
    advance(SECURITY_ENTRY_WAIT_MS)
    expect(() => permission.confirm(session, challenge.id, challenge.declaration + 'x')).toThrow()
    const equivalent = locale === 'zh' ? challenge.declaration.replace('，', ',')
      : challenge.declaration.replace(/[!-~]/gu, character => String.fromCharCode(character.charCodeAt(0) + 0xfee0))
    expect(permission.confirm(session, challenge.id, equivalent).acknowledged).toBe(true)
  })

  it('starts unacknowledged and reports the live protection state', () => {
    const { permission } = setup({ state: 'enabled', revision: 7, capabilities: ['mainland-domains'] })
    expect(permission.read()).toEqual({
      acknowledged: false,
      protection: { state: 'enabled', revision: 7, capabilities: ['mainland-domains'] },
    })
  })

  it('issues the localized declaration only when protection is not enabled', () => {
    const { permission } = setup()
    const zh = permission.begin(session, 'zh')
    expect(zh.waitMs).toBe(SECURITY_ENTRY_WAIT_MS)
    expect(zh.declaration).toBe(securityEntryDeclaration('zh'))
    expect(zh.declaration).toContain('我确认')
    expect(permission.begin(session, 'en').declaration).toBe(securityEntryDeclaration('en'))

    const { permission: enabled } = setup({ state: 'enabled', revision: 1, capabilities: [] })
    expect(enabled.begin(session, 'zh').declaration).toBe('')
  })

  it('rejects early confirmation but keeps the challenge usable after the wait', () => {
    const { permission, advance } = setup()
    const challenge = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_WAIT_MS - 1)
    expect(failureOf(() => permission.confirm(session, challenge.id, challenge.declaration))).toMatchObject({
      code: 'security-entry/wait', details: { remainingMs: 1 },
    })
    advance(1)
    expect(permission.confirm(session, challenge.id, challenge.declaration)).toMatchObject({ acknowledged: true })
    expect(permission.read().acknowledged).toBe(true)
  })

  it('requires the exact declaration and accepts surrounding whitespace', () => {
    const { permission, advance } = setup()
    const challenge = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_WAIT_MS)
    expect(failureOf(() => permission.confirm(session, challenge.id, ''))).toMatchObject({
      code: 'security-entry/declaration', details: { declaration: challenge.declaration },
    })
    expect(failureOf(() => permission.confirm(session, challenge.id, '我确认'))).toMatchObject({ code: 'security-entry/declaration' })
    expect(permission.confirm(session, challenge.id, `  ${challenge.declaration}  `).acknowledged).toBe(true)
  })

  it('accepts an empty declaration only when protection was enabled at issue time', () => {
    const { permission, advance } = setup({ state: 'enabled', revision: 3, capabilities: ['target-rules'] })
    const challenge = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_WAIT_MS)
    expect(permission.confirm(session, challenge.id, '').acknowledged).toBe(true)
  })

  it('refuses a challenge issued for another conversation', () => {
    const { permission, advance } = setup()
    const challenge = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_WAIT_MS)
    expect(failureOf(() => permission.confirm(other, challenge.id, challenge.declaration))).toMatchObject({
      code: 'security-entry/session', details: { sessionId: session },
    })
    expect(permission.read().acknowledged).toBe(false)
  })

  it('invalidates the challenge when protection changes after it was issued', () => {
    const { permission, advance, setProtection } = setup({ state: 'disabled', revision: 1, capabilities: [] })
    const challenge = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_WAIT_MS)
    setProtection({ state: 'enabled', revision: 2, capabilities: ['mainland-domains'] })
    expect(failureOf(() => permission.confirm(session, challenge.id, challenge.declaration))).toMatchObject({
      code: 'security-entry/changed',
      details: { protection: { state: 'enabled', revision: 2, capabilities: ['mainland-domains'] } },
    })
    expect(permission.read().acknowledged).toBe(false)
    // The failed challenge is gone; the next confirmation must be opened again.
    expect(failureOf(() => permission.confirm(session, challenge.id, challenge.declaration))).toMatchObject({
      code: 'security-entry/confirmation',
    })
  })

  it('treats a revision-only change as a changed condition', () => {
    const { permission, advance, setProtection } = setup({ state: 'disabled', revision: 1, capabilities: [] })
    const challenge = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_WAIT_MS)
    setProtection({ state: 'disabled', revision: 2, capabilities: [] })
    expect(failureOf(() => permission.confirm(session, challenge.id, challenge.declaration))).toMatchObject({
      code: 'security-entry/changed',
    })
  })

  it('expires a challenge after its lifetime', () => {
    const { permission, advance } = setup()
    const challenge = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_CHALLENGE_LIFETIME_MS + 1)
    expect(failureOf(() => permission.confirm(session, challenge.id, challenge.declaration))).toMatchObject({
      code: 'security-entry/confirmation', details: { remainingMs: 0 },
    })
  })

  it('replaces an older challenge instead of pooling acknowledgements', () => {
    const { permission, advance } = setup()
    const first = permission.begin(session, 'zh')
    const second = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_WAIT_MS)
    expect(failureOf(() => permission.confirm(session, first.id, first.declaration))).toMatchObject({
      code: 'security-entry/confirmation',
    })
    expect(permission.confirm(session, second.id, second.declaration).acknowledged).toBe(true)
  })

  it('consumes the acknowledged launch exactly once', () => {
    const { permission, advance } = setup()
    const challenge = permission.begin(session, 'zh')
    advance(SECURITY_ENTRY_WAIT_MS)
    permission.confirm(session, challenge.id, challenge.declaration)
    expect(failureOf(() => permission.confirm(session, challenge.id, challenge.declaration))).toMatchObject({
      code: 'security-entry/consumed', details: { acknowledged: true },
    })
    permission.invalidate()
    expect(permission.read().acknowledged).toBe(true)
  })

  it('cancels only the challenge it names and never grants the acknowledgement', () => {
    const { permission, advance } = setup()
    const challenge = permission.begin(session, 'zh')
    permission.cancel(brandString<SecurityEntryChallengeId>('unrelated'))
    expect(permission.cancel(challenge.id)).toMatchObject({ acknowledged: false })
    advance(SECURITY_ENTRY_WAIT_MS)
    expect(failureOf(() => permission.confirm(session, challenge.id, challenge.declaration))).toMatchObject({
      code: 'security-entry/confirmation',
    })
  })

  it('compares complete protection snapshots', () => {
    const base: SecurityProtectionStatus = { state: 'enabled', revision: 1, capabilities: ['mainland-domains'] }
    expect(sameProtection(base, { ...base })).toBe(true)
    expect(sameProtection(base, { ...base, revision: 2 })).toBe(false)
    expect(sameProtection(base, { ...base, capabilities: ['target-rules'] })).toBe(false)
    expect(sameProtection(base, { ...base, capabilities: [] })).toBe(false)
  })
})
