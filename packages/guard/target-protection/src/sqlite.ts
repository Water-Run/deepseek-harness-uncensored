/** Transactional SQLite access through an owned, engine-authorized native helper. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { deadline } from '@deepseek-ai/dsh-timeout'
import type TargetProtection from './index.ts'
import { canonicalLocalPath } from './file-identity.ts'
import { TARGET_REFUSAL_REASONS } from './network-decision.ts'

const statement = z.object({ sql: z.string().min(1),
  parameters: z.array(z.union([z.string(), z.number(), z.null()])).default([]) }).strict()
const requestSchema = z.object({ statements: z.array(statement).min(1).max(100), readOnly: z.boolean().default(false) }).strict()
const cell = z.union([z.string(), z.number(), z.null(), z.object({ integer: z.string().regex(/^-?\d+$/u) }).strict(),
  z.object({ real: z.enum(['Infinity', '-Infinity', 'NaN']) }).strict(),
  z.object({ blob: z.string() }).strict()])
const resultsSchema = z.array(z.object({ columns: z.array(z.string()), rows: z.array(z.array(cell)) }).strict())
const responseSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('executing') }).strict(),
  z.object({ phase: z.literal('prepared'), results: resultsSchema }).strict(),
  z.object({ phase: z.literal('committed') }).strict(),
  z.object({ phase: z.literal('failed'), code: z.enum(['SQLITE_RUNTIME_UNAVAILABLE', 'SQLITE_MULTIPLE_STATEMENTS', 'SQLITE_OUTPUT_LIMIT',
    'SQLITE_QUERY_REFUSED', 'SQLITE_READ_ONLY', 'SQLITE_OPERATION_UNSUPPORTED', 'SQLITE_OUTCOME_UNKNOWN']), rolledBack: z.boolean() }).strict(),
])

/** Explicit local database bindings and per-request limits. */
export interface Config {
  databases: { name: string; path: string }[]
  timeoutMs?: number
  busyTimeoutMs?: number
  maxRows?: number
  maxResultBytes?: number
  maxInputBytes?: number
  heapBytes?: number
  graceMs?: number
  maxPending?: number
}
/** Parameterized statements execute together; readOnly can narrow but never widen owner protection. */
export type SqliteRequest = z.input<typeof requestSchema>
/** Ordered columns preserve duplicate names; large integers and blobs use lossless tagged values. */
export type SqliteResult = z.infer<typeof resultsSchema>

/**
 * Validate a tool or wire request before native execution.
 * @param input - Untrusted statement and permission fields.
 * @returns Validated statements and permission narrowing.
 */
export function parseSqliteRequest(input: unknown): z.output<typeof requestSchema> { return requestSchema.parse(input) }

declare module '@deepseek-ai/cordis' {
  interface Context { /** Explicitly bound and protected local SQLite databases. */ sqliteDatabase: SqliteDatabase }
}

/** Optional structured database executor; no raw SQL can attach another file or control commit. */
export default class SqliteDatabase extends Service {
  static inject = ['targetProtection']
  static Config = schema.object({
    databases: schema.array(schema.object({ name: schema.string().required(), path: schema.string().required() })).required(),
    timeoutMs: schema.natural().min(1).max(300000).default(30000), busyTimeoutMs: schema.natural().max(30000).default(1000),
    maxRows: schema.natural().min(1).max(100000).default(1000), maxResultBytes: schema.natural().min(256).max(16777216).default(1048576),
    maxInputBytes: schema.natural().min(1).max(1048576).default(65536),
    heapBytes: schema.natural().min(1048576).max(536870912).default(67108864), graceMs: schema.natural().min(1).max(30000).default(1000),
    maxPending: schema.natural().min(1).max(64).default(4),
  })
  private readonly config: Required<Config>
  private readonly protection: TargetProtection
  private readonly native = new Context()
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly readyState = Promise.withResolvers<void>()
  private readonly quarantined = new Set<() => void>()

