/** Real TLS and PostgreSQL startup messages with deterministic request barriers. @module */
import { Context } from '@deepseek-ai/cordis'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createServer, type Socket } from 'node:net'
import { TLSSocket, createSecureContext } from 'node:tls'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { generate } from 'selfsigned'
import { expect, it, onTestFinished, vi } from 'vitest'
import Protection from '../src/index.ts'
import PostgresAuditService from '../src/postgres.ts'
import type { TargetRule, TargetRuleId } from '../src/types.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as PostgresAgent from '../src/postgres-agent.ts'

function frame(kind: string, payload: Buffer) {
  const header = Buffer.alloc(5); header[0] = kind.charCodeAt(0); header.writeInt32BE(payload.length + 4, 1)
  return Buffer.concat([header, payload])
}
interface FixtureOptions {
  full?: boolean
  hold?: boolean
  matchingCert?: boolean
  hostname?: string
  identity?: string[]
  timeoutMs?: number
  maxResultBytes?: number
  maxRows?: number
  tableRows?: string[][]
  reset?: boolean
  maxPending?: number
}
async function harness(options: FixtureOptions = {}) {
  const { full = false, hold = true, matchingCert = true, hostname = '127.0.0.1' } = options
  const root = await mkdtemp(join(tmpdir(), 'dshu-postgres-wire-')), ctx = new Context()
  const material = generate([{ name: 'commonName', value: 'postgres.test' }], { keySize: 2048, days: 1, algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames: matchingCert
      ? [{ type: 7, ip: '127.0.0.1' }, { type: 2, value: 'postgres.test' }]
      : [{ type: 2, value: 'wrong.test' }] }] })
  const sockets = new Set<Socket>(), query = Promise.withResolvers<string>()
  const peerClosed: PromiseWithResolvers<void> = Promise.withResolvers()
  let connections = 0, queries = 0
  const own = <T extends Socket>(socket: T): T => {
    sockets.add(socket); socket.on('error', () => {})
    socket.once('close', () => { sockets.delete(socket); peerClosed.resolve() })
    return socket
  }
  const server = createServer((raw) => {
    connections++; own(raw)
    if (options.reset) { raw.resetAndDestroy(); return }
    let handshake = Buffer.alloc(0)
    const startTls = (chunk: Buffer): void => {
      handshake = Buffer.concat([handshake, chunk])
      if (handshake.length < 8) return
      raw.removeListener('data', startTls)
      if (handshake.length !== 8 || handshake.readInt32BE(4) !== 80877103) { raw.destroy(); return }
      raw.write('S')
      const secure = own(new TLSSocket(raw, { isServer: true,
        secureContext: createSecureContext({ key: material.private, cert: material.cert }) }))
      let startup = true, bytes = Buffer.alloc(0), statement = ''
      const columns = (names: string[]) => {
        const count = Buffer.alloc(2); count.writeInt16BE(names.length)
        const fields = names.map((name) => {
          const description = Buffer.alloc(18); description.writeInt32BE(25, 6)
          description.writeInt16BE(-1, 10); description.writeInt32BE(-1, 12)
          return Buffer.concat([Buffer.from(name + '\0'), description])
        })
        return frame('T', Buffer.concat([count, ...fields]))
      }
      const dataRow = (row: string[]) => {
        const count = Buffer.alloc(2); count.writeInt16BE(row.length)
        const values = row.map((value) => {
          const data = Buffer.from(value), length = Buffer.alloc(4); length.writeInt32BE(data.length)
          return Buffer.concat([length, data])
        })
        return frame('D', Buffer.concat([count, ...values]))
      }
      const catalogue = () => statement.includes('pg_class')
        ? { names: ['schema', 'name', 'kind', 'rls'], rows: options.tableRows ?? [['public', 'owned_table', 'r', 'false']] }
        : { names: ['name', 'setting', 'unit'], rows: [['ssl', 'on', '']] }
      secure.on('data', (chunk: Buffer) => {
        bytes = Buffer.concat([bytes, chunk])
        while (bytes.length >= (startup ? 4 : 5)) {
          const length = bytes.readInt32BE(startup ? 0 : 1) + (startup ? 0 : 1)
          if (bytes.length < length) return
          const request = bytes.subarray(0, length); bytes = bytes.subarray(length)
          if (startup) {
            startup = false
            secure.write(Buffer.concat([frame('R', Buffer.alloc(4)), frame('Z', Buffer.from('I'))]))
          } else if (request[0] === 81) {
            const sql = request.subarray(5, -1).toString('utf8'); queries++; query.resolve(sql)
            if (hold) continue
            if (sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK') {
              const command = sql === 'ROLLBACK' ? 'ROLLBACK' : 'BEGIN'
              secure.write(Buffer.concat([frame('C', Buffer.from(command + '\0')), frame('Z', Buffer.from(sql === 'ROLLBACK' ? 'I' : 'T'))])); continue
            }
            secure.write(Buffer.concat([columns(['database', 'username', 'version', 'readonly']),
              dataRow(options.identity ?? ['unexpected_database', 'fixture', '18.4', 'on']),
              frame('C', Buffer.from('SELECT 1\0')), frame('Z', Buffer.from('T'))]))
          } else if (request[0] === 80) {
            const offset = request.indexOf(0, 5) + 1
            statement = request.subarray(offset, request.indexOf(0, offset)).toString('utf8')
            queries++
            secure.write(frame('1', Buffer.alloc(0)))
          } else if (request[0] === 66) {
            secure.write(frame('2', Buffer.alloc(0)))
          } else if (request[0] === 68) {
            secure.write(columns(catalogue().names))
          } else if (request[0] === 69) {
            secure.write(Buffer.concat([...catalogue().rows.map(dataRow), frame('C', Buffer.from('SELECT 1\0'))]))
          } else if (request[0] === 83) {
            secure.write(frame('Z', Buffer.from('T')))
          }
        }
      })
    }
    raw.on('data', startTls)
  })
  onTestFinished(async () => {
    for (const socket of sockets) socket.destroy()
    await ctx.fiber.dispose()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    await rm(root, { recursive: true, force: true })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing PostgreSQL listener')
  await ctx.plugin(Credentials, { path: join(root, 'credentials.yaml'), dshHome: root, watch: false })
  const ref = credentialRef('PG_FIXTURE_' + randomUUID().replaceAll('-', '_'))
  await ctx.credentials.set(ref, 'owned fixture password')
  const hostsFile = join(root, 'hosts')
  await writeFile(hostsFile, '127.0.0.1 postgres.test protected-alias.test\n')
  const owner = await ctx.plugin(Protection, { path: ':memory:', hostsFile })
  const rule: TargetRule = { id: brandString<TargetRuleId>(randomUUID()), name: 'owned fixture database', enabled: true,
    kind: 'database', match: 'host', address: '127.0.0.1', port: address.port, database: 'fixture', environment: 'production',
    protection: full ? 'full' : 'audit' }
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [rule] }, 1)
  const config = { databases: [{ name: 'owned', hostname, port: address.port, database: 'fixture', username: 'fixture',
    passwordRef: ref, caPem: material.cert }], timeoutMs: options.timeoutMs ?? 10000,
  ...options.maxResultBytes === undefined ? {} : { maxResultBytes: options.maxResultBytes },
  ...options.maxRows === undefined ? {} : { maxRows: options.maxRows },
  ...options.maxPending === undefined ? {} : { maxPending: options.maxPending } }
  const executor = await ctx.plugin(PostgresAuditService, config)
  return { ctx, owner, executor, rule, config, ref, query: query.promise, peerClosed: peerClosed.promise,
    connections: () => connections, queries: () => queries }
}

