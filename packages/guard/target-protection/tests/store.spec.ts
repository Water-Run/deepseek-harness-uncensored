/** Registry durability, cross-connection revision checks and refusal of unrelated or damaged data. @module */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { TargetStore } from '../src/store.ts'

const stores: TargetStore[] = []
const roots: string[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
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
