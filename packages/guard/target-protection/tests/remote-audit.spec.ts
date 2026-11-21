/** Remote request outcomes retain their audit owner without claiming a rollback. @module */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, onTestFinished, vi } from 'vitest'
import Protection from '../src/index.ts'
import { TargetAuditStore } from '../src/audit.ts'
import type { TargetRuleId } from '../src/types.ts'

const signal = new AbortController().signal
const firstRule = brandString<TargetRuleId>('00000000-0000-4000-8000-000000000001')
const secondRule = brandString<TargetRuleId>('00000000-0000-4000-8000-000000000002')

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-remote-audit-')), ctx = new Context()
  onTestFinished(async () => {
    vi.restoreAllMocks()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  })
  await ctx.plugin(Sessions)
  const auditPath = join(root, 'audit.sqlite')
  const owner = await ctx.plugin(Protection, { path: ':memory:', auditPath, hostsFile: '', busyTimeoutMs: 20 })
  return { root, ctx, owner, auditPath, protection: ctx.targetProtection }
}

it('records real refusals and returned results with readable targets and captured Session', async () => {
  const h = await fixture(), first = h.ctx.sessions.create(SessionId('remote-first')), second = h.ctx.sessions.create(SessionId('remote-second'))
  const identity = ['ssh', 'private-host.example', 22, '/private/file.txt']
  const entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  onTestFinished(() => { release.resolve(undefined) })
  const refusal = new HarnessError('Read-only resource', 'TARGET_READ_ONLY')
  const denied = h.protection.bindAuditSession(first.id)(() => h.protection.auditRemoteFile(identity, 'mutate', signal, async (_bounded, report) => {
    entered.resolve(undefined); await release.promise; report([firstRule, firstRule]); throw refusal
  }))
  const rejected = expect(denied).rejects.toBe(refusal)
  await entered.promise
  await h.protection.bindAuditSession(second.id)(() => h.protection.auditRemoteFile(identity, 'observe', signal, async (_bounded, report) => {
    report([secondRule]); return 'private contents'
  }))
  identity[3] = '/different/file.txt'
  release.resolve(undefined)
  await rejected
  const entries = h.protection.auditHistory().entries
  expect(entries).toHaveLength(2)
  expect(entries[0]).toMatchObject({ operation: 'file', effect: 'mutate', decision: 'deny', code: 'TARGET_READ_ONLY',
    ruleIds: [firstRule], matchedRules: 1, source: { sessionId: first.id } })
  expect(entries[1]).toMatchObject({ effect: 'observe', decision: 'allow', ruleIds: [secondRule], source: { sessionId: second.id } })
  expect(entries[0]?.fingerprint).toBe(entries[1]?.fingerprint)
  expect(entries[0]?.target).toBe(entries[1]?.target)
  expect(JSON.stringify(entries)).toContain('ssh private-host.example 22 /private/file.txt')
  expect(JSON.stringify(entries)).not.toContain('private contents')
  expect(first.snapshotEvents().filter(event => event.type === 'target/admission')).toHaveLength(1)
  expect(second.snapshotEvents().filter(event => event.type === 'target/admission')).toHaveLength(1)
})

it('reports an unacknowledged completed mutation and blocks later work after audit storage fails', async () => {
  const h = await fixture(), file = join(h.root, 'changed.txt')
  const blocker = new DatabaseSync(h.auditPath)
  let locked = false
  try {
    await expect(h.protection.auditRemoteFile(['ssh', 'fixture', file], 'mutate', signal, async (bounded) => {
      const peer = await h.protection.resolveConnectionTarget('127.0.0.1', bounded)
      await h.protection.checkConnection('127.0.0.1', 22, peer, 'endpoint', 'observe', bounded)
      await writeFile(file, 'changed')
      blocker.exec('BEGIN IMMEDIATE'); locked = true
      return 'completed'
    })).rejects.toMatchObject({ code: 'TARGET_AUDIT_UNCONFIRMED' })
    expect(await readFile(file, 'utf8')).toBe('changed')
    const later = vi.fn(async () => true)
    await expect(h.protection.auditRemoteFile(['ssh', 'fixture', file], 'mutate', signal, later))
      .rejects.toMatchObject({ code: 'TARGET_AUDIT_UNAVAILABLE' })
    expect(later).not.toHaveBeenCalled()
    expect(h.protection.auditHistory().state).toBe('unavailable')
  } finally {
    try { if (locked) blocker.exec('ROLLBACK') }
    finally { blocker.close() }
  }
})

it('does not perform file effects when the preceding connection admission cannot be recorded', async () => {
  const h = await fixture(), peer = await h.protection.resolveConnectionTarget('127.0.0.1', signal)
  const effect = vi.fn(async () => true)
  const blocker = new DatabaseSync(h.auditPath)
  let locked = false
  try {
    blocker.exec('BEGIN IMMEDIATE'); locked = true
    await expect(h.protection.auditRemoteFile(['ssh', 'fixture', '/not-started'], 'mutate', signal, async (bounded) => {
      await h.protection.checkConnection('127.0.0.1', 22, peer, 'endpoint', 'observe', bounded)
      return effect()
    })).rejects.toMatchObject({ code: 'unavailable' })
    expect(effect).not.toHaveBeenCalled()
  } finally {
    try { if (locked) blocker.exec('ROLLBACK') }
    finally { blocker.close() }
  }
})

it('keeps a withdrawn Session outcome out of its replacement', async () => {
  const h = await fixture(), id = SessionId('remote-replaced')
  const source = h.ctx.sessions.prepare(id), detach = h.ctx.sessions.enter(source)
  onTestFinished(detach)
  h.ctx.sessions.announce(source)
  const entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  onTestFinished(() => { release.resolve(undefined) })
  const request = h.protection.bindAuditSession(id)(() =>
    h.protection.auditRemoteFile(['ssh', 'fixture', '/pending'], 'observe', signal, async () => {
      entered.resolve(undefined); await release.promise; return 'completed'
    }))
  const rejected = expect(request).rejects.toMatchObject({ code: 'TARGET_AUDIT_UNCONFIRMED' })
  await entered.promise
  detach()
  const replacement = h.ctx.sessions.create(id)
  release.resolve(undefined)
  await rejected
  expect(h.protection.auditHistory().entries[0]).toMatchObject({ decision: 'cancelled', source: { sessionId: id } })
  expect(replacement.snapshotEvents()).toEqual([])
})

it('waits for the remote request outcome before closing its audit store during withdrawal', async () => {
  const h = await fixture(), entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  onTestFinished(() => { release.resolve(undefined) })
  const close = vi.spyOn(TargetAuditStore.prototype, 'close')
  const request = h.protection.auditRemoteFile(['ssh', 'fixture', '/pending'], 'observe', signal, async () => {
    entered.resolve(undefined); await release.promise; return 'completed'
  })
  const rejected = expect(request).rejects.toMatchObject({ code: 'TARGET_AUDIT_UNCONFIRMED' })
  await entered.promise
  const lifetime = h.protection.executionSignal()
  const aborted = new Promise<void>((resolve) => { lifetime.addEventListener('abort', () => { resolve() }, { once: true }) })
  const closing = h.owner.dispose()
  await aborted
  expect(close).not.toHaveBeenCalled()
  release.resolve(undefined)
  await rejected
  await closing
  expect(close).toHaveBeenCalledOnce()
  const stored = await TargetAuditStore.open(h.auditPath, 1000, 100)
  try { expect(stored.recent()).toMatchObject([{ operation: 'file', decision: 'cancelled', code: 'TARGET_CHECK_CANCELLED' }]) }
  finally { stored.close() }
})
