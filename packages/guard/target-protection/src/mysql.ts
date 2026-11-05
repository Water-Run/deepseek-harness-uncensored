/** Address-pinned MySQL catalogue audits and structured test mutations. @module */
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import type CredentialProvider from '@deepseek-ai/dsh-credentials'
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import schema from '@deepseek-ai/schemastery'
import mysql from 'mysql2'
import { isIP, Socket } from 'node:net'
import { createSecureContext } from 'node:tls'
import { z } from 'zod'
import type TargetProtection from './index.ts'
import type { TargetConnectionResolution } from './index.ts'
import { TARGET_REFUSAL_REASONS } from './network-decision.ts'
import { canonicalTargetHost, expandTargetRules, hasExactTestServer } from './rules.ts'
import { checkMysqlWriteGrants, mysqlWriteIdentifier, mysqlWriteInput, mysqlWriteStatement } from './mysql-write.ts'
import type { MysqlParameter } from './mysql-write.ts'

/** Owner-configured database, login, and TLS identity. */
export interface MysqlBinding {
  name: string
  hostname: string
  port?: number
  database: string
  username: string
  /** The host part of the matched MySQL account, such as `%`. */
  accountHost: string
  passwordRef: string
  /** A DNS name in the certificate, required when hostname is a literal IP. */
  tlsServerName?: string
  caPem?: string
  /** Explicit tables allowed for test writes. Defaults to empty. */
  testTables?: string[]
  /** Require instance-wide foreign-key inspection instead of a dedicated test-server rule. */
  sharedTestWrites?: boolean
}

/** Request, row and payload limits for MySQL operations. */
export interface Config {
  databases: MysqlBinding[]
  timeoutMs?: number
  maxRows?: number
  maxResultBytes?: number
  maxPending?: number
}

/** Verified MySQL database identity and catalogue information. */
export interface MysqlAudit {
  database: string
  account: string
  serverVersion: string
  tlsCipher: string
  tables: { name: string; kind: string; engine: string | null }[]
}

/** Acknowledged test mutation. The count refers to the direct statement. */
export interface MysqlWriteResult {
  database: string
  table: string
  operation: 'insert' | 'update' | 'delete'
  affectedRows: number
}

declare module '@deepseek-ai/cordis' {
  interface Context { /** Configured MySQL bindings with mandatory target admission. */ mysqlAudit: MysqlAuditService }
}

const accountPart = (length: number) => z.string().min(1).max(length).refine(value => !value.includes('@') && !value.includes('\0'))
const systemDatabases = new Set(['mysql', 'sys', 'performance_schema', 'information_schema', 'ndbinfo'])
const configSchema = z.object({
  databases: z.array(z.object({
    name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u), hostname: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(3306),
    database: z.string().min(1).max(64).refine(value => !value.includes('\0')),
    username: accountPart(32), accountHost: accountPart(255), passwordRef: z.string(),
    tlsServerName: z.string().min(1).optional(), caPem: z.string().max(131072).optional(),
    testTables: z.array(mysqlWriteIdentifier).max(16).default([]), sharedTestWrites: z.boolean().default(false),
  }).strict()).min(1),
  timeoutMs: z.number().int().min(1).max(300000).default(30000),
  maxRows: z.number().int().min(1).max(10000).default(1000),
  maxResultBytes: z.number().int().min(256).max(16777216).default(1048576),
  maxPending: z.number().int().min(1).max(64).default(4),
}).strict()

type ResolvedBinding = z.output<typeof configSchema>['databases'][number]
type MysqlQuery = (sql: string, parameters?: MysqlParameter[]) => Promise<unknown>
type MysqlIdentity = Omit<MysqlAudit, 'tables'>

