/** SQLite-backed Node compatibility for the Worker's virtual filesystem. */
import type { DatabaseSyncOptions, SQLInputValue, SQLOutputValue, StatementResultingChanges } from 'node:sqlite'
import type { Database, PreparedStatement, SqlValue } from '@sqlite.org/sqlite-wasm'
import { requireActiveVfs } from '../../../storage/active.ts'
import type { Vfs } from '../../../storage/types.ts'
import { normalize } from '../../../module-system/posix-path.ts'
import { sqliteEngine } from '../../sqlite-engine.ts'
import { notAvailableError } from '../../notImplementedFail.ts'

type Row = Record<string, SQLOutputValue>
type Bind = SQLInputValue | Record<string, SQLInputValue>
interface Store {
  readonly vfs: Vfs
  path: string
  readonly physical: string
  readonly inode: number
  version: string
  handles: number
  failure?: Error
}
const stores = new WeakMap<Vfs, Map<number, Store>>()
let sequence = 0

function version(vfs: Vfs, path: string): string {
  const stat = vfs.statSync(path, { bigint: true })
  if (!('mtimeNs' in stat)) throw invalid('SQLite requires bigint filesystem timestamps')
  return `${String(stat.ino)}:${String(stat.size)}:${String(stat.mtimeNs)}:${String(stat.ctimeNs)}`
}

function unavailable(member: string): never { throw notAvailableError('node:sqlite', member) }
function invalid(message: string): Error { return Object.assign(new Error(message), { code: 'ERR_INVALID_STATE' }) }
function pointer(handle: Database | PreparedStatement): number {
  if (handle.pointer === undefined) throw invalid('SQLite handle is closed')
  return handle.pointer
}

function input(value: SQLInputValue): SqlValue {
  if (value !== null && typeof value === 'object') return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return value
}

/** A synchronous connection whose committed bytes are reflected in the active VFS. */
export class DatabaseSync {
  private database: Database | undefined
  private store: Store | undefined
  private dirty = false
  private readonly path: string
  private readonly options: DatabaseSyncOptions

  /**
   * Resolve one virtual filename and open it unless deferred explicitly.
   * @param path - POSIX VFS filename or :memory:.
   * @param options - Native SQLite options supported by this platform.
   */
  constructor(path: string, options: DatabaseSyncOptions = {}) {
    this.path = path === ':memory:' ? path : normalize(path.startsWith('/') ? path : `${process.cwd()}/${path}`)
    this.options = options
    if (options.allowExtension || options.enableDoubleQuotedStringLiterals) unavailable('native extensions or double-quoted string literals')
    if (options.open !== false) this.open()
  }

  /** Whether this connection is open. */
  get isOpen(): boolean { return this.database?.isOpen() === true }
  /** Whether this connection owns an unfinished transaction. */
  get isTransaction(): boolean { return sqliteEngine().capi.sqlite3_get_autocommit(pointer(this.connection())) === 0 }

