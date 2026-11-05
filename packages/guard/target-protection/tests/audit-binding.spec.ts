/** Queued admission ownership, Session replacement and scope teardown. @module */
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import Protection from '../src/index.ts'
import * as Identity from '../src/file-identity.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-audit-binding-')), ctx = new Context()
  const cleanup: (() => void)[] = []
  onTestFinished(async () => {
    for (const release of cleanup) release()
    await ctx.fiber.dispose()
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  })
  await ctx.plugin(SessionStore)
  const owner = await ctx.plugin(Protection, { path: ':memory:', auditPath: join(root, 'audit.sqlite'), hostsFile: '' })
  return { root, ctx, owner, protection: ctx.targetProtection, cleanup }
}

it('keeps queued concurrent requests bound to their exact Sessions without an initiating Agent', async () => {
  const h = await fixture(), a = h.ctx.sessions.create(SessionId('queued-main'))
  const b = h.ctx.sessions.create(SessionId('queued-side'), { meta: { parentSession: a.id } })
  const runA = h.protection.bindAuditSession(a.id), runB = h.protection.bindAuditSession(b.id)
  const entered = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  h.cleanup.push(() => { release.resolve(true) })
  let active = 0
  const inspect = async () => {
    if (++active === 2) entered.resolve(true)
    await release.promise
    return h.protection.checkLocalFile(join(h.root, 'target'), 'metadata', new AbortController().signal)
  }
  const requests = Promise.all([runA(inspect), runB(inspect)])
  await entered.promise
  release.resolve(true)
  await requests
  const records = h.protection.auditHistory().entries
  expect(records).toHaveLength(2)
  for (const session of [a, b]) {
    expect(session.snapshotEvents().filter(event => event.type === 'target/admission').map(event => event.data))
      .toEqual([records.find(entry => entry.source?.sessionId === session.id)])
  }
  expect(records.find(entry => entry.source?.sessionId === b.id)?.source?.parentSessionId).toBe(a.id)
  await h.protection.bindAuditSession(undefined)(() => inspect())
  expect(h.protection.auditHistory().entries[0]).not.toHaveProperty('source')
  expect(() => h.protection.bindAuditSession(SessionId('not-present'))).toThrow(expect.objectContaining({ code: 'unavailable' }))
})

it('rejects a closed binding and cancels a pending admission without poisoning unrelated audit writes', async () => {
  const h = await fixture(), id = SessionId('replaced-owner')
  const source = h.ctx.sessions.prepare(id), detach = h.ctx.sessions.enter(source)
  h.cleanup.push(detach)
  h.ctx.sessions.announce(source)
  const run = h.protection.bindAuditSession(id), path = join(h.root, 'pending')
  const entered = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  h.cleanup.push(() => { release.resolve(true) })
  const resolve = Identity.resolveLocalPathIdentity
  vi.spyOn(Identity, 'resolveLocalPathIdentity').mockImplementation(async (...args) => {
    if (args[0] === path) { entered.resolve(true); await release.promise }
    return resolve(...args)
  })
  const request = run(() => h.protection.checkLocalFile(path, 'metadata', new AbortController().signal))
  const rejected = expect(request).rejects.toMatchObject({ code: 'unavailable' })
  await entered.promise
  detach()
  const replacement = h.ctx.sessions.create(id)
  release.resolve(true)
  await rejected
  expect(h.protection.auditHistory()).toMatchObject({ state: 'ready', entries: [{
    decision: 'cancelled', code: 'TARGET_CHECK_CANCELLED', source: { sessionId: id },
  }] })
  expect(replacement.snapshotEvents()).toEqual([])
  const action = vi.fn(async () => true)
  await expect(run(action)).rejects.toMatchObject({ code: 'unavailable' })
  expect(action).not.toHaveBeenCalled()
  await h.protection.bindAuditSession(id)(() =>
    h.protection.checkLocalFile(join(h.root, 'replacement'), 'metadata', new AbortController().signal))
  expect(h.protection.auditHistory().state).toBe('ready')
  expect(replacement.snapshotEvents().filter(event => event.type === 'target/admission')).toHaveLength(1)
})

it('retains audit storage through the complete bound request cleanup during withdrawal', async () => {
  const h = await fixture(), session = h.ctx.sessions.create(SessionId('queued-cleanup'))
  const entered = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  h.cleanup.push(() => { release.resolve(true) })
  const lifetime = h.protection.executionSignal()
  const aborted = new Promise<void>((accept) => { lifetime.addEventListener('abort', () => { accept() }, { once: true }) })
  const request = h.protection.bindAuditSession(session.id)(async () => {
    await h.protection.checkLocalFile(join(h.root, 'target'), 'metadata', new AbortController().signal)
    entered.resolve(true)
    await release.promise
    expect(h.protection.auditHistory().state).toBe('ready')
    return true
  })
  await entered.promise
  let closed = false
  const closing = h.owner.dispose().then(() => { closed = true })
  await aborted
  expect(closed).toBe(false)
  release.resolve(true)
  expect(await request).toBe(true)
  await closing
  expect(closed).toBe(true)
})