/** Fixed audits and explicit test writes over verified TLS, with endpoint admission and revocation. */
export default class MysqlAuditService extends Service {
  static inject = ['targetProtection', 'credentials']
  static Config: schema<Config> = schema.object({
    databases: schema.array(schema.object({
      name: schema.string().required(), hostname: schema.string().required(), port: schema.natural().default(3306),
      database: schema.string().required(), username: schema.string().required(), accountHost: schema.string().required(),
      passwordRef: schema.string().required(), tlsServerName: schema.string(), caPem: schema.string(),
      testTables: schema.array(schema.string()).default([]), sharedTestWrites: schema.boolean().default(false),
    })).required(),
    timeoutMs: schema.natural().default(30000), maxRows: schema.natural().default(1000),
    maxResultBytes: schema.natural().default(1048576), maxPending: schema.natural().default(4),
  })
  private readonly config: z.output<typeof configSchema>
  private readonly protection: TargetProtection
  private readonly credentials: CredentialProvider
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()

  /** @param ctx - Rule and credential providers. @param config - Explicit endpoints and resource limits. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'mysqlAudit')
    this.config = configSchema.parse(config)
    const names = new Set<string>()
    for (const binding of this.config.databases) {
      if (names.has(binding.name)) throw new Error('MySQL binding names must be unique.')
      names.add(binding.name)
      binding.hostname = canonicalTargetHost(binding.hostname)
      binding.tlsServerName = canonicalTargetHost(binding.tlsServerName ?? binding.hostname)
      if (isIP(binding.tlsServerName) !== 0 || (isIP(binding.hostname) === 0 && binding.tlsServerName !== binding.hostname)) {
        throw new HarnessError('MySQL TLS requires the original DNS name or an explicit certificate name for an IP binding.', 'MYSQL_TLS_NAME_REQUIRED')
      }
      if (!isCredentialRefName(binding.passwordRef)) {
        throw new HarnessError('MySQL requires a credential reference name.', 'MYSQL_CREDENTIAL_UNAVAILABLE')
      }
      if (binding.testTables.length > 0 && (!mysqlWriteIdentifier.safeParse(binding.database).success
        || new Set(binding.testTables.map(table => table.toLowerCase())).size !== binding.testTables.length)) {
        throw new HarnessError('MySQL test writes require a simple database name and unique table names.', 'MYSQL_TEST_ONLY')
      }
      if (binding.sharedTestWrites && (binding.testTables.length === 0 || systemDatabases.has(binding.database.toLowerCase()))) {
        throw new HarnessError('Shared MySQL writes require an explicit table list in a non-system database.', 'MYSQL_TEST_ONLY')
      }
      createSecureContext(binding.caPem === undefined ? {} : { ca: binding.caPem })
    }
    this.protection = ctx.targetProtection
    this.credentials = ctx.credentials
    ctx.effect(() => async () => {
      this.lifetime.abort(new HarnessError('MySQL provider is closing.', 'MYSQL_UNAVAILABLE'))
      await Promise.allSettled(this.pending)
    }, 'target-mysql.lifetime')
  }

  /**
   * List owner-configured bindings available for catalogue audits.
   * @returns Binding names without endpoint or credential data.
   */
  names(): string[] { return this.config.databases.map(binding => binding.name) }

  /**
   * List bindings configured for structured test writes.
   * @returns Names of bindings with at least one writable test table.
   */
  testWriteNames(): string[] { return this.config.databases.filter(binding => binding.testTables.length > 0).map(binding => binding.name) }

  /**
   * Audit one bound database using executor-owned catalogue statements.
   * @param name - Configured binding name.
   * @param signal - Request cancellation.
   * @returns Verified identity and bounded table metadata.
   */
  inspect(name: string, signal: AbortSignal): Promise<MysqlAudit> {
    return this.enqueue(() => this.run(name, signal, undefined, async (query, identity) => {
      const rows = z.array(z.tuple([z.string(), z.string(), z.string().nullable()])).parse(await query(
        'SELECT TABLE_NAME,TABLE_TYPE,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME LIMIT ?',
        [this.config.maxRows + 1],
      ))
      if (rows.length > this.config.maxRows) throw new HarnessError('MySQL audit exceeded its configured row limit.', 'MYSQL_OUTPUT_LIMIT')
      return { ...identity, tables: rows.map(([table, kind, engine]) => ({ name: table, kind, engine })) }
    }))
  }