it('refuses a fully protected database before TCP or authentication', async () => {
  const h = await harness({ full: true })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.connections()).toBe(0); expect(h.queries()).toBe(0)
})

it('requires the original TLS name even when the connector is pinned to a literal address', async () => {
  const h = await harness({ matchingCert: false })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_AUDIT_FAILED' })
  expect(h.connections()).toBe(1); expect(h.queries()).toBe(0)
})

it('closes a TLS request and settles native sockets when cancelled', async () => {
  const h = await harness(), abort = new AbortController()
  const operation = h.ctx.postgresAudit.inspect('owned', abort.signal)
  const outcome = operation.catch((error: unknown) => error)
  expect(await Promise.race([h.query, operation.then(() => { throw new Error('Audit ended before the request barrier') })])).toBe('BEGIN READ ONLY')
  abort.abort(new Error('owned cancellation'))
  expect(await outcome).toMatchObject({ code: 'POSTGRES_CANCELLED' })
  await h.peerClosed
})

it('checks database identity before issuing any application catalogue query', async () => {
  const h = await harness({ hold: false })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_IDENTITY_MISMATCH' })
  expect(h.queries()).toBe(2)
})

it.each([
  ['login', ['fixture', 'another_login', '18.4', 'on']],
  ['read-only transaction', ['fixture', 'fixture', '18.4', 'off']],
])('refuses mismatched %s before catalogue access', async (_field, identity) => {
  const h = await harness({ hold: false, identity })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_IDENTITY_MISMATCH' })
  expect(h.queries()).toBe(2)
})

