/** Real SQL engine authorization, rollback, cancellation and owner revocation. @module */
import { Context } from '@deepseek-ai/cordis'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { expect, it, onTestFinished, vi } from 'vitest'
import Protection from '../src/index.ts'
import SqliteDatabase from '../src/sqlite.ts'
import type { TargetRuleId } from '../src/types.ts'
import { TargetStore } from '../src/store.ts'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as SqliteAgent from '../src/sqlite-agent.ts'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'

const supported = 'setAuthorizer' in DatabaseSync.prototype
async function harness(protection: 'full' | 'audit' | 'test' = 'test', limits = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-sqlite-'))
  const path = join(root, 'data.sqlite'), ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const db = new DatabaseSync(path)
  try { db.exec('CREATE TABLE data (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO data VALUES(1, \'keep\')') } finally { db.close() }
  const owner = await ctx.plugin(Protection, { path: join(root, 'rules.sqlite'), hostsFile: '' })
  const rule = { id: brandString<TargetRuleId>(randomUUID()), name: 'owned database', kind: 'database' as const,
    enabled: true, match: 'path' as const, address: path, environment: protection === 'test' ? 'test' as const : 'production' as const,
    protection: protection === 'audit' ? 'audit' as const : 'full' as const }
  await ctx.targetProtection.configure({ mainlandEnabled: true, rules: [rule] }, 1)
  await ctx.plugin(SqliteDatabase, { databases: [{ name: 'owned', path }], ...limits })
  const query = (sql: string, parameters: (string | number | null)[] = [], signal = new AbortController().signal) =>
    ctx.sqliteDatabase.execute('owned', { statements: [{ sql, parameters }] }, signal)
  const value = () => {
    const db = new DatabaseSync(path)
    try { return db.prepare('SELECT value FROM data WHERE id=1').get()?.['value'] } finally { db.close() }
  }
  return { ctx, root, path, owner, query, value, rule }
}

it.skipIf(!supported)('refuses full production before opening the SQL helper', async () => {
  const h = await harness('full'), before = await readFile(h.path)
  const spawn = vi.spyOn(LocalSubprocessRuntime.prototype, 'spawn')
  onTestFinished(() => { spawn.mockRestore() })
  await expect(h.query('SELECT * FROM data')).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(await readFile(h.path)).toEqual(before)
  expect(spawn).not.toHaveBeenCalled()
})

it.skipIf(!supported)('audit reads real rows and rejects a disguised write without changing the database', async () => {
  const h = await harness('audit'), before = await readFile(h.path)
  expect((await h.query('SELECT * FROM data'))[0]?.rows).toEqual([[1, 'keep']])
  await expect(h.query('/* read? */ WITH sample AS (SELECT 1) UPDATE data SET value=\'changed\''))
    .rejects.toMatchObject({ code: 'SQLITE_READ_ONLY' })
  expect(h.value()).toBe('keep'); expect(await readFile(h.path)).toEqual(before)
})

it.skipIf(!supported)('audits an existing WAL database while preserving its committed data and WAL', async () => {
  const h = await harness('audit'), writer = new DatabaseSync(h.path)
  try {
    writer.exec("PRAGMA journal_mode=WAL; UPDATE data SET value='wal evidence'")
    const main = await readFile(h.path), wal = await readFile(`${h.path}-wal`)
    expect((await h.query('SELECT value FROM data'))[0]?.rows).toEqual([['wal evidence']])
    await expect(h.query("UPDATE data SET value='denied'")).rejects.toMatchObject({ code: 'SQLITE_READ_ONLY' })
    expect(await readFile(h.path)).toEqual(main)
    expect(await readFile(`${h.path}-wal`)).toEqual(wal)
  } finally { writer.close() }
})

it.skipIf(!supported)('commits parameterized test writes and rolls the entire batch back on error', async () => {
  const h = await harness()
  await h.query('UPDATE data SET value=? WHERE id=?', ['changed', 1])
  expect(h.value()).toBe('changed')
  await expect(h.ctx.sqliteDatabase.execute('owned', { statements: [
    { sql: 'UPDATE data SET value=\'partial\'' }, { sql: 'SELECT * FROM missing_table' },
  ] }, new AbortController().signal)).rejects.toMatchObject({ code: 'SQLITE_QUERY_REFUSED' })
  expect(h.value()).toBe('changed')
})