  /**
   * Apply one structured mutation after test target, grant and table checks.
   * @param name - Configured test binding.
   * @param input - JSON mutation with values and an equality filter for update or delete.
   * @param signal - Request cancellation.
   * @returns Result after MySQL confirms the commit.
   */
  async writeTest(name: string, input: unknown, signal: AbortSignal): Promise<MysqlWriteResult> {
    const parsed = mysqlWriteInput.safeParse(input)
    if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data)) > this.config.maxResultBytes) {
      throw new HarnessError('Use a bounded MySQL mutation with simple identifiers and a nonempty update or delete filter.', 'MYSQL_INVALID_WRITE')
    }
    const write = parsed.data
    return this.enqueue(() => this.run(name, signal, write.table, async (query, identity, binding) => {
      checkMysqlWriteGrants(await query('SHOW GRANTS FOR CURRENT_USER'), binding, write)
      const statement = mysqlWriteStatement(binding.database, write, this.config.maxRows + 1)
      const tableSql = 'SELECT TABLE_TYPE,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?'
      const tableArgs = [binding.database, write.table]
      const baseTable = z.tuple([z.tuple([z.literal('BASE TABLE'), z.literal('InnoDB')])])
      const unsafeTable = () => new HarnessError('MySQL test writes require an InnoDB base table without triggers.', 'MYSQL_TEST_TABLE')
      if (!baseTable.safeParse(await query(tableSql, tableArgs)).success) throw unsafeTable()
      // The shared write lock conflicts with the parent locks acquired by online ADD FOREIGN KEY.
      await query(`SELECT 1 FROM ${statement.target} LIMIT 0${binding.sharedTestWrites ? ' FOR UPDATE' : ''}`)
      if (!baseTable.safeParse(await query(tableSql, tableArgs)).success
        || !z.tuple([]).safeParse(await query('SELECT 1 FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=? AND EVENT_OBJECT_TABLE=? LIMIT 1', tableArgs)).success) {
        throw unsafeTable()
      }
      if (binding.sharedTestWrites) {
        const qualified = `${binding.database}/${write.table}`.toLowerCase()
        const keys = await query('SELECT 1 FROM information_schema.INNODB_FOREIGN WHERE LOWER(FOR_NAME)=? OR LOWER(REF_NAME)=? LIMIT 1',
          [qualified, qualified])
        if (!z.tuple([]).safeParse(keys).success) {
          throw new HarnessError('Shared MySQL test tables cannot participate in foreign keys.', 'MYSQL_TEST_FOREIGN_KEY')
        }
      }
      const result = await query(statement.sql, statement.values)
      const { affectedRows } = z.object({ affectedRows: z.number().int().nonnegative() }).parse(result)
      if (affectedRows > this.config.maxRows) {
        throw new HarnessError('MySQL test write exceeded its row limit; narrow the filter before retrying.', 'MYSQL_WRITE_LIMIT')
      }
      return { database: identity.database, table: write.table, operation: write.operation, affectedRows }
    }))
  }

  private enqueue<T>(start: () => Promise<T>): Promise<T> {
    if (this.pending.size >= this.config.maxPending) {
      return Promise.reject(new HarnessError('MySQL operation capacity is full.', 'MYSQL_BUSY'))
    }
    const operation = start()
    this.pending.add(operation)
    return operation.finally(() => { this.pending.delete(operation) })
  }

  private async run<T>(name: string, caller: AbortSignal, table: string | undefined,
    action: (query: MysqlQuery, identity: MysqlIdentity, binding: ResolvedBinding) => Promise<T>): Promise<T> {
    const binding = this.config.databases.find(item => item.name === name)
    if (binding === undefined) throw new HarnessError('Choose a configured MySQL binding.', 'MYSQL_DATABASE_UNKNOWN')
    const writing = table !== undefined
    const dedicatedWrite = writing && !binding.sharedTestWrites
    if (writing && !binding.testTables.includes(table)) {
      throw new HarnessError('This MySQL table is not enabled for test writes.', 'MYSQL_TEST_ONLY')
    }
    const tlsName = binding.tlsServerName ?? binding.hostname
    const revoked = new AbortController()
    const signal = AbortSignal.any([caller, this.lifetime.signal, this.protection.executionSignal(), revoked.signal])
    using timeout = deadline(signal, this.config.timeoutMs, 'MYSQL_TIMEOUT')
    const release = this.protection.retainExecution()
    let socket: Socket | undefined, client: mysql.Connection | undefined, closed: Promise<undefined> | undefined
    let resolution: TargetConnectionResolution | undefined
    let abort: (() => void) | undefined
    let releaseWrite: (() => void) | undefined
    const finished = Promise.withResolvers<undefined>()
    const commit = { dispatched: false, acknowledged: false }
    const admitted = async (hostname = binding.hostname): Promise<void> => {
      const decision = await this.protection.checkConnection(hostname, binding.port, resolution,
        'endpoint', writing ? 'mutate' : 'observe', timeout.signal, binding.database, true)
      if (!decision.allowed) throw new HarnessError(TARGET_REFUSAL_REASONS[decision.code], decision.code)
      if (dedicatedWrite) {
        const instance = await this.protection.checkConnection(hostname, binding.port, resolution, 'endpoint', 'mutate', timeout.signal)
        if (!instance.allowed) throw new HarnessError(TARGET_REFUSAL_REASONS[instance.code], instance.code)
      }
      timeout.signal.throwIfAborted()
    }
    try {
      await admitted()
      if (tlsName !== binding.hostname) await admitted(tlsName)
      const snapshot = writing ? await this.protection.snapshot() : undefined
      if (snapshot !== undefined) {
        const database = expandTargetRules(snapshot.preferences).some(rule => rule.enabled && rule.kind === 'database'
          && rule.environment === 'test' && rule.match === 'host' && rule.address === binding.hostname
          && rule.port === binding.port && rule.database === binding.database)
        if (!database || (dedicatedWrite && !hasExactTestServer(snapshot.preferences, binding.hostname, binding.port))) {
          const reason = dedicatedWrite ? 'MySQL test writes require an exact test-server and test-database rule.'
            : 'Shared MySQL writes require an exact test-database rule.'
          throw new HarnessError(reason, 'MYSQL_TEST_ONLY')
        }
      }
      const target = await this.protection.resolveConnectionTarget(binding.hostname, timeout.signal)
      const address = target.addresses[0]
      if (address === undefined) throw new HarnessError('MySQL target did not resolve.', 'TARGET_IDENTITY_UNVERIFIED')
      resolution = { ...target, names: [...target.names, tlsName], addresses: [address] }
      const password = await this.credentials.resolve(credentialRef(binding.passwordRef))
      if (password === undefined || password.value === '') {
        throw new HarnessError('MySQL credential reference is not configured.', 'MYSQL_CREDENTIAL_UNAVAILABLE')
      }
      await admitted()
      if (snapshot !== undefined) {
        releaseWrite = this.protection.retainNativeExecution(snapshot.revision, async () => {
          revoked.abort()
          socket?.destroy()
          await finished.promise
        })
      }
      const transport = new Socket()
      socket = transport
      closed = new Promise<undefined>((resolve) => { transport.once('close', () => { resolve(undefined) }) })
      transport.on('error', () => {}) // The driver owns the failure report; closure still settles the lease.
      const cancelled = Promise.withResolvers<never>()
      void cancelled.promise.catch(() => undefined)
      abort = () => { transport.destroy(); cancelled.reject(timeout.signal.reason) }
      timeout.signal.addEventListener('abort', abort, { once: true })
      client = mysql.createConnection({
        host: tlsName, port: binding.port, user: binding.username, database: binding.database, password: password.value,
        stream: () => transport.connect({ host: address.address, port: binding.port }),
        ssl: { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2',
          ...binding.caPem === undefined ? {} : { ca: binding.caPem } },
        rowsAsArray: true, multipleStatements: false, flags: ['-LOCAL_FILES'], connectTimeout: this.config.timeoutMs,
      })
      client.on('error', () => {}) // Active operations report errors; idle socket failures remain contained.
      const connection = client.promise()
      await Promise.race([connection.connect(), cancelled.promise])
      const query: MysqlQuery = async (sql, parameters) => {
        await admitted()
        if (sql === 'COMMIT') commit.dispatched = true
        const [rows] = await Promise.race([
          parameters === undefined ? connection.query(sql) : connection.execute(sql, parameters),
          cancelled.promise,
        ])
        if (sql === 'COMMIT') commit.acknowledged = true
        else await admitted()
        return rows
      }
      await query(writing ? 'SET SESSION TRANSACTION READ WRITE' : 'SET SESSION TRANSACTION READ ONLY')
      if (writing && binding.sharedTestWrites) await query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
      await query(writing ? 'START TRANSACTION READ WRITE' : 'START TRANSACTION READ ONLY')
      const identity = z.tuple([z.tuple([z.string(), z.string(), z.string(), z.union([z.number(), z.string()])])])
        .parse(await query('SELECT DATABASE(), CURRENT_USER(), VERSION(), @@session.transaction_read_only'))[0]
      if (identity[0] !== binding.database || identity[1] !== `${binding.username}@${binding.accountHost}`
        || String(identity[3]) !== (writing ? '0' : '1')) {
        throw new HarnessError('MySQL database, account or transaction mode differs from the configured binding.', 'MYSQL_IDENTITY_MISMATCH')
      }
      if (writing && (!/^8\./u.test(identity[2])
        || !z.tuple([z.tuple([z.literal('NONE')])]).safeParse(await query('SELECT CURRENT_ROLE()')).success)) {
        throw new HarnessError('MySQL test writes require MySQL 8 and an account without active roles.', 'MYSQL_TEST_GRANTS')
      }
      const cipher = z.tuple([z.tuple([z.literal('Ssl_cipher'), z.string().min(1)])])
        .parse(await query("SHOW SESSION STATUS LIKE 'Ssl_cipher'"))[0][1]
      const result = await action(query, {
        database: identity[0], account: identity[1], serverVersion: identity[2], tlsCipher: cipher,
      }, binding)
      if (Buffer.byteLength(JSON.stringify(result)) > this.config.maxResultBytes) {
        throw new HarnessError('MySQL exceeded its configured result limit.', 'MYSQL_OUTPUT_LIMIT')
      }
      await query(writing ? 'COMMIT' : 'ROLLBACK')
      return result
    } catch (error) {
      if (commit.dispatched && !commit.acknowledged) {
        throw new HarnessError('MySQL did not acknowledge the commit. Check the test database before retrying.', 'MYSQL_COMMIT_UNKNOWN', { cause: error })
      }
      if (timeout.signal.aborted) throw new HarnessError('MySQL operation was cancelled or timed out.', 'MYSQL_CANCELLED', { cause: error })
      if (error instanceof HarnessError) throw error
      if (writing) throw new HarnessError('MySQL test write failed before a confirmed commit.', 'MYSQL_TEST_WRITE_FAILED', { cause: error })
      throw new HarnessError('MySQL audit failed. Check the endpoint, credential reference and TLS configuration.', 'MYSQL_AUDIT_FAILED', { cause: error })
    } finally {
      if (abort !== undefined) timeout.signal.removeEventListener('abort', abort)
      try {
        try { client?.destroy() }
        finally { socket?.destroy(); await closed }
      } finally {
        try { releaseWrite?.(); release() }
        finally { finished.resolve(undefined) }
      }
    }
  }
}