it('resolves an owned hostname, pins its address and verifies the hostname certificate', async () => {
  const h = await harness({ hostname: 'postgres.test', hold: false })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_IDENTITY_MISMATCH' })
  expect(h.connections()).toBe(1); expect(h.queries()).toBe(2)
})

it('checks hosts-file aliases before connecting', async () => {
  const h = await harness({ hostname: 'postgres.test' })
  const before = await h.ctx.targetProtection.snapshot()
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{ ...h.rule, address: 'protected-alias.test', protection: 'full' }] }, before.revision)
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.connections()).toBe(0)
})

it('refuses absent credentials without falling back to driver environment passwords', async () => {
  const h = await harness()
  vi.stubEnv('PGPASSWORD', 'ambient password must not authenticate')
  onTestFinished(() => { vi.unstubAllEnvs() })
  await h.ctx.credentials.unset(h.ref)
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_CREDENTIAL_UNAVAILABLE' })
  expect(h.connections()).toBe(0)
})

it('rechecks policy after credential resolution before creating a socket', async () => {
  const h = await harness()
  const entered: PromiseWithResolvers<void> = Promise.withResolvers()
  const resume: PromiseWithResolvers<void> = Promise.withResolvers()
  const original = h.ctx.credentials.resolve.bind(h.ctx.credentials)
  const spy = vi.spyOn(h.ctx.credentials, 'resolve').mockImplementation(async (ref) => {
    entered.resolve(); await resume.promise
    return original(ref)
  })
  onTestFinished(() => { resume.resolve(); spy.mockRestore() })
  const operation = h.ctx.postgresAudit.inspect('owned', new AbortController().signal)
  const outcome = operation.catch((error: unknown) => error)
  await Promise.race([entered.promise, operation.then(() => { throw new Error('Missing credential barrier') })])
  const before = await h.ctx.targetProtection.snapshot()
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{ ...h.rule, protection: 'full' }] }, before.revision)
  resume.resolve()
  expect(await outcome).toMatchObject({ code: 'POSTGRES_CANCELLED' })
  expect(h.connections()).toBe(0)
})

it('bounds streamed results and closes the native connection on overflow', async () => {
  const h = await harness({ hold: false, maxResultBytes: 256, identity: ['fixture', 'fixture', 'x'.repeat(257), 'on'] })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_OUTPUT_LIMIT' })
  await h.peerClosed
  expect(h.queries()).toBe(2)
})

it('settles a stalled TLS request at its configured deadline', async () => {
  const h = await harness({ timeoutMs: 10000 })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const operation = h.ctx.postgresAudit.inspect('owned', new AbortController().signal)
    const outcome = operation.catch((error: unknown) => error)
    await Promise.race([h.query, operation.then(() => { throw new Error('Missing request barrier') })])
    await vi.advanceTimersByTimeAsync(10000)
    expect(await outcome).toMatchObject({ code: 'POSTGRES_CANCELLED' })
    await h.peerClosed
  } finally { vi.useRealTimers() }
})

it('returns named catalogue fields and closes a successful TLS transaction', async () => {
  const h = await harness({ hold: false, identity: ['fixture', 'fixture', '18.4', 'on'] })
  const result = await h.ctx.postgresAudit.inspect('owned', new AbortController().signal)
  expect(result).toEqual({ database: 'fixture', username: 'fixture', serverVersion: '18.4',
    tables: [{ schema: 'public', name: 'owned_table', kind: 'r', rowSecurity: false }],
    settings: [{ name: 'ssl', value: 'on', unit: '' }] })
  expect(h.ctx.postgresAudit.names()).toEqual(['owned'])
  expect(h.queries()).toBe(5)
  await h.peerClosed
})

it('refuses excess catalogue rows before returning a partial audit', async () => {
  const h = await harness({ hold: false, identity: ['fixture', 'fixture', '18.4', 'on'], maxRows: 1,
    tableRows: [['public', 'one', 'r', 'false'], ['public', 'two', 'r', 'false'], ['public', 'three', 'r', 'false']] })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_OUTPUT_LIMIT' })
  await h.peerClosed
})

