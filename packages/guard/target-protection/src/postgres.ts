/** Pinned TLS PostgreSQL catalogue audits and dedicated test-database execution. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import pg from 'pg'
import { Socket, isIP } from 'node:net'
import { checkServerIdentity, createSecureContext } from 'node:tls'
import { z } from 'zod'
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type CredentialProvider from '@deepseek-ai/dsh-credentials'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import type TargetProtection from './index.ts'
import type { TargetConnectionResolution } from './index.ts'
import { canonicalTargetHost, expandTargetRules, hasExactTestServer } from './rules.ts'
import type { TargetSnapshot } from './types.ts'
import { TARGET_REFUSAL_REASONS } from './network-decision.ts'

/** Owner-configured direct PostgreSQL endpoint; auth values are resolved per operation. */
export interface PostgresBinding {
  name: string
  hostname: string
  port?: number
  database: string
  username: string
  passwordRef: string
  caPem?: string
  /** Enable one-statement SQL for an owner-isolated test server and database. */
  testSql?: boolean
}
/** Request and response limits for the configured database bindings. */
export interface Config {
  databases: PostgresBinding[]
  timeoutMs?: number
  maxRows?: number
  maxResultBytes?: number
  maxPending?: number
  maxSqlBytes?: number
}
/** Returned metadata contains no connection strings, passwords or credential references. */
export interface PostgresAudit {
  database: string
  username: string
  serverVersion: string
  tables: { schema: string; name: string; kind: string; rowSecurity: boolean }[]
  settings: { name: string; value: string; unit: string | null }[]
}

/** Committed SQL result with text cells and driver-reported command metadata. */
export interface PostgresTestResult {
  columns: string[]
  rows: (string | null)[][]
  command: string
  rowCount: number | null
}

type SqlParameter = string | number | null | string[]
type SqlRow = (string | null)[]
type RunQuery = (text: string, values?: SqlParameter[], extended?: true) => Promise<PostgresTestResult>
const testParameters = z.array(z.union([z.string(), z.number().finite(), z.null()])).max(65_535)
const testStatement = /^(?:SELECT|WITH|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|EXPLAIN|ANALYZE|COMMENT)\b/iu

declare module '@deepseek-ai/cordis' {
  interface Context { /** Explicit PostgreSQL bindings with mandatory endpoint admission. */ postgresAudit: PostgresAuditService }
}

const configSchema = z.object({
  databases: z.array(z.object({ name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u), hostname: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(5432), database: z.string().min(1).max(128).refine(value => !value.includes('\0')),
    username: z.string().min(1).max(128).refine(value => !value.includes('\0')), passwordRef: z.string(), caPem: z.string().max(131072).optional(),
    testSql: z.boolean().default(false),
  }).strict()).min(1),
  timeoutMs: z.number().int().min(1).max(300000).default(30000), maxRows: z.number().int().min(1).max(10000).default(1000),
  maxResultBytes: z.number().int().min(256).max(16777216).default(1048576), maxPending: z.number().int().min(1).max(64).default(4),
  maxSqlBytes: z.number().int().min(1).max(1048576).default(65536),
}).strict()

/** Optional database provider with fixed SQL, mandatory TLS, name verification and revocation. */
export default class PostgresAuditService extends Service {
  static inject = ['targetProtection', 'credentials']
  static Config: schema<Config> = schema.object({
    databases: schema.array(schema.object({ name: schema.string().required(), hostname: schema.string().required(),
      port: schema.natural().default(5432), database: schema.string().required(), username: schema.string().required(),
      passwordRef: schema.string().required(), caPem: schema.string(), testSql: schema.boolean().default(false) })).required(),
    timeoutMs: schema.natural().default(30000), maxRows: schema.natural().default(1000),
    maxResultBytes: schema.natural().default(1048576), maxPending: schema.natural().default(4),
    maxSqlBytes: schema.natural().default(65536),
  })
  private readonly config: z.output<typeof configSchema>
  private readonly protection: TargetProtection
  private readonly credentials: CredentialProvider
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()

