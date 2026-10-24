import { afterEach, describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SecurityEntryChallenge, SecurityEntryChallengeId, SecurityEntryState, SecurityProtectionStatus,
} from '@deepseek-ai/dsh-agent-preset-registry/types'
import { SecurityEntryController, protectionDiffers, type SecurityEntryRemote } from '../src/client/security-entry-controller.ts'

afterEach(() => { vi.useRealTimers() })

const session = SessionId('session-security-client')
const other = SessionId('session-security-client-other')
const challengeId = brandString<SecurityEntryChallengeId>('challenge-security-client')
const DISABLED: SecurityProtectionStatus = { state: 'disabled', revision: 1, capabilities: [] }
const DECLARATION = '我确认已获得相应操作授权，并了解当前保护未启用'

const STATE: SecurityEntryState = { required: true, preset: 'security', acknowledged: false, protection: DISABLED }

function challenge(id = challengeId, protection = DISABLED): SecurityEntryChallenge {
  return { id, waitMs: 10_000, declaration: DECLARATION, protection }
}

function setup() {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  const remote: SecurityEntryRemote = {
    read: vi.fn(async () => STATE),
    begin: vi.fn(async () => challenge()),
    confirm: vi.fn(async () => ({ ...STATE, acknowledged: true })),
    cancel: vi.fn(async () => STATE),
  }
  const controller = new SecurityEntryController(remote, () => 'zh')
  return { remote, controller }
}

async function flush(): Promise<void> { await vi.advanceTimersByTimeAsync(0) }

