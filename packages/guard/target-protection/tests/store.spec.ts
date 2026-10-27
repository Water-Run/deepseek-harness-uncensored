/** Registry durability, cross-connection revision checks and refusal of unrelated or damaged data. @module */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { TargetRuleId } from '../src/types.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { TargetStore, SCHEMA_VERSION } from '../src/store.ts'

const stores: TargetStore[] = []
const roots: string[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function filename(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-target-store-')); roots.push(root)
  return join(root, 'targets.sqlite')
}
async function open(path: string): Promise<TargetStore> {
  const store = await TargetStore.open(path, 1000); stores.push(store); return store
}

it('defaults mainland protection on and preserves committed settings across reopen', async () => {
  const path = await filename()
  const store = await open(path)
  expect(store.snapshot()).toEqual({ revision: 1, preferences: { mainlandEnabled: true, rules: [] } })
  expect(store.configure({ mainlandEnabled: false, rules: [] }, 1).revision).toBe(2)
  store.close()
  expect((await open(path)).snapshot()).toEqual({ revision: 2, preferences: { mainlandEnabled: false, rules: [] } })
  expect(() => store.snapshot()).toThrow(expect.objectContaining({ code: 'unavailable' }))
})

it('rejects stale writes across two connections and retains the current revision', async () => {
  const path = await filename(), first = await open(path), second = await open(path)
  const before = second.snapshot()
  first.configure({ mainlandEnabled: false, rules: [] }, before.revision)
  expect(() => second.configure(before.preferences, before.revision)).toThrow(expect.objectContaining({ code: 'conflict' }))
  expect(second.snapshot()).toEqual(first.snapshot())
})

it('returns independently owned snapshots', async () => {
  const store = await open(await filename())
  const value = store.snapshot()
  value.preferences.mainlandEnabled = false
  expect(store.snapshot().preferences.mainlandEnabled).toBe(true)
})

it('refuses a newer schema without modifying the database file', async () => {
  const path = await filename(), store = await open(path)
  store.close()
  const db = new DatabaseSync(path)
  try { db.exec('PRAGMA user_version=99') } finally { db.close() }
  const before = await readFile(path)
  await expect(TargetStore.open(path, 1000)).rejects.toMatchObject({ code: 'unsupported-version' })
  expect(await readFile(path)).toEqual(before)
})

it('refuses an unrelated SQLite file without creating protection tables', async () => {
  const path = await filename()
  const db = new DatabaseSync(path)
  try { db.exec('CREATE TABLE personal_data (value TEXT); INSERT INTO personal_data VALUES (\'preserve\')') } finally { db.close() }
  const before = await readFile(path)
  await expect(TargetStore.open(path, 1000)).rejects.toMatchObject({ code: 'unrecognized-store' })
  expect(await readFile(path)).toEqual(before)
})

it('does not reset malformed settings or corrupt file bytes to defaults', async () => {
  const path = await filename(), store = await open(path)
  store.close()
  const db = new DatabaseSync(path)
  try { db.prepare('UPDATE preferences SET value=?').run('{broken') } finally { db.close() }
  const before = await readFile(path)
  await expect(TargetStore.open(path, 1000)).rejects.toMatchObject({ code: 'unavailable' })
  expect(await readFile(path)).toEqual(before)
  const corrupt = await filename()
  await writeFile(corrupt, 'not a database')
  await expect(TargetStore.open(corrupt, 1000)).rejects.toMatchObject({ code: 'unavailable' })
  expect(await readFile(corrupt, 'utf8')).toBe('not a database')
})

it('upgrades a version 1 registry atomically without changing its settings revision', async () => {
  const path = await filename(), store = await open(path)
  const saved = store.configure({ mainlandEnabled: false, rules: [] }, 1)
  store.close()
  const previous = new DatabaseSync(path)
  try { previous.exec('PRAGMA user_version=1') } finally { previous.close() }
  expect((await open(path)).snapshot()).toEqual(saved)
  const inspected = new DatabaseSync(path)
  try { expect(inspected.prepare('PRAGMA user_version').get()).toEqual({ user_version: SCHEMA_VERSION }) }
  finally { inspected.close() }
})

it('upgrades version 2 path rules and preserves one policy with aliases across reopening', async () => {
  const path = await filename(), store = await open(path)
  const resource = { id: brandString<TargetRuleId>(randomUUID()), name: 'production data', enabled: true,
    kind: 'database' as const, environment: 'production' as const, protection: 'full' as const,
    match: 'path' as const, address: join(path, '..', 'production.sqlite') }
  const saved = store.configure({ mainlandEnabled: false, rules: [resource] }, 1)
  store.close()
  const old = new DatabaseSync(path)
  try { old.exec('PRAGMA user_version=2') } finally { old.close() }
  const next = await open(path)
  expect(next.snapshot()).toEqual(saved)
  const successor = next.configure({ mainlandEnabled: false,
    rules: [{ ...resource, aliases: [{ match: 'host', address: 'production.test', port: 5432, database: 'production' }] }] }, saved.revision)
  next.close()
  expect((await open(path)).snapshot()).toEqual(successor)
})

it('refuses aliases in a registry marked as version 2 without changing the file', async () => {
  const path = await filename(), store = await open(path)
  store.configure({ mainlandEnabled: false, rules: [{ id: brandString<TargetRuleId>(randomUUID()), name: 'new resource', enabled: true,
    kind: 'server', environment: 'production', protection: 'full', match: 'host', address: '192.0.2.10',
    aliases: [{ match: 'host', address: '192.0.2.20' }] }] }, 1)
  store.close()
  const old = new DatabaseSync(path)
  try { old.exec('PRAGMA user_version=2') } finally { old.close() }
  const before = await readFile(path)
  await expect(TargetStore.open(path, 1000)).rejects.toMatchObject({ code: 'unavailable' })
  expect(await readFile(path)).toEqual(before)
})

it('refuses metadata replaced by another connection after the registry was opened', async () => {
  const path = await filename(), store = await open(path)
  const snapshot = store.snapshot()
  const external = new DatabaseSync(path)
  try {
    external.exec('PRAGMA user_version=99')
    expect(() => store.snapshot()).toThrow(expect.objectContaining({ code: 'unsupported-version' }))
    expect(() => store.configure(snapshot.preferences, snapshot.revision)).toThrow(expect.objectContaining({ code: 'unsupported-version' }))
    external.exec(`PRAGMA user_version=${String(SCHEMA_VERSION)}; PRAGMA application_id=0`)
    expect(() => store.snapshot()).toThrow(expect.objectContaining({ code: 'unrecognized-store' }))
  } finally { external.close() }
})

it('reads format metadata and preferences from one SQLite snapshot', async () => {
  const path = await filename(), store = await open(path), before = store.snapshot()
  const external = new DatabaseSync(path, { timeout: 1 })
  let armed = true, blocked: unknown
  // oxlint-disable-next-line typescript/unbound-method -- The spy forwards with its original DatabaseSync receiver.
  const originalPrepare = DatabaseSync.prototype.prepare
  vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (this: DatabaseSync, sql) {
    const statement = originalPrepare.call(this, sql)
    if (sql === 'PRAGMA user_version' && armed) {
      const get = statement.get.bind(statement)
      vi.spyOn(statement, 'get').mockImplementation(() => {
        const value = get()
        armed = false
        try { external.exec('PRAGMA user_version=99') }
        catch (error) { blocked = error }
        return value
      })
    }
    return statement
  })
  try {
    expect(store.snapshot()).toEqual(before)
    expect(blocked).toBeInstanceOf(Error)
    external.exec('PRAGMA user_version=99')
    expect(() => store.snapshot()).toThrow(expect.objectContaining({ code: 'unsupported-version' }))
  } finally { external.close() }
})

it('reports an owned lock without writing and remains usable after the lock is released', async () => {
  const path = await filename(), store = await TargetStore.open(path, 1)
  stores.push(store)
  const before = store.snapshot(), external = new DatabaseSync(path)
  try {
    external.exec('BEGIN IMMEDIATE')
    expect(() => store.configure({ mainlandEnabled: false, rules: [] }, before.revision))
      .toThrow(expect.objectContaining({ code: 'busy' }))
    expect(store.snapshot()).toEqual(before)
    external.exec('ROLLBACK')
    expect(store.configure({ mainlandEnabled: false, rules: [] }, before.revision).revision).toBe(before.revision + 1)
  } finally { external.close() }
})
