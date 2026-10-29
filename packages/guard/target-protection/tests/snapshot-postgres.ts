/** Owned loopback endpoint for the real database_inspect Session refusal. @module */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import Protection from '../src/index.ts'
import PostgresAudit from '../src/postgres.ts'
import * as PostgresAgent from '../src/postgres-agent.ts'
import type { TargetRuleId } from '../src/types.ts'

/** Cordis fixture name. */
export const name = 'postgres-protection-snapshot'
/** Use the shipped tool registry and credential provider. */
export const inject = ['tools']

/** @param ctx - Dedicated snapshot owner. */
export async function apply(ctx: Context): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-postgres-snapshot-'))
  ctx.effect(() => () => rm(root, { recursive: true, force: true }), 'postgres-snapshot.files')
  await ctx.plugin(Credentials, { path: join(root, 'credentials.yaml'), dshHome: root, watch: false })
  let connections = 0
  const server = createServer((socket) => { connections++; socket.destroy() })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  let closeExecutor = (): Promise<void> => Promise.resolve()
  ctx.effect(() => async () => {
    await closeExecutor()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve() })
    })
  }, 'postgres-snapshot.listener')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  await ctx.inject(['targetProtection'], async (owner) => {
    await owner.targetProtection.configure({ mainlandEnabled: false, rules: [{
      id: brandString<TargetRuleId>('74444444-4444-4444-8444-444444444444'),
      name: 'owned production fixture', enabled: true, kind: 'database', environment: 'production',
      protection: 'full', match: 'host', address: '127.0.0.1', port: address.port, database: 'fixture',
    }] }, 1)
  })
  const executor = await ctx.plugin(PostgresAudit, { databases: [{ name: 'owned', hostname: '127.0.0.1', port: address.port,
    database: 'fixture', username: 'fixture', passwordRef: 'MISSING_POSTGRES_FIXTURE_PASSWORD' }] })
  closeExecutor = () => executor.dispose()
  await ctx.plugin(PostgresAgent)
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_postgres_transport', description: 'Verify that the owned PostgreSQL listener received no connection.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute() {
      assert.equal(connections, 0)
      return Promise.resolve('Protected PostgreSQL listener received zero connections.')
    },
  })))
}
