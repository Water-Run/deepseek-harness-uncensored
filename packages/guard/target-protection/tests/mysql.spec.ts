/** MySQL verifies admissions before TCP and releases active handshakes on policy changes. */
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
import { checkMysqlWriteGrants, mysqlWriteInput, mysqlWriteStatement } from '../src/mysql-write.ts'
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
  const serverRule = (address: string) => {
    const { database: _database, ...fields } = rule(address)
    return { ...fields, kind: 'server' as const }
  }
  return { ctx, owner, binding, rule, serverRule, accepted: accepted.promise, closed: closed.promise, connections: () => connections }
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

const mutation = { operation: 'update', table: 'items', values: { name: 'a?; --' }, where: { id: 7 } }

it('binds all values and rejects unscoped mutations', async () => {
  const { ctx, binding, connections } = await fixture()
  await ctx.plugin(MysqlAudit, { databases: [{ ...binding, testTables: ['items'] }] })
  await expect(ctx.mysqlAudit.writeTest('owned', { ...mutation, where: {} }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'MYSQL_INVALID_WRITE' })
  await expect(ctx.mysqlAudit.writeTest('owned', { ...mutation, table: 'production.items' }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'MYSQL_INVALID_WRITE' })
  expect(mysqlWriteStatement('fixture', mysqlWriteInput.parse(mutation), 2)).toEqual({
    target: '`fixture`.`items`', sql: 'UPDATE `fixture`.`items` SET `name` = ? WHERE `id` <=> ? LIMIT 2', values: ['a?; --', 7],
  })
  expect(connections()).toBe(0)
})

it('requires exact dedicated server and database rules and refuses a production database on that instance', async () => {
  const { ctx, binding, rule, serverRule, connections } = await fixture()
  await ctx.plugin(MysqlAudit, { databases: [{ ...binding, testTables: ['items'] }] })
  const database = { ...rule(binding.hostname), environment: 'test' as const }
  const server = { ...serverRule(binding.hostname), environment: 'test' as const }
  const write = () => ctx.mysqlAudit.writeTest('owned', mutation, new AbortController().signal)
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [database] }, 1)
  await expect(write()).rejects.toMatchObject({ code: 'MYSQL_TEST_ONLY' })
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [database, server] }, 2)
  await expect(write()).rejects.toMatchObject({ code: 'MYSQL_CREDENTIAL_UNAVAILABLE' })
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [
    database, server, { ...rule(binding.tlsServerName), database: 'other' },
  ] }, 3)
  await expect(write()).rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [database, server, serverRule(binding.tlsServerName)] }, 4)
  await expect(write()).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(connections()).toBe(0)
})

it('waits for the dedicated write handshake to close before publishing protection changes', async () => {
  const { ctx, binding, rule, serverRule, accepted, closed, connections } = await fixture(true)
  const database = { ...rule(binding.hostname), environment: 'test' as const }
  const server = { ...serverRule(binding.hostname), environment: 'test' as const }
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [database, server] }, 1)
  await ctx.credentials.set(credentialRef(binding.passwordRef), 'owned fixture password')
  await ctx.plugin(MysqlAudit, { databases: [{ ...binding, testTables: ['items'] }] })
  const operation = ctx.mysqlAudit.writeTest('owned', mutation, AbortSignal.timeout(5_000))
  const rejection = expect(operation).rejects.toMatchObject({ code: 'MYSQL_CANCELLED' })
  await Promise.race([accepted, rejection.then(() => { throw new Error('Missing write handshake barrier') })])
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [rule(binding.hostname)] }, 2)
  await rejection
  await closed
  expect(connections()).toBe(1)
})

it.each([
  'GRANT SELECT, UPDATE ON `fixture`.`items` TO `audit`@`%`',
  'GRANT SELECT, UPDATE, TRIGGER ON `fixture`.* TO `audit`@`%`',
  'GRANT SELECT, UPDATE, TRIGGER ON `fixture`.`items` TO `audit`@`%` WITH GRANT OPTION',
  'GRANT `production_admin`@`%` TO `audit`@`%`',
  'GRANT UPDATE ON `production`.`items` TO `audit`@`%`',
])('rejects an incomplete or elevated grant in a write account', (grant) => {
  const binding = { database: 'fixture', username: 'audit', accountHost: '%', testTables: ['items'] }
  expect(() => checkMysqlWriteGrants([[grant]], binding, mysqlWriteInput.parse(mutation)))
    .toThrow(expect.objectContaining({ code: 'MYSQL_TEST_GRANTS' }))
})
