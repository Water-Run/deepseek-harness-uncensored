/** MySQL refuses protected identities before connecting or resolving credentials. */
import { Context } from '@deepseek-ai/cordis'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createServer, type Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, onTestFinished } from 'vitest'
import TargetProtection from '../src/index.ts'
import MysqlAudit from '../src/mysql.ts'
import type { TargetRuleId } from '../src/types.ts'

async function fixture(holdHandshake = false) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-mysql-policy-'))
  const ctx = new Context()
  const sockets = new Set<Socket>()
  const accepted = Promise.withResolvers<undefined>()
  const closed = Promise.withResolvers<undefined>()
  let connections = 0
  const server = createServer((socket) => {
    connections++
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket); closed.resolve(undefined) })
    accepted.resolve(undefined)
    if (!holdHandshake) socket.destroy()
  })
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally {
      for (const socket of sockets) socket.destroy()
      try {
        if (server.listening) await new Promise<void>((resolve, reject) => {
          server.close((error) => { if (error) reject(error); else resolve() })
        })
      } finally { await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }) }
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const endpoint = server.address()
  if (endpoint === null || typeof endpoint === 'string') throw new Error('Missing fixture listener')
  await ctx.plugin(Credentials, { path: join(root, 'credentials.yml'), dshHome: root, watch: false })
  const owner = await ctx.plugin(TargetProtection, { path: ':memory:', hostsFile: '' })
  const binding = { name: 'owned', hostname: '127.0.0.1', tlsServerName: 'mysql.fixture.test', port: endpoint.port,
    database: 'fixture', username: 'audit', accountHost: '%', passwordRef: 'DSHU_FIXTURE_MYSQL' }
  const rule = (address: string) => ({ id: brandString<TargetRuleId>(randomUUID()), name: 'owned production fixture', enabled: true,
    kind: 'database' as const, match: 'host' as const, address, port: endpoint.port, database: 'fixture',
    environment: 'production' as const, protection: 'full' as const })
  return { ctx, owner, binding, rule, accepted: accepted.promise, closed: closed.promise, connections: () => connections }
}

it.each(['127.0.0.1', 'mysql.fixture.test'])('rejects the protected %s identity before TCP', async (address) => {
  const { ctx, binding, rule, connections } = await fixture()
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [rule(address)] }, 1)
  await ctx.plugin(MysqlAudit, { databases: [binding] })
  await expect(ctx.mysqlAudit.inspect('owned', AbortSignal.timeout(5_000))).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(connections()).toBe(0)
})

it('refuses missing credentials and withdraws when the rule owner is disposed', async () => {
  const { ctx, owner, binding, connections } = await fixture()
  await ctx.plugin(MysqlAudit, { databases: [binding] })
  const provider = ctx.mysqlAudit
  await expect(provider.inspect('owned', AbortSignal.timeout(5_000))).rejects.toMatchObject({ code: 'MYSQL_CREDENTIAL_UNAVAILABLE' })
  await owner.dispose()
  expect(ctx.get('mysqlAudit')).toBeUndefined()
  await expect(provider.inspect('owned', AbortSignal.timeout(5_000))).rejects.toThrow()
  expect(connections()).toBe(0)
})

it('requires a certificate identity for an IP binding and preserves DNS binding identity', async () => {
  const { ctx, binding } = await fixture()
  const { tlsServerName: _tlsServerName, ...withoutName } = binding
  await expect(Promise.resolve(ctx.plugin(MysqlAudit, { databases: [withoutName] })))
    .rejects.toMatchObject({ code: 'MYSQL_TLS_NAME_REQUIRED' })
  await expect(Promise.resolve(ctx.plugin(MysqlAudit, { databases: [{ ...binding, hostname: 'original.fixture.test' }] })))
    .rejects.toMatchObject({ code: 'MYSQL_TLS_NAME_REQUIRED' })
})

it('closes a pending MySQL handshake when the target becomes protected', async () => {
  const { ctx, binding, rule, accepted, closed, connections } = await fixture(true)
  await ctx.credentials.set(credentialRef(binding.passwordRef), 'owned fixture password')
  await ctx.plugin(MysqlAudit, { databases: [binding] })
  const operation = ctx.mysqlAudit.inspect('owned', AbortSignal.timeout(5_000))
  const rejection = expect(operation).rejects.toMatchObject({ code: 'MYSQL_CANCELLED' })
  await Promise.race([accepted, rejection.then(() => { throw new Error('Missing handshake barrier') })])
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [rule(binding.hostname)] }, 1)
  await rejection
  await closed
  await expect(ctx.mysqlAudit.inspect('owned', AbortSignal.timeout(5_000))).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(connections()).toBe(1)
})