  /** Open a deferred connection, preserving any existing database bytes. */
  open(): void {
    if (this.isOpen) throw invalid('SQLite connection is already open')
    const engine = sqliteEngine()
    let physical = ':memory:'
    if (this.path !== ':memory:') {
      const vfs = requireActiveVfs()
      if (!vfs.existsSync(this.path) && !this.options.readOnly) vfs.writeFileSync(this.path, new Uint8Array(), { flag: 'wx', mode: 0o600 })
      const inode = Number(vfs.statSync(this.path).ino)
      const registry = stores.get(vfs) ?? new Map<number, Store>()
      stores.set(vfs, registry)
      let store = registry.get(inode)
      if (store === undefined) {
        store = { vfs, inode, path: this.path, physical: `/dshu-sqlite-${String(++sequence)}.db`, handles: 0, version: version(vfs, this.path) }
        registry.set(inode, store)
      }
      if (store.failure !== undefined) throw store.failure
      if (store.handles > 0 && store.path !== this.path) throw invalid('Opening an aliased live SQLite database is unavailable')
      if (store.handles === 0) {
        const bytes = vfs.readFileSync(this.path)
        if (!(bytes instanceof Uint8Array)) throw invalid('SQLite VFS reads must return database bytes')
        engine.capi.sqlite3_js_posix_create_file(store.physical, bytes)
        store.path = this.path
        store.version = version(vfs, this.path)
      }
      this.store = store
      physical = store.physical
    }
    const database = new engine.oo1.DB(physical, this.options.readOnly ? 'r' : 'c')
    try {
      const result = engine.capi.sqlite3_set_authorizer(pointer(database), (_data, action) =>
        action === engine.capi.SQLITE_ATTACH || action === engine.capi.SQLITE_DETACH ? engine.capi.SQLITE_DENY : engine.capi.SQLITE_OK, 0)
      if (result !== engine.capi.SQLITE_OK) throw invalid('SQLite VFS file isolation could not be installed')
      engine.capi.sqlite3_commit_hook(pointer(database), () => { this.dirty = true; return 0 }, 0)
      database.exec(`PRAGMA foreign_keys=${this.options.enableForeignKeyConstraints === false ? 'OFF' : 'ON'}`)
      engine.capi.sqlite3_busy_timeout(pointer(database), this.options.timeout ?? 0)
    } catch (error) { database.close(); throw error }
    this.database = database
    if (this.store !== undefined) this.store.handles += 1
  }

  /**
   * Read the open engine handle, rejecting externally changed or failed storage.
   * @returns The connection owned by this instance.
   */
  connection(): Database {
    if (this.database === undefined || !this.database.isOpen()) throw invalid('SQLite connection is closed')
    const store = this.store
    if (store?.failure !== undefined) throw store.failure
    if (store !== undefined) {
      try {
        if (version(store.vfs, store.path) !== store.version) throw invalid('SQLite database changed outside its open connections')
      } catch (cause) {
        store.failure = Object.assign(new Error('SQLite VFS state is no longer trusted; restart the Worker before further SQL', { cause }), { code: 'ERR_SQLITE_ERROR' })
        throw store.failure
      }
    }
    return this.database
  }

  /** Publish completed transactions synchronously; a failed write poisons all sibling handles. */
  persist(): void {
    const store = this.store
    if (!this.dirty || store === undefined || this.database?.isOpen() !== true) return
    if (store.failure !== undefined) throw store.failure
    if (sqliteEngine().capi.sqlite3_get_autocommit(pointer(this.database)) === 0) return
    try {
      this.connection()
      const bytes = sqliteEngine().capi.sqlite3_js_db_export(pointer(this.database))
      store.vfs.writeFileSync(store.path, bytes)
      store.version = version(store.vfs, store.path)
      this.dirty = false
    } catch (cause) {
      store.failure = Object.assign(new Error('SQLite could not commit its VFS bytes; further SQL is blocked', { cause }), { code: 'ERR_SQLITE_ERROR' })
      throw store.failure
    }
  }

  /**
   * Execute SQL with real SQLite transaction and constraint behavior.
   * @param sql - SQL text, including multiple statements.
   */
  exec(sql: string): void {
    const database = this.connection()
    try { database.exec(sql) } finally { this.persist() }
  }

  /**
   * Validate one SQL statement without executing it.
   * @param sql - SQL statement to bind and execute later.
   * @returns An owned statement facade.
   */
  prepare(sql: string): StatementSync { return new StatementSync(this, sql, this.options) }

  /**
   * Report the virtual main-database path.
   * @param name - Database schema; attached database files are unavailable.
   * @returns The virtual path, or null for an in-memory database.
   */
  location(name = 'main'): string | null {
    this.connection()
    if (name !== 'main') unavailable('attached database locations')
    return this.path === ':memory:' ? null : this.path
  }

  /** Close the handle, rolling back any pending transaction and releasing cached file bytes. */
  close(): void {
    const database = this.database
    if (database === undefined || !database.isOpen()) throw invalid('SQLite connection is closed')
    try {
      if (sqliteEngine().capi.sqlite3_get_autocommit(pointer(database)) === 0) database.exec('ROLLBACK')
      this.persist()
    } finally {
      database.close()
      this.database = undefined
      const store = this.store
      if (store !== undefined && --store.handles === 0) sqliteEngine().capi.sqlite3_js_posix_create_file(store.physical, new Uint8Array())
    }
  }