  /** @param ctx - Mandatory rule and credential providers. @param config - Explicit endpoint bindings and limits. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'postgresAudit')
    this.config = configSchema.parse(config)
    const names = new Set<string>()
    for (const binding of this.config.databases) {
      if (names.has(binding.name)) throw new Error('PostgreSQL binding names must be unique.')
      names.add(binding.name); binding.hostname = canonicalTargetHost(binding.hostname)
      if (!isCredentialRefName(binding.passwordRef)) throw new HarnessError('PostgreSQL requires a credential reference name.', 'POSTGRES_CREDENTIAL_UNAVAILABLE')
      createSecureContext(binding.caPem === undefined ? {} : { ca: binding.caPem })
    }
    this.protection = ctx.targetProtection; this.credentials = ctx.credentials
    ctx.effect(() => async () => {
      this.lifetime.abort(new HarnessError('PostgreSQL provider is closing.', 'POSTGRES_UNAVAILABLE'))
      await Promise.allSettled(this.pending)
    }, 'target-postgres.lifetime')
  }

  /**
   * Return owner binding names.
   * @returns Names without endpoint or credential details.
   */
  names(): string[] { return this.config.databases.map(binding => binding.name) }

  /**
   * List configured test bindings for tool registration. Target rules are checked at dispatch.
   * @returns Names whose owners opted into test SQL.
   */
  testSqlNames(): string[] { return this.config.databases.filter(binding => binding.testSql).map(binding => binding.name) }

  /**
   * Inspect the selected database using only fixed built-in catalogue queries.
   * @param name - Owner-configured binding name, never a connection string.
   * @param signal - Caller cancellation and deadline.
   * @returns Verified identity, table metadata and selected security settings; no arbitrary SQL is accepted.
   */
  inspect(name: string, signal: AbortSignal): Promise<PostgresAudit> {
    return this.enqueue(() => this.run(name, signal, false, async (query, identity) => {
      const { rows: tableRows } = await query("SELECT n.nspname::text,c.relname::text,c.relkind::text,c.relrowsecurity::text FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','f') ORDER BY n.nspname,c.relname LIMIT $1", [this.config.maxRows + 1])
      const { rows: settingRows } = await query('SELECT name,setting,unit FROM pg_catalog.pg_settings WHERE name=ANY($1::text[]) ORDER BY name',
        [['ssl', 'password_encryption', 'default_transaction_read_only', 'log_connections', 'log_statement', 'search_path']])
      const tables = z.array(z.tuple([z.string(), z.string(), z.string(), z.enum(['true', 'false'])])).parse(tableRows)
        .map(([schema, name, kind, rowSecurity]) => ({ schema, name, kind, rowSecurity: rowSecurity === 'true' }))
      const settings = z.array(z.tuple([z.string(), z.string(), z.string().nullable()])).parse(settingRows)
        .map(([name, value, unit]) => ({ name, value, unit }))
      return { database: identity[0], username: identity[1], serverVersion: identity[2], tables, settings }
    }))
  }

  /**
   * Execute and commit one statement against an owner-isolated test database.
   * @param name - Configured test binding.
   * @param sql - One statement, with optional $1-style placeholders.
   * @param parameters - JSON values passed separately to the PostgreSQL driver.
   * @param signal - Cancellation and deadline.
   * @returns A result after PostgreSQL confirms the commit. A lost commit acknowledgement is reported separately.
   */
  async executeTestSql(name: string, sql: string, parameters: unknown, signal: AbortSignal): Promise<PostgresTestResult> {
    const values = testParameters.safeParse(parameters)
    if (!values.success || sql.includes('\0') || Buffer.byteLength(sql) > this.config.maxSqlBytes
      || Buffer.byteLength(JSON.stringify(values.data)) > this.config.maxSqlBytes || !testStatement.test(sql.trimStart())) {
      throw new HarnessError('Use one supported PostgreSQL statement with bounded JSON parameters.', 'POSTGRES_INVALID_SQL')
    }
    return this.enqueue(() => this.run(name, signal, true, query => query(sql, values.data, true)))
  }

  private enqueue<T>(start: () => Promise<T>): Promise<T> {
    if (this.pending.size >= this.config.maxPending) return Promise.reject(new HarnessError('PostgreSQL operation capacity is full.', 'POSTGRES_BUSY'))
    const operation = start()
    this.pending.add(operation)
    return operation.finally(() => { this.pending.delete(operation) })
  }