  /** @param ctx - Owner with mandatory target rules. @param config - Existing local database bindings and limits. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'sqliteDatabase')
    if (!('setAuthorizer' in DatabaseSync.prototype)) throw new HarnessError('SQLite execution requires a Node runtime with setAuthorizer.', 'SQLITE_RUNTIME_UNAVAILABLE')
    this.config = SqliteDatabase.Config(config)
    const names = new Set<string>()
    for (const database of this.config.databases) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/u.test(database.name) || names.has(database.name)) throw new Error('SQLite bindings require unique names containing letters, numbers, _ or -.')
      names.add(database.name); database.path = canonicalLocalPath(database.path)
    }
    this.protection = ctx.targetProtection
    void this.readyState.promise.catch((_error: unknown) => { /* Service activation reports this failure. */ })
    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('SQLite executor is stopping'))
      await Promise.allSettled(this.pending)
      await this.native.fiber.dispose()
      for (const release of this.quarantined) release()
      this.quarantined.clear()
    }, 'target-sqlite.lifetime')
  }

  protected async [Service.init](): Promise<void> {
    try { await this.native.plugin(LocalSubprocessRuntime); this.readyState.resolve() }
    catch (error) { this.readyState.reject(error); throw error }
  }

  /**
   * Return owner-configured names without file or credential paths.
   * @returns Configured database names.
   */
  names(): string[] { return this.config.databases.map(database => database.name) }

  /**
   * Execute an atomic batch against one configured database with engine-level authorization.
   * @param name - Owner-configured database name.
   * @param request - One or more parameterized statements; transaction and cross-file control are unsupported.
   * @param signal - Caller cancellation; after commit authorization, native completion still owns cleanup.
   * @returns Bounded rows after confirmed commit; unknown outcomes reject and must not be replayed automatically.
   */
  execute(name: string, request: SqliteRequest, signal: AbortSignal): Promise<SqliteResult> {
    if (this.pending.size >= this.config.maxPending) return Promise.reject(new HarnessError('SQLite request capacity is full; wait for active work.', 'SQLITE_BUSY'))
    const operation = this.run(name, request, signal)
    this.pending.add(operation)
    return operation.finally(() => { this.pending.delete(operation) })
  }

  private async run(name: string, raw: SqliteRequest, signal: AbortSignal): Promise<SqliteResult> {
    const database = this.config.databases.find(database => database.name === name)
    if (database === undefined) throw new HarnessError('Choose a configured SQLite database.', 'SQLITE_DATABASE_UNKNOWN')
    const request = requestSchema.parse(raw)
    if (Buffer.byteLength(JSON.stringify(request)) > this.config.maxInputBytes) throw new HarnessError('SQLite request exceeds its input limit.', 'SQLITE_INPUT_LIMIT')
    const ordinary = AbortSignal.any([signal, this.lifetime.signal, this.protection.executionSignal()])
    using timer = deadline(undefined, this.config.timeoutMs, 'SQLITE_TIMEOUT')
    const bounded = AbortSignal.any([ordinary, timer.signal])
    await this.readyState.promise; bounded.throwIfAborted()
    const release = this.protection.retainExecution()
    let unlock: (() => void) | undefined, handle: SubprocessHandle | undefined
    let detachInput: (() => void) | undefined
    let nativeClosed = true, committing = false
    try {
      const before = await this.admit(database.path, bounded)
      const info = await stat(before.path, { bigint: true })
      if (!info.isFile()) throw new HarnessError('SQLite binding must identify an existing regular file.', 'SQLITE_DATABASE_INVALID')
      if (info.ino === 0n) throw new HarnessError('SQLite file identity is unavailable.', 'TARGET_IDENTITY_UNVERIFIED')
      const worker = join(dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-target-protection/package.json')), 'assets/sqlite-worker.mjs')
      handle = this.native.subprocess.spawn({ argv: [process.execPath, '--disable-sigusr1', worker], cwd: dirname(before.path),
        stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 2048 } }, graceMs: this.config.graceMs,
        env: { NODE_OPTIONS: undefined, ELECTRON_RUN_AS_NODE: '1' } })
      nativeClosed = false
      void handle.done.catch((_error: unknown) => { /* The operation and finally observe the native result. */ })
      if (handle.stdin === undefined || handle.stdout === undefined) throw new HarnessError('SQLite helper has no protocol streams.', 'SQLITE_HELPER_FAILED')
      const owned = handle
      const inputFailed = (): void => { owned.terminate() }
      handle.stdin.on('error', inputFailed)
      const stdin = handle.stdin
      detachInput = () => { stdin.removeListener('error', inputFailed) }
      const cancel = (): void => { if (!committing) owned.terminate() }
      const timeout = (): void => { owned.terminate() }
      ordinary.addEventListener('abort', cancel, { once: true }); timer.signal.addEventListener('abort', timeout, { once: true })
      const reader = createInterface({ input: handle.stdout, crlfDelay: Infinity })
      try {
        bounded.throwIfAborted()
        const lines = reader[Symbol.asyncIterator]()
        const receive = async () => {
          const next = await lines.next()
          if (next.done) throw new HarnessError('SQLite helper ended without confirming its outcome; inspect the database before retrying.', 'SQLITE_OUTCOME_UNKNOWN')
          if (Buffer.byteLength(next.value) > this.config.maxResultBytes) throw new HarnessError('SQLite output exceeds its limit.', 'SQLITE_OUTPUT_LIMIT')
          const response = responseSchema.parse(JSON.parse(next.value))
          if (response.phase === 'failed') throw new HarnessError(response.rolledBack
            ? 'SQLite statement was refused or failed; its transaction was rolled back. Check the SQL and protection settings.'
            : 'SQLite cleanup could not confirm rollback; inspect the database before retrying.', response.code)
          return response
        }
        handle.stdin.write(JSON.stringify({ path: before.path, readOnly: request.readOnly || before.readOnly,
          statements: request.statements, maxRows: this.config.maxRows, maxBytes: this.config.maxResultBytes,
          heapBytes: this.config.heapBytes, busyMs: this.config.busyTimeoutMs }) + '\n')
        if ((await receive()).phase !== 'executing') throw new HarnessError('SQLite helper did not start execution.', 'SQLITE_HELPER_FAILED')
        const prepared = await receive()
        if (prepared.phase !== 'prepared') throw new HarnessError('SQLite helper returned an invalid phase.', 'SQLITE_HELPER_FAILED')
        bounded.throwIfAborted()
        const final = await this.admit(database.path, bounded)
        const finalInfo = await stat(final.path, { bigint: true })
        if (final.path !== before.path || final.revision !== before.revision || (!request.readOnly && !before.readOnly && final.readOnly)) {
          throw new HarnessError('SQLite target policy changed before commit.', 'SQLITE_POLICY_CHANGED')
        }
        if (finalInfo.dev !== info.dev || finalInfo.ino !== info.ino) throw new HarnessError('SQLite file identity changed before commit.', 'TARGET_IDENTITY_UNVERIFIED')
        unlock = this.protection.retainSnapshot(final.revision)
        bounded.throwIfAborted(); committing = true
        handle.stdin.end('{"commit":true}\n')
        if ((await receive()).phase !== 'committed') throw new HarnessError('SQLite commit was not confirmed.', 'SQLITE_OUTCOME_UNKNOWN')
        const outcome = await handle.done
        if (outcome.exitCode !== 0) throw new HarnessError('SQLite helper did not exit cleanly; inspect the committed database.', 'SQLITE_OUTCOME_UNKNOWN')
        return prepared.results
      } finally {
        ordinary.removeEventListener('abort', cancel); timer.signal.removeEventListener('abort', timeout); reader.close()
      }
    } catch (error) {
      if (committing && !(error instanceof HarnessError && error.code === 'SQLITE_OUTCOME_UNKNOWN')) {
        throw new HarnessError('SQLite commit may have completed; inspect the database before retrying.', 'SQLITE_OUTCOME_UNKNOWN', { cause: error })
      }
      if (!committing && (timer.signal.aborted || ordinary.aborted)) {
        throw new HarnessError(timer.signal.aborted
          ? 'SQLite timed out before commit authorization; reduce the query before retrying. Uncommitted journal recovery may be required.'
          : 'SQLite was cancelled before commit authorization; uncommitted journal recovery may be required.',
        timer.signal.aborted ? 'SQLITE_TIMEOUT' : 'SQLITE_CANCELLED', { cause: error })
      }
      throw error
    } finally {
      if (handle !== undefined) {
        handle.terminate()
        await Promise.allSettled([handle.done])
        try { nativeClosed = await handle.waitForExit() }
        catch (error) { this.ctx.logger.error('SQLite helper exit is unknown; rule resources remain retained: %o', error) }
      }
      const cleanup = (): void => { detachInput?.(); try { unlock?.() } finally { release() } }
      if (nativeClosed) cleanup()
      else {
        this.quarantined.add(cleanup)
        throw new HarnessError('SQLite helper exit is unknown; rule resources remain retained. Restart the Host before retrying.', 'SQLITE_OUTCOME_UNKNOWN')
      }
    }
  }

  private async admit(path: string, signal: AbortSignal) {
    const before = await this.protection.snapshot()
    let canonical = path, readOnly = false
    for (const candidate of [path, `${path}-wal`, `${path}-shm`, `${path}-journal`]) {
      const read = await this.protection.checkLocalFile(candidate, 'read', signal)
      if (!read.decision.allowed) throw new HarnessError(TARGET_REFUSAL_REASONS[read.decision.code], read.decision.code)
      if (candidate === path) canonical = read.path
      const write = await this.protection.checkLocalFile(candidate, 'mutate', signal)
      if (!write.decision.allowed) {
        if (!['TARGET_READ_ONLY', 'TARGET_OWNER_RESOURCE'].includes(write.decision.code)) {
          throw new HarnessError(TARGET_REFUSAL_REASONS[write.decision.code], write.decision.code)
        }
        readOnly = true
      }
    }
    if ((await this.protection.snapshot()).revision !== before.revision) throw new HarnessError('SQLite rules changed during admission.', 'SQLITE_POLICY_CHANGED')
    return { path: canonical, revision: before.revision, readOnly }
  }
}