  /** Release an open connection once. */
  [Symbol.dispose](): void { if (this.isOpen) this.close() }
  /**
   * Refuse loading native extensions.
   * @returns Never; native extensions cannot run here.
   */
  loadExtension(): never { return unavailable('loadExtension') }
  /**
   * Refuse enabling native extensions.
   * @returns Never; native extensions cannot run here.
   */
  enableLoadExtension(): never { return unavailable('enableLoadExtension') }
  /**
   * Refuse JavaScript SQL function registration.
   * @returns Never; registration is unsupported.
   */
  function(): never { return unavailable('function') }
  /**
   * Refuse JavaScript SQL aggregate registration.
   * @returns Never; registration is unsupported.
   */
  aggregate(): never { return unavailable('aggregate') }
  /**
   * Refuse native changeset sessions.
   * @returns Never; changeset sessions are unsupported.
   */
  createSession(): never { return unavailable('createSession') }
  /**
   * Refuse applying native changesets.
   * @returns Never; applying changesets is unsupported.
   */
  applyChangeset(): never { return unavailable('applyChangeset') }
}

/** A re-executable statement with scoped native statement allocation. */
export class StatementSync {
  private readBigInts = false
  private arrays = false
  private bareNames = true
  private unknownNames = false
  private expanded: string
  /** Original statement text supplied to prepare. */
  readonly sourceSQL: string

  /**
   * Validate SQL against an open connection without retaining an engine statement.
   * @param owner - Connection responsible for transaction persistence.
   * @param sql - SQL source.
   */
  constructor(private readonly owner: DatabaseSync, sql: string, options: DatabaseSyncOptions = {}) {
    this.readBigInts = options.readBigInts ?? false
    this.arrays = options.returnArrays ?? false
    this.bareNames = options.allowBareNamedParameters ?? true
    this.unknownNames = options.allowUnknownNamedParameters ?? false
    const statement = owner.connection().prepare(sql)
    try { this.sourceSQL = sql; this.expanded = sqliteEngine().capi.sqlite3_expanded_sql(pointer(statement)) }
    finally { statement.finalize() }
  }

  /** SQL expanded with the most recent bindings. */
  get expandedSQL(): string { return this.expanded }
  /**
   * Select int64 output instead of checked number output.
   * @param enabled - Whether integer columns return bigint.
   */
  setReadBigInts(enabled: boolean): void { this.readBigInts = enabled }
  /**
   * Select array rows instead of named records.
   * @param enabled - Whether result rows are arrays.
   */
  setReturnArrays(enabled: boolean): void { this.arrays = enabled }
  /**
   * Allow unprefixed object keys for named SQL parameters.
   * @param enabled - Whether bare names are accepted.
   */
  setAllowBareNamedParameters(enabled: boolean): void { this.bareNames = enabled }
  /**
   * Ignore object keys that are absent from the SQL.
   * @param enabled - Whether unknown named parameters are ignored.
   */
  setAllowUnknownNamedParameters(enabled: boolean): void { this.unknownNames = enabled }

  private bind(statement: PreparedStatement, args: readonly Bind[]): void {
    const [first, ...rest] = args
    const named = first !== null && typeof first === 'object' && !ArrayBuffer.isView(first)
    if (named) {
      for (const [key, value] of Object.entries(first)) {
        const matches: number[] = []
        for (let index = 1; index <= statement.parameterCount; index += 1) {
          const name = sqliteEngine().capi.sqlite3_bind_parameter_name(pointer(statement), index)
          if (name === key || (this.bareNames && name?.slice(1) === key)) matches.push(index)
        }
        if (matches.length > 1) throw invalid(`Ambiguous SQLite parameter: ${key}`)
        if (matches[0] === undefined) { if (!this.unknownNames) throw invalid(`Unknown SQLite parameter: ${key}`) }
        else statement.bind(matches[0], input(value))
      }
    }
    let index = 1
    for (const value of named ? rest : args) {
      while (named && index <= statement.parameterCount
        && sqliteEngine().capi.sqlite3_bind_parameter_name(pointer(statement), index) !== null) index += 1
      if (value !== null && typeof value === 'object' && !ArrayBuffer.isView(value)) throw invalid('Unexpected SQLite parameter object')
      statement.bind(index++, input(value))
    }
    this.expanded = sqliteEngine().capi.sqlite3_expanded_sql(pointer(statement))
  }