it.skipIf(!supported).each([
  "ATTACH DATABASE '/not-an-authorized-database' AS other", 'COMMIT', 'ROLLBACK', 'SAVEPOINT owned',
  'PRAGMA journal_mode=OFF', 'PRAGMA writable_schema=1', "SELECT load_extension('missing')",
])('blocks cross-file, transaction and unsafe engine control: %s', async (sql) => {
  const h = await harness()
  await expect(h.query(sql)).rejects.toMatchObject({ code: 'SQLITE_OPERATION_UNSUPPORTED' })
  expect(h.value()).toBe('keep')
})

it.skipIf(!supported)('enforces complete result bounds and rejects silently ignored SQL tails', async () => {
  const h = await harness('test', { maxRows: 1 })
  await expect(h.query('SELECT 1 UNION ALL SELECT 2')).rejects.toMatchObject({ code: 'SQLITE_OUTPUT_LIMIT' })
  await expect(h.query('UPDATE data SET value=\'bad\'; SELECT 1')).rejects.toMatchObject({ code: 'SQLITE_MULTIPLE_STATEMENTS' })
  expect(h.value()).toBe('keep')
  await expect(h.query("INSERT INTO data VALUES(2,'a'),(3,'b') RETURNING id")).rejects.toMatchObject({ code: 'SQLITE_OUTPUT_LIMIT' })
  expect((await h.query('SELECT count(*) FROM data'))[0]?.rows).toEqual([[1]])
})

it.skipIf(!supported)('refuses attachment of a production database from a writable test binding', async () => {
  const h = await harness(), productionPath = join(h.root, 'production.sqlite')
  const production = new DatabaseSync(productionPath)
  try { production.exec("CREATE TABLE data(value TEXT); INSERT INTO data VALUES('preserve')") } finally { production.close() }
  const before = await h.ctx.targetProtection.snapshot()
  await h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [h.rule, { ...h.rule,
    id: brandString<TargetRuleId>(randomUUID()), address: productionPath, environment: 'production', protection: 'full' }] }, before.revision)
  const outcome = h.ctx.sqliteDatabase.execute('owned', { statements: [
    { sql: 'ATTACH DATABASE ? AS other', parameters: [productionPath] },
    { sql: "UPDATE other.data SET value='changed'" },
  ] }, new AbortController().signal).then(() => 'allowed', (error: unknown) => {
    if (error instanceof Error && 'code' in error) return error.code
    throw error
  })
  const decision = await outcome
  const verify = new DatabaseSync(productionPath, { readOnly: true })
  try { expect({ decision, value: verify.prepare('SELECT value FROM data').get()?.['value'] })
    .toEqual({ decision: 'SQLITE_OPERATION_UNSUPPORTED', value: 'preserve' }) } finally { verify.close() }
})

it.skipIf(!supported)('rolls back when another connection changes rules after SQL execution', async () => {
  const h = await harness()
  const other = await TargetStore.open(join(h.root, 'rules.sqlite'), 20)
  onTestFinished(() => { other.close() })
  const original = h.ctx.targetProtection.checkLocalFile.bind(h.ctx.targetProtection)
  let checks = 0
  const spy = vi.spyOn(h.ctx.targetProtection, 'checkLocalFile').mockImplementation(async (...args) => {
    if (++checks === 9) {
      const current = other.snapshot()
      other.configure({ mainlandEnabled: true, rules: [{ ...h.rule, environment: 'production', protection: 'full' }] }, current.revision)
    }
    return original(...args)
  })
  onTestFinished(() => { spy.mockRestore() })
  await expect(h.query('UPDATE data SET value=\'bad\'' )).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.value()).toBe('keep')
})