it('bounds the complete structured report as well as raw rows', async () => {
  const h = await harness({ hold: false, maxResultBytes: 256, identity: ['fixture', 'fixture', 'x'.repeat(100), 'on'] })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_OUTPUT_LIMIT' })
  expect(h.queries()).toBe(5)
  await h.peerClosed
})

it('renders successful tool results and uses a distinct PostgreSQL presenter', async () => {
  const h = await harness({ hold: false, identity: ['fixture', 'fixture', '18.4', 'on'] })
  await h.ctx.plugin(SystemPrompt); await h.ctx.plugin(Tools); await h.ctx.plugin(PostgresAgent)
  const result = await h.ctx.tools.execute({ name: 'database_inspect', arguments: { database: 'owned' },
    callId: ToolCallId('catalogue'), signal: new AbortController().signal })
  expect(result.isError).toBe(false)
  expect(JSON.stringify(result.content)).toContain('owned_table')
  expect(h.ctx.tools.get('database_inspect')?.presentCall?.({ database: 'owned' })).toEqual({ card: 'generic', kind: 'other', title: 'PostgreSQL · owned' })
})

it('does not open a socket for an unknown binding or empty resolver response', async () => {
  const h = await harness(), signal = new AbortController().signal
  await expect(h.ctx.postgresAudit.inspect('unknown', signal)).rejects.toMatchObject({ code: 'POSTGRES_DATABASE_UNKNOWN' })
  const resolution = await h.ctx.targetProtection.resolveConnectionTarget('127.0.0.1', signal)
  const spy = vi.spyOn(h.ctx.targetProtection, 'resolveConnectionTarget').mockResolvedValue({ ...resolution, addresses: [] })
  onTestFinished(() => { spy.mockRestore() })
  await expect(h.ctx.postgresAudit.inspect('owned', signal)).rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
  expect(h.connections()).toBe(0)
})

it('rejects excess pending calls and releases capacity after cancellation', async () => {
  const h = await harness({ maxPending: 1 }), abort = new AbortController()
  const operation = h.ctx.postgresAudit.inspect('owned', abort.signal)
  const outcome = operation.catch((error: unknown) => error)
  await Promise.race([h.query, operation.then(() => { throw new Error('Missing query barrier') })])
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_BUSY' })
  abort.abort()
  expect(await outcome).toMatchObject({ code: 'POSTGRES_CANCELLED' })
  await expect(h.ctx.postgresAudit.inspect('unknown', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_DATABASE_UNKNOWN' })
})

it('closes a connection reset by the peer and returns a typed failure', async () => {
  const h = await harness({ reset: true })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_AUDIT_FAILED' })
  await h.peerClosed
})

it('requires a trusted certificate when no private CA is supplied', async () => {
  const h = await harness()
  await h.executor.dispose()
  const { caPem: _ca, ...binding } = h.config.databases[0]!
  await h.ctx.plugin(PostgresAuditService, { ...h.config, databases: [binding] })
  await expect(h.ctx.postgresAudit.inspect('owned', new AbortController().signal)).rejects.toMatchObject({ code: 'POSTGRES_AUDIT_FAILED' })
  expect(h.queries()).toBe(0)
})

it.each(['duplicate names', 'invalid credential reference'])('rejects %s during activation without connecting', async (kind) => {
  const h = await harness()
  await h.executor.dispose()
  const binding = h.config.databases[0]!
  const databases = kind === 'duplicate names' ? [binding, binding] : [{ ...binding, passwordRef: 'not a reference!' }]
  await expect(h.ctx.plugin(PostgresAuditService, { ...h.config, databases })).rejects.toThrow(
    kind === 'duplicate names' ? 'binding names must be unique' : 'requires a credential reference name')
  expect(h.connections()).toBe(0)
})

it('revokes an active TLS audit and withdraws the mandatory provider', async () => {
  const h = await harness(), stale = h.ctx.postgresAudit
  const operation = stale.inspect('owned', new AbortController().signal)
  const outcome = operation.catch((error: unknown) => error)
  await Promise.race([h.query, operation.then(() => { throw new Error('Audit ended before the request barrier') })])
  await h.owner.dispose()
  expect(await outcome).toMatchObject({ code: 'POSTGRES_CANCELLED' })
  expect(h.ctx.get('postgresAudit')).toBeUndefined()
  await expect(stale.inspect('owned', new AbortController().signal)).rejects.toBeDefined()
})
