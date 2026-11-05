/** Admission audit persistence and failure behavior against real files and endpoints. @module */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import Web from '@deepseek-ai/dsh-web'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, onTestFinished } from 'vitest'
import Protection from '../src/index.ts'
import Files from '../src/fs.ts'
import * as Http from '../src/http.ts'
import type { TargetRuleId } from '../src/types.ts'

async function fixture(limit = 10) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-target-audit-')), ctx = new Context()
  const auditPath = join(root, 'audit.sqlite'), path = join(root, 'rules.sqlite')
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  })
  const config = { path, auditPath, auditLimit: limit, hostsFile: '', busyTimeoutMs: 10 }
  const owner = await ctx.plugin(Protection, config)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: root })
  await ctx.plugin(Files, { cwd: root })
  return { ctx, root, auditPath, config, owner }
}

it('persists exact revisions, redacts targets and records a production denial before TCP', async () => {
  const h = await fixture()
  const listener = createServer()
  let connections = 0
  listener.on('connection', (socket) => { connections++; socket.destroy() })
  onTestFinished(async () => {
    if (listener.listening) await new Promise<void>((resolve) => { listener.close(() => { resolve() }) })
  })
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
  const address = listener.address()
  if (address === null || typeof address === 'string') throw new Error('Missing audit listener')
  const ruleId = brandString<TargetRuleId>('b7777777-7777-4777-8777-777777777777')
  const file = join(h.root, 'private-bearer.txt')
  const target = await h.ctx.fs.resolve(file)
  await h.ctx.fs.writeText(target, 'fixture')
  expect(await readFile(file, 'utf8')).toBe('fixture')
  const allowed = h.ctx.targetProtection.auditHistory().entries.find(entry => entry.operation === 'file' && entry.effect === 'mutate')
  expect(allowed).toMatchObject({ revision: 1, decision: 'allow', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u) })
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{ id: ruleId, name: 'private fixture', enabled: true,
    kind: 'server', environment: 'production', protection: 'full', match: 'host', address: '127.0.0.1', port: address.port }] }, 1)
  await h.ctx.plugin(Web)
  await h.ctx.plugin(Http)
  const url = `http://127.0.0.1:${address.port}/private?key=never-store-this`
  await expect(h.ctx.web.fetch({ url })).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(connections).toBe(0)
  const original = h.ctx.targetProtection.auditHistory()
  expect(original.entries[0]).toMatchObject({ revision: 2, phase: 'preflight', operation: 'http',
    decision: 'deny', code: 'TARGET_FULLY_PROTECTED', ruleIds: [ruleId] })
  expect(JSON.stringify(original)).not.toMatch(/private|never-store|127\.0\.0\.1/u)
  await h.owner.dispose()
  await h.ctx.plugin(Protection, h.config)
  expect(h.ctx.targetProtection.auditHistory()).toEqual(original)
  const unlock = h.ctx.targetProtection.retainSnapshot(2)
  try { await h.ctx.targetProtection.checkLocalFile(file, 'mutate', new AbortController().signal) }
  finally { unlock() }
  expect(h.ctx.targetProtection.auditHistory().entries[0]).toMatchObject({ revision: 2, fingerprint: allowed?.fingerprint })
})

it('bounds retention and blocks newly allowed effects if the audit writer is unavailable', async () => {
  const h = await fixture(3), signal = new AbortController().signal
  await expect(h.ctx.targetProtection.checkLocalFile(join(h.root, 'cancelled.txt'), 'metadata', AbortSignal.abort())).rejects.toBeDefined()
  expect(h.ctx.targetProtection.auditHistory().entries[0]).toMatchObject({
    decision: 'cancelled', code: 'TARGET_CHECK_CANCELLED', revision: null,
  })
  for (let index = 0; index < 5; index++) await h.ctx.targetProtection.checkLocalFile(join(h.root, `file-${index}`), 'metadata', signal)
  expect(h.ctx.targetProtection.auditHistory().entries).toHaveLength(3)
  const file = join(h.root, 'cannot-publish.txt'), target = await h.ctx.fs.resolve(file)
  const writer = new DatabaseSync(h.auditPath)
  writer.exec('BEGIN IMMEDIATE')
  try {
    await expect(h.ctx.fs.writeText(target, 'must not be written')).rejects.toMatchObject({ code: 'unavailable' })
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { writer.exec('ROLLBACK'); writer.close() }
  expect(h.ctx.targetProtection.auditHistory()).toMatchObject({ state: 'unavailable' })
  await expect(h.ctx.targetProtection.checkLocalFile(file, 'metadata', signal)).rejects.toMatchObject({ code: 'unavailable' })
})

it('upgrades a version-one audit store without replacing its records or target fingerprints', async () => {
  const h = await fixture()
  await h.ctx.targetProtection.checkLocalFile(join(h.root, 'historical'), 'metadata', new AbortController().signal)
  const original = h.ctx.targetProtection.auditHistory()
  await h.owner.dispose()
  const legacy = new DatabaseSync(h.auditPath)
  try { legacy.exec('PRAGMA user_version=1') }
  finally { legacy.close() }
  const upgraded = await h.ctx.plugin(Protection, h.config)
  expect(h.ctx.targetProtection.auditHistory()).toEqual(original)
  await upgraded.dispose()
  const inspect = new DatabaseSync(h.auditPath, { readOnly: true })
  try { expect(inspect.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 2 }) }
  finally { inspect.close() }
})
