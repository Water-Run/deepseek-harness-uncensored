/** Private fixture bindings for real database_query Session replay. @module */
import { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import Protection from '../src/index.ts'
import SqliteDatabase from '../src/sqlite.ts'
import * as SqliteAgent from '../src/sqlite-agent.ts'

/** Cordis fixture name. */
export const name = 'sqlite-snapshot-fixture'
/** Shared shipped tool and permission services remain in use. */
export const inject = ['tools', 'sandboxPolicy']
/** Optional injected release failure for the confirmed-commit scenario. */
export const Config = schema.object({ failCleanup: schema.boolean().default(false) })

class CleanupFailure extends Protection {
  override retainSnapshot(revision: number): () => void {
    const release = super.retainSnapshot(revision)
    return () => { release(); throw new Error('owned fixture release failure') }
  }
}

/** @param ctx - Dedicated scenario owner. @param config - Explicit fixture failure selection. */
export async function apply(ctx: Context, config: { failCleanup: boolean }): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-sqlite-snapshot-')), path = join(root, 'data.sqlite')
  let closeExecution = (): Promise<void> => Promise.resolve()
  ctx.effect(() => async () => { await closeExecution(); await rm(root, { recursive: true, force: true }) }, 'sqlite-snapshot.files')
  const db = new DatabaseSync(path)
  try { db.exec("CREATE TABLE data(value TEXT); INSERT INTO data VALUES('keep')") } finally { db.close() }
  await ctx.plugin(config.failCleanup ? CleanupFailure : Protection, { path: ':memory:', hostsFile: '' })
  const executor = await ctx.plugin(SqliteDatabase, { databases: [{ name: 'owned', path }] })
  closeExecution = () => executor.dispose()
  await ctx.plugin(SqliteAgent)
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_database_effect', description: 'Verify that the owned SQLite fixture committed its expected value.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute() {
      const db = new DatabaseSync(path, { readOnly: true })
      try { assert.equal(db.prepare('SELECT value FROM data').get()?.['value'], 'verified') } finally { db.close() }
      return Promise.resolve('Committed value independently verified.')
    },
  })))
}