  private row(statement: PreparedStatement): Row | SQLOutputValue[] {
    const engine = sqliteEngine()
    const values: SQLOutputValue[] = []
    for (let index = 0; index < statement.columnCount; index += 1) {
      let value = statement.get(index)
      if (engine.capi.sqlite3_column_type(pointer(statement), index) === engine.capi.SQLITE_INTEGER) {
        if (this.readBigInts) value = engine.capi.sqlite3_column_int64(pointer(statement), index)
        else if (typeof value === 'bigint') throw Object.assign(new RangeError('SQLite integer exceeds the safe number range'), { code: 'ERR_OUT_OF_RANGE' })
      }
      if (value instanceof ArrayBuffer) value = new Uint8Array(value)
      if (value instanceof Int8Array) value = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      values.push(value instanceof Uint8Array ? value.slice() : value)
    }
    if (this.arrays) return values
    const row: Row = {}
    Object.setPrototypeOf(row, null)
    for (const [index, value] of values.entries()) row[statement.getColumnName(index)] = value
    return row
  }

  /**
   * Stream rows while retaining the engine statement until completion or return.
   * @param args - Optional named values followed by anonymous values.
   * @returns A finalizable iterator of rows.
   */
  *iterate(...args: Bind[]): Generator<Row | SQLOutputValue[]> {
    const statement = this.owner.connection().prepare(this.sourceSQL)
    try {
      this.bind(statement, args)
      while (true) {
        this.owner.connection()
        if (!statement.step()) break
        yield this.row(statement)
      }
    } finally { statement.finalize(); this.owner.persist() }
  }

  /**
   * Execute and collect every result row.
   * @param args - Optional named values followed by anonymous values.
   * @returns All rows.
   */
  all(...args: Bind[]): (Row | SQLOutputValue[])[] { return [...this.iterate(...args)] }
  /**
   * Execute and read the first result row.
   * @param args - Optional named values followed by anonymous values.
   * @returns The first row, or undefined.
   */
  get(...args: Bind[]): Row | SQLOutputValue[] | undefined {
    const rows = this.iterate(...args)
    try { const result = rows.next(); return result.done ? undefined : result.value } finally { rows.return(undefined) }
  }
  /**
   * Execute SQL and return its change counts.
   * @param args - Optional named values followed by anonymous values.
   * @returns SQLite's affected-row count and last row id.
   */
  run(...args: Bind[]): StatementResultingChanges {
    const statement = this.owner.connection().prepare(this.sourceSQL)
    try {
      this.bind(statement, args)
      while (statement.step()) { /* Ignore RETURNING columns, as Node's run() does. */ }
    } finally { statement.finalize(); this.owner.persist() }
    const database = this.owner.connection()
    const changes = sqliteEngine().capi.sqlite3_changes(pointer(database))
    const lastInsertRowid = sqliteEngine().capi.sqlite3_last_insert_rowid(pointer(database))
    return {
      changes: this.readBigInts ? BigInt(changes) : changes,
      lastInsertRowid: this.readBigInts ? lastInsertRowid : Number(lastInsertRowid),
    }
  }
}

/**
 * Refuse native file backups in the browser runtime.
 * @returns Never; the requested capability is unavailable.
 */
export function backup(): never { return unavailable('backup') }
/** CommonJS namespace marker used by the image module loader. */
export const __esModule = true
/** Node module export identity for CommonJS callers. */
export default { DatabaseSync, StatementSync, backup }