it.skipIf(!supported)('bounds helper startup plus execution and releases its SQLite lock on timeout', async () => {
  const h = await harness('test', { timeoutMs: 1000 })
  await expect(h.query('WITH RECURSIVE r(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM r) SELECT max(x) FROM r'))
    .rejects.toMatchObject({ code: 'SQLITE_TIMEOUT' })
  expect(h.value()).toBe('keep')
  const verify = new DatabaseSync(h.path)
  try { verify.exec("UPDATE data SET value='after timeout'") } finally { verify.close() }
  expect(h.value()).toBe('after timeout')
})

it.skipIf(!supported)('cancels a recursive native query only after the helper confirms execution began', async () => {
  const h = await harness()
  const executing: PromiseWithResolvers<void> = Promise.withResolvers()
  // oxlint-disable-next-line typescript/unbound-method -- the spy forwards its actual service receiver with call().
  const original = LocalSubprocessRuntime.prototype.spawn
  const spy = vi.spyOn(LocalSubprocessRuntime.prototype, 'spawn').mockImplementation(function (this: LocalSubprocessRuntime, spec) {
    const handle = original.call(this, spec)
    let observed = ''
    handle.stdout?.on('data', (chunk: Buffer) => {
      observed += chunk.toString('utf8')
      if (observed.includes('"phase":"executing"')) executing.resolve()
    })
    return handle
  })
  onTestFinished(() => { spy.mockRestore() })
  const abort = new AbortController()
  const request = h.query('WITH RECURSIVE r(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM r) SELECT max(x) FROM r', [], abort.signal)
  const stopped = request.catch((error: unknown) => error)
  await Promise.race([executing.promise, request.then(() => { throw new Error('Query ended before execution was observed') })])
  abort.abort(new Error('owned cancellation'))
  expect(await stopped).toMatchObject({ code: 'SQLITE_CANCELLED' })
  await h.query("UPDATE data SET value='after cancellation'")
  expect(h.value()).toBe('after cancellation')
})

it.skipIf(!supported)('withdraws the executor when mandatory protection is removed', async () => {
  const h = await harness(), stale = h.ctx.sqliteDatabase
  await h.owner.dispose()
  expect(h.ctx.get('sqliteDatabase')).toBeUndefined()
  await expect(stale.execute('owned', { statements: [{ sql: 'SELECT 1' }] }, new AbortController().signal)).rejects.toBeDefined()
})

it.skipIf(!supported)('preserves native SQLite functions, full-text search and lossless output values', async () => {
  const h = await harness()
  expect((await h.query("SELECT 9007199254740993, x'00ff', 1 AS duplicate, 2 AS duplicate"))[0]?.rows)
    .toEqual([[{ integer: '9007199254740993' }, { blob: 'AP8=' }, 1, 2]])
  expect((await h.query('SELECT 1e999, -1e999'))[0]?.rows).toEqual([[{ real: 'Infinity' }, { real: '-Infinity' }]])
  await h.query('CREATE VIRTUAL TABLE docs USING fts5(body)')
  await h.query("INSERT INTO docs VALUES('native search')")
  expect((await h.query("SELECT body FROM docs WHERE docs MATCH 'search'"))[0]?.rows).toEqual([['native search']])
})

it.skipIf(!supported)('keeps conversation read-only permissions narrower than a writable test database', async () => {
  const h = await harness()
  await h.ctx.plugin(SystemPrompt); await h.ctx.plugin(ToolRuntime)
  await h.ctx.plugin(SessionProjections)
  await h.ctx.plugin(SandboxPolicy, { mode: 'read-only', workspaceRoot: h.root })
  await h.ctx.plugin(SqliteAgent)
  const call = (sql: string) => h.ctx.tools.execute({ name: 'database_query', arguments: { database: 'owned', sql },
    callId: ToolCallId(randomUUID()), signal: new AbortController().signal })
  const read = await call('SELECT * FROM data')
  expect(read.isError, JSON.stringify(read)).toBe(false)
  expect((await call("UPDATE data SET value='not permitted'")).isError).toBe(true)
  expect(h.value()).toBe('keep')
})
