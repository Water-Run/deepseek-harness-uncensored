/** Address-pinned MySQL catalogue audits under the target rule service. @module */
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
import { canonicalTargetHost } from './rules.ts'

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
}

/** Request and output limits for fixed MySQL catalogue queries. */
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

declare module '@deepseek-ai/cordis' {
  interface Context { /** Configured MySQL bindings with mandatory target admission. */ mysqlAudit: MysqlAuditService }
}

const accountPart = (length: number) => z.string().min(1).max(length).refine(value => !value.includes('@') && !value.includes('\0'))
const configSchema = z.object({
  databases: z.array(z.object({
    name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/u), hostname: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(3306),
    database: z.string().min(1).max(64).refine(value => !value.includes('\0')),
    username: accountPart(32), accountHost: accountPart(255), passwordRef: z.string(),
    tlsServerName: z.string().min(1).optional(), caPem: z.string().max(131072).optional(),
  }).strict()).min(1),
  timeoutMs: z.number().int().min(1).max(300000).default(30000),
  maxRows: z.number().int().min(1).max(10000).default(1000),
  maxResultBytes: z.number().int().min(256).max(16777216).default(1048576),
  maxPending: z.number().int().min(1).max(64).default(4),
}).strict()

/** Fixed read-only queries over verified TLS, with endpoint admission and revocation. */
export default class MysqlAuditService extends Service {
  static inject = ['targetProtection', 'credentials']
  static Config: schema<Config> = schema.object({
    databases: schema.array(schema.object({
      name: schema.string().required(), hostname: schema.string().required(), port: schema.natural().default(3306),
      database: schema.string().required(), username: schema.string().required(), accountHost: schema.string().required(),
      passwordRef: schema.string().required(), tlsServerName: schema.string(), caPem: schema.string(),
    })).required(),
    timeoutMs: schema.natural().default(30000), maxRows: schema.natural().default(1000),
    maxResultBytes: schema.natural().default(1048576), maxPending: schema.natural().default(4),
  })
  private readonly config: z.output<typeof configSchema>
  private readonly protection: TargetProtection
  private readonly credentials: CredentialProvider
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<MysqlAudit>>()

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
   * Audit one bound database using executor-owned catalogue statements.
   * @param name - Configured binding name.
   * @param signal - Request cancellation.
   * @returns Verified identity and bounded table metadata.
   */
  inspect(name: string, signal: AbortSignal): Promise<MysqlAudit> {
    if (this.pending.size >= this.config.maxPending) return Promise.reject(new HarnessError('MySQL audit capacity is full.', 'MYSQL_BUSY'))
    const operation = this.run(name, signal)
    this.pending.add(operation)
    return operation.finally(() => { this.pending.delete(operation) })
  }

  private async run(name: string, caller: AbortSignal): Promise<MysqlAudit> {
    const binding = this.config.databases.find(item => item.name === name)
    if (binding === undefined) throw new HarnessError('Choose a configured MySQL binding.', 'MYSQL_DATABASE_UNKNOWN')
    const tlsName = binding.tlsServerName ?? binding.hostname
    const signal = AbortSignal.any([caller, this.lifetime.signal, this.protection.executionSignal()])
    using timeout = deadline(signal, this.config.timeoutMs, 'MYSQL_TIMEOUT')
    const release = this.protection.retainExecution()
    let socket: Socket | undefined, client: mysql.Connection | undefined, closed: Promise<undefined> | undefined
    let resolution: TargetConnectionResolution | undefined
    let abort: (() => void) | undefined
    const admitted = async (hostname = binding.hostname): Promise<void> => {
      const decision = await this.protection.checkConnection(hostname, binding.port, resolution,
        'endpoint', 'observe', timeout.signal, binding.database)
      if (!decision.allowed) throw new HarnessError(TARGET_REFUSAL_REASONS[decision.code], decision.code)
      timeout.signal.throwIfAborted()
    }
    try {
      await admitted()
      if (tlsName !== binding.hostname) await admitted(tlsName)
      const target = await this.protection.resolveConnectionTarget(binding.hostname, timeout.signal)
      const address = target.addresses[0]
      if (address === undefined) throw new HarnessError('MySQL target did not resolve.', 'TARGET_IDENTITY_UNVERIFIED')
      resolution = { ...target, names: [...target.names, tlsName], addresses: [address] }
      const password = await this.credentials.resolve(credentialRef(binding.passwordRef))
      if (password === undefined || password.value === '') {
        throw new HarnessError('MySQL credential reference is not configured.', 'MYSQL_CREDENTIAL_UNAVAILABLE')
      }
      await admitted()
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
      const query = async (sql: string, parameters?: number[]): Promise<unknown> => {
        await admitted()
        const [rows] = await Promise.race([
          parameters === undefined ? connection.query(sql) : connection.execute(sql, parameters),
          cancelled.promise,
        ])
        await admitted()
        return rows
      }
      await query('SET SESSION TRANSACTION READ ONLY')
      await query('START TRANSACTION READ ONLY')
      const identity = z.tuple([z.tuple([z.string(), z.string(), z.string(), z.union([z.literal(1), z.literal('1')])])])
        .parse(await query('SELECT DATABASE(), CURRENT_USER(), VERSION(), @@session.transaction_read_only'))[0]
      if (identity[0] !== binding.database || identity[1] !== `${binding.username}@${binding.accountHost}`) {
        throw new HarnessError('MySQL database or authenticated account differs from the configured binding.', 'MYSQL_IDENTITY_MISMATCH')
      }
      const cipher = z.tuple([z.tuple([z.literal('Ssl_cipher'), z.string().min(1)])])
        .parse(await query("SHOW SESSION STATUS LIKE 'Ssl_cipher'"))[0][1]
      const rows = z.array(z.tuple([z.string(), z.string(), z.string().nullable()])).parse(await query(
        'SELECT TABLE_NAME,TABLE_TYPE,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME LIMIT ?',
        [this.config.maxRows + 1],
      ))
      await query('ROLLBACK')
      const report = { database: identity[0], account: identity[1], serverVersion: identity[2], tlsCipher: cipher,
        tables: rows.map(([name, kind, engine]) => ({ name, kind, engine })) }
      if (rows.length > this.config.maxRows || Buffer.byteLength(JSON.stringify(report)) > this.config.maxResultBytes) {
        throw new HarnessError('MySQL audit exceeded its configured result limit.', 'MYSQL_OUTPUT_LIMIT')
      }
      return report
    } catch (error) {
      if (timeout.signal.aborted) throw new HarnessError('MySQL audit was cancelled or timed out.', 'MYSQL_CANCELLED', { cause: error })
      if (error instanceof HarnessError) throw error
      throw new HarnessError('MySQL audit failed. Check the endpoint, credential reference and TLS configuration.', 'MYSQL_AUDIT_FAILED', { cause: error })
    } finally {
      if (abort !== undefined) timeout.signal.removeEventListener('abort', abort)
      try {
        try { client?.destroy() }
        finally { socket?.destroy(); await closed }
      } finally { release() }
    }
  }
}