describe('Security entry controller', () => {
  it('reads the Host policy and identifies the protected preset', async () => {
    const { controller } = setup()
    await controller.ready()
    expect(controller.protects('security')).toBe(true)
    expect(controller.protects('standard')).toBe(false)
    expect(controller.acknowledged()).toBe(false)
    await controller.dispose()
  })

  it('waits for the countdown, then submits the exact declaration', async () => {
    const { remote, controller } = setup()
    try {
      const gate = controller.request(session)
      await flush()
      expect(controller.store.getSnapshot().dialog?.remaining).toBe(10)
      await controller.confirm(DECLARATION)
      expect(remote.confirm).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(10_000)
      expect(controller.store.getSnapshot().dialog?.remaining).toBe(0)
      await controller.confirm(DECLARATION)
      expect(remote.confirm).toHaveBeenCalledExactlyOnceWith(challengeId, session, DECLARATION)
      expect(await gate).toBe(true)
      expect(controller.acknowledged()).toBe(true)
      expect(controller.store.getSnapshot().dialog).toBeNull()
    } finally { await controller.dispose() }
  })

  it('rejects a missing or inexact declaration before calling the Host', async () => {
    const { remote, controller } = setup()
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm('')
      expect(controller.store.getSnapshot().dialog?.error).toBe('declaration')
      await controller.confirm('我确认')
      expect(controller.store.getSnapshot().dialog?.error).toBe('declaration')
      expect(remote.confirm).not.toHaveBeenCalled()
      await controller.confirm(`  ${DECLARATION}  `)
      expect(remote.confirm).toHaveBeenCalledOnce()
      expect(await gate).toBe(true)
    } finally { await controller.dispose() }
  })

  it('shares one pending request and resolves it once', async () => {
    const { remote, controller } = setup()
    try {
      const first = controller.request(session)
      await flush()
      const second = controller.request(session)
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      expect(await first).toBe(true)
      expect(await second).toBe(true)
      expect(remote.begin).toHaveBeenCalledOnce()
    } finally { await controller.dispose() }
  })

  it('cancels without consuming the first confirmation', async () => {
    const { remote, controller } = setup()
    try {
      const gate = controller.request(session)
      await flush()
      controller.cancel()
      expect(await gate).toBe(false)
      expect(remote.cancel).toHaveBeenCalledExactlyOnceWith(challengeId)
      expect(controller.acknowledged()).toBe(false)
      expect(controller.store.getSnapshot().dialog).toBeNull()

      const next = controller.request(session)
      await flush()
      expect(remote.begin).toHaveBeenCalledTimes(2)
      controller.cancel()
      expect(await next).toBe(false)
    } finally { await controller.dispose() }
  })

  it('ignores a cancel while the Host confirmation is in flight', async () => {
    const { remote, controller } = setup()
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      const response = Promise.withResolvers<SecurityEntryState>()
      remote.confirm.mockReturnValueOnce(response.promise)
      const submitting = controller.confirm(DECLARATION)
      controller.cancel()
      expect(controller.store.getSnapshot().dialog?.busy).toBe(true)
      response.resolve({ ...STATE, acknowledged: true })
      await submitting
      expect(await gate).toBe(true)
    } finally { await controller.dispose() }
  })

  it('refreshes the challenge and countdown when protection changes', async () => {
    const { remote, controller } = setup()
    const nextId = brandString<SecurityEntryChallengeId>('challenge-security-client-2')
    const enabled: SecurityProtectionStatus = { state: 'enabled', revision: 2, capabilities: ['mainland-domains'] }
    remote.begin.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge(nextId, enabled))
    try {
      const gate = controller.request(session)
      await flush()
      controller.accept({ ...STATE, protection: enabled })
      await flush()
      const dialog = controller.store.getSnapshot().dialog
      expect(dialog?.challenge?.id).toBe(nextId)
      expect(dialog?.challenge?.declaration).toBe(DECLARATION)
      expect(dialog?.remaining).toBe(10)
      expect(dialog?.error).toBe('changed')
      expect(controller.store.getSnapshot().protection).toEqual(enabled)
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('treats a consumed challenge as success when another window confirmed', async () => {
    const { remote, controller } = setup()
    remote.read.mockResolvedValueOnce(STATE).mockResolvedValueOnce({ ...STATE, acknowledged: true })
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/consumed', 'already confirmed', { acknowledged: true }))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      expect(await gate).toBe(true)
      expect(controller.store.getSnapshot().dialog).toBeNull()
    } finally { await controller.dispose() }
  })

  it('surfaces an expired challenge and retries with a fresh one', async () => {
    const { remote, controller } = setup()
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/confirmation', 'expired', { remainingMs: 0 }))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      expect(controller.store.getSnapshot().dialog).toMatchObject({ challenge: null, error: 'expired', remaining: 0 })
      controller.retry()
      await flush()
      expect(controller.store.getSnapshot().dialog?.challenge).not.toBeNull()
      expect(remote.begin).toHaveBeenCalledTimes(2)
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('restarts the countdown when the Host reports the client confirmed early', async () => {
    const { remote, controller } = setup()
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/wait', 'wait', { remainingMs: 500 }))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      expect(controller.store.getSnapshot().dialog?.remaining).toBe(1)
      await vi.advanceTimersByTimeAsync(500)
      expect(controller.store.getSnapshot().dialog?.remaining).toBe(0)
      await controller.confirm(DECLARATION)
      expect(await gate).toBe(true)
    } finally { await controller.dispose() }
  })

  it('keeps a host failure retryable without losing the challenge', async () => {
    const { remote, controller } = setup()
    remote.confirm.mockRejectedValueOnce(new Error('offline'))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      expect(controller.store.getSnapshot().dialog).toMatchObject({ error: 'failed', busy: false })
      expect(controller.store.getSnapshot().dialog?.challenge).not.toBeNull()
      await controller.confirm(DECLARATION)
      expect(await gate).toBe(true)
    } finally { await controller.dispose() }
  })

  it('opens a retryable error dialog when the Host cannot issue a challenge', async () => {
    const { remote, controller } = setup()
    remote.begin.mockRejectedValueOnce(new Error('offline'))
    try {
      const gate = controller.request(session)
      await flush()
      expect(controller.store.getSnapshot().dialog).toMatchObject({ challenge: null, error: 'failed', busy: false })
      controller.retry()
      await flush()
      expect(controller.store.getSnapshot().dialog?.challenge).not.toBeNull()
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('keeps a lost carrier retryable', async () => {
    const { controller } = setup()
    try {
      const gate = controller.request(session)
      await flush()
      controller.connectionLost()
      expect(controller.store.getSnapshot().dialog).toMatchObject({ challenge: null, error: 'disconnected' })
      controller.retry()
      await flush()
      expect(controller.store.getSnapshot().dialog?.challenge).not.toBeNull()
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('closes when another window acknowledges or the policy turns off', async () => {
    const { controller } = setup()
    try {
      const gate = controller.request(session)
      await flush()
      controller.accept({ ...STATE, acknowledged: true })
      expect(await gate).toBe(true)

      // A later launch (or a Host reset in tests) has no acknowledgement yet;
      // turning the policy off then closes its waiting dialog.
      controller.accept(STATE)
      const second = controller.request(other)
      await flush()
      controller.accept({ ...STATE, required: false })
      expect(await second).toBe(false)
    } finally { await controller.dispose() }
  })

  it('releases a waiting seat and ignores late work after disposal', async () => {
    const { remote, controller } = setup()
    const gate = controller.request(session)
    await flush()
    controller.dispose()
    expect(await gate).toBe(false)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(remote.confirm).not.toHaveBeenCalled()
    expect(controller.store.getSnapshot().dialog).toBeNull()
    expect(await controller.request(session)).toBe(false)
  })

  it('cancels a dialog whose conversation is no longer current', async () => {
    const { controller } = setup()
    try {
      const gate = controller.request(session)
      await flush()
      controller.sessionChanged(session)
      expect(controller.store.getSnapshot().dialog).not.toBeNull()
      controller.sessionChanged(other)
      expect(await gate).toBe(false)
      expect(controller.store.getSnapshot().dialog).toBeNull()
    } finally { await controller.dispose() }
  })

  it('keeps a failed policy read retryable', async () => {
    const { remote, controller } = setup()
    remote.read.mockRejectedValueOnce(new Error('offline'))
    try {
      await controller.load()
      expect(controller.store.getSnapshot().status).toBe('error')
      const gate = controller.request(session)
      await flush()
      expect(controller.store.getSnapshot().status).toBe('ready')
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('swallows a best-effort cancel failure', async () => {
    const { remote, controller } = setup()
    remote.cancel.mockRejectedValueOnce(new Error('host restarted'))
    try {
      const gate = controller.request(session)
      await flush()
      controller.cancel()
      expect(await gate).toBe(false)
      await flush()
    } finally { await controller.dispose() }
  })

  it('treats a consumed begin as an acknowledgement from another window', async () => {
    const { remote, controller } = setup()
    remote.begin.mockRejectedValueOnce(new RemoteError('security-entry/consumed', 'already confirmed', { acknowledged: true }))
    try {
      const gate = controller.request(session)
      await flush()
      expect(await gate).toBe(true)
      expect(controller.acknowledged()).toBe(true)
      expect(controller.store.getSnapshot().dialog).toBeNull()
    } finally { await controller.dispose() }
  })

  it('treats a disabled Host policy as already allowed', async () => {
    const { remote, controller } = setup()
    remote.begin.mockRejectedValueOnce(new RemoteError('security-entry/disabled', 'not enabled', {}))
    try {
      const gate = controller.request(session)
      await flush()
      expect(await gate).toBe(true)
      expect(controller.store.getSnapshot().required).toBe(false)
      expect(controller.store.getSnapshot().dialog).toBeNull()
    } finally { await controller.dispose() }
  })

  it('keeps a Host declaration rejection visible for correction', async () => {
    const { remote, controller } = setup()
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/declaration', 'wrong', { declaration: DECLARATION }))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      expect(controller.store.getSnapshot().dialog).toMatchObject({ error: 'declaration', busy: false })
      expect(controller.store.getSnapshot().dialog?.challenge).not.toBeNull()
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('maps an unrelated carrier failure to a retryable error', async () => {
    const { remote, controller } = setup()
    remote.confirm.mockRejectedValueOnce(new RemoteError('gateway/internal', 'carrier', {}))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      expect(controller.store.getSnapshot().dialog).toMatchObject({ error: 'failed', busy: false })
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('accepts a zero-length reading interval', async () => {
    const { remote, controller } = setup()
    remote.begin.mockResolvedValueOnce({ ...challenge(), waitMs: 0 })
    try {
      const gate = controller.request(session)
      await flush()
      expect(controller.store.getSnapshot().dialog?.remaining).toBe(0)
      await controller.confirm(DECLARATION)
      expect(await gate).toBe(true)
    } finally { await controller.dispose() }
  })

  it('replaces a pending request when another conversation asks first', async () => {
    const { remote, controller } = setup()
    const firstBegin = Promise.withResolvers<SecurityEntryChallenge>()
    remote.begin.mockReturnValueOnce(firstBegin.promise).mockResolvedValueOnce(challenge())
    try {
      const first = controller.request(session)
      await flush()
      const second = controller.request(other)
      await flush()
      firstBegin.resolve(challenge())
      expect(await first).toBe(false)
      controller.cancel()
      expect(await second).toBe(false)
    } finally { await controller.dispose() }
  })

  it('ignores a begin that settles after disposal', async () => {
    const { remote, controller } = setup()
    const begin = Promise.withResolvers<SecurityEntryChallenge>()
    remote.begin.mockReturnValueOnce(begin.promise)
    const gate = controller.request(session)
    await flush()
    controller.dispose()
    begin.resolve(challenge())
    expect(await gate).toBe(false)
    expect(controller.store.getSnapshot().dialog).toBeNull()
  })

  it('closes a consumed reconciliation when the carrier goes away', async () => {
    const { remote, controller } = setup()
    const reading = Promise.withResolvers<SecurityEntryState>()
    remote.read
      .mockResolvedValueOnce(STATE)
      .mockReturnValueOnce(reading.promise)
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/consumed', 'already', { acknowledged: true }))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      controller.dispose()
      reading.resolve({ ...STATE, acknowledged: true })
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('surfaces an expired retry when a consumed challenge was not acknowledged elsewhere', async () => {
    const { remote, controller } = setup()
    remote.read.mockResolvedValueOnce(STATE).mockResolvedValueOnce(STATE)
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/consumed', 'consumed', { acknowledged: false }))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      await flush()
      expect(controller.store.getSnapshot().dialog).toMatchObject({ challenge: null, error: 'expired', busy: false })
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('restarts from a Host changed rejection', async () => {
    const { remote, controller } = setup()
    const next = brandString<SecurityEntryChallengeId>('challenge-security-client-changed')
    const enabled: SecurityProtectionStatus = { state: 'enabled', revision: 9, capabilities: [] }
    remote.begin.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge(next, enabled))
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/changed', 'changed', { protection: enabled }))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      await flush()
      expect(controller.store.getSnapshot().dialog).toMatchObject({ error: 'changed', remaining: 10 })
      expect(controller.store.getSnapshot().dialog?.challenge?.id).toBe(next)
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('ignores operations after disposal', async () => {
    const { controller } = setup()
    controller.dispose()
    await controller.load()
    controller.accept(STATE)
    expect(await controller.request(session)).toBe(false)
    controller.retry()
    controller.connectionLost()
    await controller.confirm(DECLARATION)
    await controller.request(session)
    expect(controller.store.getSnapshot().dialog).toBeNull()
  })

  it('ignores a policy read that settles after a newer read', async () => {
    const { remote, controller } = setup()
    const first = Promise.withResolvers<SecurityEntryState>()
    remote.read.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...STATE, required: false })
    try {
      const older = controller.load()
      const newer = controller.load()
      await newer
      first.resolve(STATE)
      await older
      expect(controller.store.getSnapshot().required).toBe(false)
    } finally { await controller.dispose() }
  })

  it('releases a request whose policy read outlives disposal', async () => {
    const { remote, controller } = setup()
    const reading = Promise.withResolvers<SecurityEntryState>()
    remote.read.mockReturnValueOnce(reading.promise)
    const gate = controller.request(session)
    await flush()
    controller.dispose()
    reading.resolve(STATE)
    expect(await gate).toBe(false)
  })

  it('ignores a confirmation that settles after disposal', async () => {
    const { remote, controller } = setup()
    const response = Promise.withResolvers<SecurityEntryState>()
    remote.confirm.mockReturnValueOnce(response.promise)
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      const submitting = controller.confirm(DECLARATION)
      controller.dispose()
      response.resolve({ ...STATE, acknowledged: true })
      await submitting
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('defers the policy read only for the protected preset', async () => {
    const { controller } = setup()
    expect(controller.mayProtect('security')).toBe(true)
    expect(controller.mayProtect('standard')).toBe(false)
    await controller.dispose()
  })

  it('compares complete protection snapshots', () => {
    const mainland: SecurityProtectionStatus = { state: 'disabled', revision: 1, capabilities: ['mainland-domains'] }
    const targets: SecurityProtectionStatus = { state: 'disabled', revision: 1, capabilities: ['target-rules'] }
    expect(protectionDiffers(mainland, { ...mainland })).toBe(false)
    expect(protectionDiffers(mainland, targets)).toBe(true)
    expect(protectionDiffers(mainland, { ...mainland, revision: 2 })).toBe(true)
    expect(protectionDiffers(mainland, { ...mainland, capabilities: [] })).toBe(true)
  })

  it('ignores a stale policy read that rejects after a newer read', async () => {
    const { remote, controller } = setup()
    const stale = Promise.withResolvers<SecurityEntryState>()
    remote.read.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ ...STATE, required: false })
    try {
      const older = controller.load()
      const newer = controller.load()
      await newer
      stale.reject(new Error('stale'))
      await older
      expect(controller.store.getSnapshot().status).toBe('ready')
      expect(controller.store.getSnapshot().required).toBe(false)
    } finally { await controller.dispose() }
  })

  it('settles a submission that the Host returned unacknowledged', async () => {
    const { remote, controller } = setup()
    remote.confirm.mockResolvedValueOnce(STATE)
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      expect(controller.store.getSnapshot().dialog).toMatchObject({ busy: false, challenge: challenge() })
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('treats a capability-only change as a changed challenge', async () => {
    const { remote, controller } = setup()
    const mainland: SecurityProtectionStatus = { state: 'disabled', revision: 1, capabilities: ['mainland-domains'] }
    const targets: SecurityProtectionStatus = { state: 'disabled', revision: 1, capabilities: ['target-rules'] }
    remote.begin.mockResolvedValueOnce(challenge(mainland)).mockResolvedValueOnce(challenge(mainland))
    try {
      const gate = controller.request(session)
      await flush()
      controller.accept({ ...STATE, protection: targets })
      await flush()
      expect(controller.store.getSnapshot().protection).toEqual(targets)
      expect(controller.store.getSnapshot().dialog?.error).toBe('changed')
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('lets an acknowledged or disabled policy proceed without a challenge', async () => {
    const { controller } = setup()
    try {
      controller.accept({ ...STATE, acknowledged: true })
      expect(await controller.request(session)).toBe(true)
      controller.accept({ ...STATE, required: false })
      expect(await controller.request(session)).toBe(true)
    } finally { await controller.dispose() }
  })

  it('ignores a confirmation failure from an older dialog generation', async () => {
    const { remote, controller } = setup()
    const rejection = Promise.withResolvers<SecurityEntryState>()
    remote.confirm.mockReturnValueOnce(rejection.promise)
    const enabled: SecurityProtectionStatus = { state: 'enabled', revision: 8, capabilities: [] }
    remote.begin.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge(undefined, undefined))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      const submitting = controller.confirm(DECLARATION)
      controller.accept({ ...STATE, protection: enabled })
      rejection.reject(new RemoteError('security-entry/declaration', 'stale', { declaration: DECLARATION }))
      await submitting
      await flush()
      expect(controller.store.getSnapshot().dialog?.error).toBe('changed')
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('leaves a fresh restart alone when a consumed reconciliation lands', async () => {
    const { remote, controller } = setup()
    const enabled: SecurityProtectionStatus = { state: 'enabled', revision: 8, capabilities: [] }
    remote.read.mockResolvedValueOnce(STATE).mockResolvedValueOnce({ ...STATE, protection: enabled })
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/consumed', 'consumed', { acknowledged: false }))
    remote.begin.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge(brandString<SecurityEntryChallengeId>('challenge-fresh')))
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      await flush()
      expect(controller.store.getSnapshot().dialog?.error).toBe('changed')
      expect(controller.store.getSnapshot().dialog?.challenge).not.toBeNull()
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })

  it('does not expire a dialog while its replacement challenge is still opening', async () => {
    const { remote, controller } = setup()
    const enabled: SecurityProtectionStatus = { state: 'enabled', revision: 8, capabilities: [] }
    const replacement = Promise.withResolvers<SecurityEntryChallenge>()
    remote.read.mockResolvedValueOnce(STATE).mockResolvedValueOnce({ ...STATE, protection: enabled })
    remote.confirm.mockRejectedValueOnce(new RemoteError('security-entry/consumed', 'consumed', { acknowledged: false }))
    remote.begin.mockResolvedValueOnce(challenge()).mockReturnValueOnce(replacement.promise)
    try {
      const gate = controller.request(session)
      await flush()
      await vi.advanceTimersByTimeAsync(10_000)
      await controller.confirm(DECLARATION)
      await flush()
      expect(controller.store.getSnapshot().dialog).toMatchObject({ busy: true, error: 'changed' })
      replacement.resolve(challenge(brandString<SecurityEntryChallengeId>('challenge-replacement')))
      await flush()
      expect(controller.store.getSnapshot().dialog?.challenge?.id).toBe('challenge-replacement')
      controller.cancel()
      expect(await gate).toBe(false)
    } finally { await controller.dispose() }
  })
})
