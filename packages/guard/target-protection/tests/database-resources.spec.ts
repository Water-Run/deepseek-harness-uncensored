/** Central database associations preserve policy, scope and durable resource identity. @module */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import Protection from '../src/index.ts'
import { projectDatabaseResources } from '../src/database-resources.ts'
import type { TargetRule, TargetRuleId } from '../src/types.ts'

const id = brandString<TargetRuleId>('00000000-0000-4000-8000-000000000001')
const otherId = brandString<TargetRuleId>('00000000-0000-4000-8000-000000000002')
const endpoint = { ruleId: id, hostname: '127.0.0.1', port: 5432, database: 'production' }
const signal = new AbortController().signal

async function setup(protection: 'full' | 'audit') {
  const root = await mkdtemp(join(tmpdir(), 'dshu-db-resource-')), ctx = new Context()
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally { await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }) }
  })
  await ctx.plugin(Protection, { path: ':memory:', auditPath: join(root, 'audit.sqlite'), hostsFile: '' })
  const before = await ctx.targetProtection.snapshot()
  const rule: TargetRule = { id, name: 'central database', enabled: true, kind: 'database', match: 'path',
    address: join(root, 'owner-database.sqlite'), environment: 'production', protection }
  const snapshot = await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [rule] }, before.revision)
  const resolution = await ctx.targetProtection.resolveConnectionTarget(endpoint.hostname, signal)
  const check = (effect: 'observe' | 'mutate', database = endpoint.database) =>
    ctx.targetProtection.checkConnection(endpoint.hostname, endpoint.port, resolution, 'database', effect, signal, database, false, [endpoint])
  return { ctx, rule, snapshot, check, resolution }
}

it.each(['full', 'audit'] as const)('applies mapped %s policy and records its stable resource ID', async (level) => {
  const h = await setup(level)
  expect(await h.check('observe')).toMatchObject(level === 'full'
    ? { allowed: false, code: 'TARGET_FULLY_PROTECTED', ruleIds: [id] } : { allowed: true, ruleIds: [id] })
  expect(await h.check('mutate')).toMatchObject({ allowed: false, code: level === 'full' ? 'TARGET_FULLY_PROTECTED' : 'TARGET_READ_ONLY', ruleIds: [id] })
  const records = h.ctx.targetProtection.auditHistory().entries.filter(entry => entry.operation === 'connection')
  expect(records).toHaveLength(2)
  expect(records.every(entry => entry.ruleIds.length === 1 && entry.ruleIds[0] === id)).toBe(true)
  expect(await h.ctx.targetProtection.snapshot()).toEqual(h.snapshot)
})

it('keeps original selectors and deduplicates repeated endpoint associations without persisting them', async () => {
  const h = await setup('full'), original = structuredClone(h.snapshot)
  const mapped = projectDatabaseResources(h.snapshot, [endpoint, endpoint, { ...endpoint, database: 'second' }])
  expect(mapped.revision).toBe(h.snapshot.revision)
  expect(mapped.preferences.rules[0]).toMatchObject({ ...h.rule, aliases: [
    { match: 'host', address: endpoint.hostname, port: endpoint.port, database: endpoint.database },
    { match: 'host', address: endpoint.hostname, port: endpoint.port, database: 'second' },
  ] })
  expect(projectDatabaseResources(mapped, [endpoint])).toEqual(mapped)
  expect(projectDatabaseResources(h.snapshot, [])).toBe(h.snapshot)
  expect(h.snapshot).toEqual(original)
})

it('keeps a different database outside the mapped production scope and gives production priority over a test alias', async () => {
  const h = await setup('full')
  expect(await h.check('mutate', 'testing')).toMatchObject({ allowed: true, ruleIds: [] })
  await h.ctx.targetProtection.configure({ ...h.snapshot.preferences, rules: [...h.snapshot.preferences.rules,
    { ...h.rule, id: otherId, match: 'host', address: endpoint.hostname, port: endpoint.port, database: endpoint.database, environment: 'test' },
  ] }, h.snapshot.revision)
  expect(await h.check('mutate')).toMatchObject({ allowed: false, code: 'TARGET_FULLY_PROTECTED', ruleIds: [id] })
})

it('rechecks changed and disabled policies and rejects a deleted resource instead of forgetting its association', async () => {
  const h = await setup('full')
  let current = await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{ ...h.rule, protection: 'audit' }] }, h.snapshot.revision)
  expect(await h.check('observe')).toMatchObject({ allowed: true, ruleIds: [id] })
  current = await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{ ...h.rule, enabled: false }] }, current.revision)
  expect(await h.check('mutate')).toMatchObject({ allowed: true, ruleIds: [] })
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, current.revision)
  await expect(h.check('observe')).rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
})

it('rejects references to domain resources even when they are disabled', async () => {
  const h = await setup('full')
  expect(() => projectDatabaseResources({ ...h.snapshot, preferences: { ...h.snapshot.preferences,
    rules: [{ ...h.rule, kind: 'domain', match: 'host', address: 'example.test', enabled: false }] } }, [endpoint]))
    .toThrow(expect.objectContaining({ code: 'TARGET_IDENTITY_UNVERIFIED' }))
})

it.each(['full', 'audit'] as const)('keeps mapped server %s policy across every database on the endpoint', async (level) => {
  const h = await setup(level)
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{ ...h.rule, kind: 'server' }] }, h.snapshot.revision)
  expect(await h.check('observe', 'another_database')).toMatchObject(level === 'full'
    ? { allowed: false, code: 'TARGET_FULLY_PROTECTED', ruleIds: [id] } : { allowed: true, ruleIds: [id] })
  expect(await h.check('mutate', 'another_database')).toMatchObject({ allowed: false,
    code: level === 'full' ? 'TARGET_FULLY_PROTECTED' : 'TARGET_READ_ONLY', ruleIds: [id] })
})

it('refuses unassociated native database requests while a production path has no known endpoint', async () => {
  const h = await setup('full')
  expect(await h.ctx.targetProtection.checkConnection(endpoint.hostname, endpoint.port, undefined,
    'database', 'observe', signal, endpoint.database)).toMatchObject({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: [id] })
  expect(() => h.ctx.targetProtection.checkConnection(endpoint.hostname, endpoint.port, undefined,
    'endpoint', 'observe', signal, endpoint.database, false, [endpoint])).toThrow(expect.objectContaining({ code: 'invalid' }))
})

it('uses existing network aliases without requiring another resource association', async () => {
  const h = await setup('full')
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{ ...h.rule,
    aliases: [{ match: 'host', address: endpoint.hostname, port: endpoint.port, database: endpoint.database }],
  }] }, h.snapshot.revision)
  expect(await h.ctx.targetProtection.checkConnection(endpoint.hostname, endpoint.port, h.resolution,
    'database', 'observe', signal, endpoint.database)).toMatchObject({ allowed: false, code: 'TARGET_FULLY_PROTECTED', ruleIds: [id] })
})