  private async run<T>(
    name: string, caller: AbortSignal, testSql: boolean,
    operation: (query: RunQuery, identity: [string, string, string, string]) => Promise<T>,
  ): Promise<T> {
    const binding = this.config.databases.find(binding => binding.name === name)
    if (binding === undefined) throw new HarnessError('Choose a configured PostgreSQL binding.', 'POSTGRES_DATABASE_UNKNOWN')
    if (testSql && !binding.testSql) throw new HarnessError('Test SQL is disabled for this binding.', 'POSTGRES_TEST_ONLY')
    const signal = AbortSignal.any([caller, this.lifetime.signal, this.protection.executionSignal()])
    using timeout = deadline(signal, this.config.timeoutMs, 'POSTGRES_TIMEOUT')
    const release = this.protection.retainExecution()
    let client: pg.Client | undefined, socket: Socket | undefined, closed: Promise<void> | undefined
    let resolution: TargetConnectionResolution | undefined
    let snapshot: TargetSnapshot | undefined
    let releaseTest: (() => void) | undefined
    const finished = Promise.withResolvers<undefined>()
    let commitDispatched = false
    let commitAcknowledged = false
    const admitted = async (): Promise<void> => {
      const decision = await this.protection.checkConnection(binding.hostname, binding.port, resolution,
        'endpoint', testSql ? 'mutate' : 'observe', timeout.signal, binding.database)
      if (!decision.allowed) throw new HarnessError(TARGET_REFUSAL_REASONS[decision.code], decision.code)
      if (testSql) {
        const instance = await this.protection.checkConnection(binding.hostname, binding.port, resolution, 'endpoint', 'mutate', timeout.signal)
        if (!instance.allowed) throw new HarnessError(TARGET_REFUSAL_REASONS[instance.code], instance.code)
      }
      timeout.signal.throwIfAborted()
    }
    let abort: (() => void) | undefined
    try {
      await admitted()
      if (testSql) {
        snapshot = await this.protection.snapshot()
        const exactDatabase = expandTargetRules(snapshot.preferences).some(rule => rule.enabled && rule.kind === 'database'
          && rule.environment === 'test' && rule.match === 'host' && rule.address === binding.hostname
          && rule.port === binding.port && rule.database === binding.database)
        if (!exactDatabase || !hasExactTestServer(snapshot.preferences, binding.hostname, binding.port)) {
          throw new HarnessError('Test SQL requires both a dedicated test-server rule and an exact test-database rule.', 'POSTGRES_TEST_ONLY')
        }
      }
      const addresses = await this.protection.resolveConnectionTarget(binding.hostname, timeout.signal)
      const selected = addresses.addresses[0]
      if (selected === undefined) throw new HarnessError('PostgreSQL target did not resolve.', 'TARGET_IDENTITY_UNVERIFIED')
      resolution = { ...addresses, addresses: [selected] }
      const password = await this.credentials.resolve(credentialRef(binding.passwordRef))
      if (password === undefined || password.value === '') throw new HarnessError('PostgreSQL credential reference is not configured.', 'POSTGRES_CREDENTIAL_UNAVAILABLE')
      await admitted()
      if (snapshot !== undefined) {
        releaseTest = this.protection.retainNativeExecution(snapshot.revision, async () => {
          socket?.destroy()
          await finished.promise
        })
      }
      socket = new Socket()
      const transport = socket
      closed = new Promise<void>((resolve) => { transport.once('close', () => { resolve() }) })
      socket.on('error', () => {}) // The driver and operation own reporting; native close is awaited below.
      abort = () => { transport.destroy() }
      timeout.signal.addEventListener('abort', abort, { once: true })
      client = new pg.Client({ host: selected.address, port: binding.port, database: binding.database,
        user: binding.username, password: password.value, stream: () => transport,
        ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2', ...binding.caPem === undefined ? {} : { ca: binding.caPem },
          ...isIP(binding.hostname) ? {} : { servername: binding.hostname },
          checkServerIdentity: (_hostname, cert) => checkServerIdentity(binding.hostname, cert) },
        options: testSql ? '-c search_path=public -c default_transaction_read_only=off'
          : '-c search_path=pg_catalog -c default_transaction_read_only=on',
        application_name: testSql ? 'dshu-test-sql' : 'dshu-catalog-audit',
        statement_timeout: this.config.timeoutMs, lock_timeout: this.config.timeoutMs, query_timeout: this.config.timeoutMs,
        idle_in_transaction_session_timeout: this.config.timeoutMs, connectionTimeoutMillis: this.config.timeoutMs,
        keepAlive: false, client_encoding: 'UTF8', sslnegotiation: 'postgres',
      })
      client.on('error', () => {}) // Active requests reject; no driver error is reported as a successful audit.
      await client.connect()
      const connection = client
      await admitted()
      let resultBytes = 0
      const query: RunQuery = async (text, values = [], extended) => {
        await admitted()
        const rows: SqlRow[] = []
        const result = await new Promise<pg.QueryResultBase>((resolve, reject) => {
          let failed = false
          const options = { text, values, rowMode: 'array' as const, types: { getTypeParser: () => (value: string): string => value },
            ...extended ? { queryMode: 'extended' } : {} }
          const request = new pg.Query<SqlRow, SqlParameter[]>(options, (error, result) => {
            if (error) reject(error)
            else resolve(result)
          })
          // Array mode and the installed text parsers produce string-or-null cells.
          request.on('row', (row: (string | null)[]) => {
            if (failed) return
            resultBytes += Buffer.byteLength(JSON.stringify(row))
            if (rows.length >= this.config.maxRows || resultBytes > this.config.maxResultBytes) {
              failed = true; transport.destroy()
              reject(new HarnessError('PostgreSQL exceeded its configured result limit.', 'POSTGRES_OUTPUT_LIMIT'))
              return
            }
            rows.push(row)
          })
          request.once('error', reject)
          if (text === 'COMMIT' && !extended) commitDispatched = true
          connection.query(request)
        })
        if (text === 'COMMIT' && !extended) {
          commitAcknowledged = true
          if (result.command !== 'COMMIT') throw new HarnessError('PostgreSQL reported a rollback for the test transaction.', 'POSTGRES_TEST_SQL_FAILED')
        } else { timeout.signal.throwIfAborted(); await admitted() }
        return { rows, columns: result.fields.map(field => field.name), rowCount: result.rowCount, command: result.command }
      }
      await query(testSql ? 'BEGIN READ WRITE' : 'BEGIN READ ONLY')
      const identity = z.tuple([z.string(), z.string(), z.string(), z.string()]).parse((await query("SELECT pg_catalog.current_database(), session_user, pg_catalog.current_setting('server_version'), pg_catalog.current_setting('transaction_read_only')")).rows[0])
      if (identity[0] !== binding.database || identity[1] !== binding.username || identity[3] !== (testSql ? 'off' : 'on')) {
        throw new HarnessError('PostgreSQL database, login or transaction mode differs from its configured binding.', 'POSTGRES_IDENTITY_MISMATCH')
      }
      if (testSql) {
        const role = await query(`SELECT (NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles other_role WHERE other_role.oid <> r.oid AND other_role.rolname <> 'pg_database_owner'
            AND pg_catalog.pg_has_role(r.oid, other_role.oid, 'MEMBER'))))::text
          FROM pg_catalog.pg_roles r WHERE r.rolname = session_user`)
        if (role.rows[0]?.[0] !== 'true') throw new HarnessError('Test SQL requires a dedicated role without elevated attributes or memberships.', 'POSTGRES_TEST_ROLE')
      }
      const result = await operation(query, identity)
      if (!testSql) await query('ROLLBACK')
      if (Buffer.byteLength(JSON.stringify(result)) > this.config.maxResultBytes) {
        throw new HarnessError('PostgreSQL exceeded its configured result limit.', 'POSTGRES_OUTPUT_LIMIT')
      }
      if (testSql) await query('COMMIT')
      return result
    } catch (error) {
      if (commitDispatched && !commitAcknowledged) {
        throw new HarnessError('PostgreSQL did not acknowledge the commit. Check the test database before retrying.', 'POSTGRES_COMMIT_UNKNOWN', { cause: error })
      }
      if (timeout.signal.aborted) throw new HarnessError('PostgreSQL was cancelled or timed out; the connection was closed.', 'POSTGRES_CANCELLED', { cause: error })
      if (error instanceof HarnessError) throw error
      if (testSql) throw new HarnessError('PostgreSQL test SQL failed before a confirmed commit.', 'POSTGRES_TEST_SQL_FAILED', { cause: error })
      throw new HarnessError('PostgreSQL audit failed. Check the endpoint, credential reference and TLS configuration.', 'POSTGRES_AUDIT_FAILED', { cause: error })
    } finally {
      if (abort !== undefined) timeout.signal.removeEventListener('abort', abort)
      socket?.destroy()
      try {
        if (closed !== undefined) await closed
        if (client !== undefined) await client.end()
      } finally {
        try { releaseTest?.() }
        finally { release(); finished.resolve(undefined) }
      }
    }
  }
}
