/** Private, single-request SQLite executor. The owner alone authorizes transaction commit. */
import { DatabaseSync, constants as C } from 'node:sqlite'
import { createInterface } from 'node:readline'
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]()
let db, committed = false, refusal
const send = value => process.stdout.write(JSON.stringify(value) + '\n')
try {
  const first = await lines.next()
  if (first.done) throw new Error('missing request')
  const input = JSON.parse(first.value)
  if (typeof input.path !== 'string' || typeof input.readOnly !== 'boolean' || !Array.isArray(input.statements)
    || !Number.isSafeInteger(input.maxRows) || input.maxRows < 1 || !Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1
    || !Number.isSafeInteger(input.heapBytes) || input.heapBytes < 1048576
    || !Number.isSafeInteger(input.busyMs) || input.busyMs < 0) throw new Error('invalid request')
  if (typeof DatabaseSync.prototype.setAuthorizer !== 'function') throw Object.assign(new Error('unsupported runtime'), { code: 'SQLITE_RUNTIME_UNAVAILABLE' })
  db = new DatabaseSync(input.path, { readOnly: input.readOnly, allowExtension: false, enableDoubleQuotedStringLiterals: false, timeout: input.busyMs })
  db.exec(`PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA hard_heap_limit=${input.heapBytes}`)
  let administrative = true
  const pure = new Set([C.SQLITE_SELECT, C.SQLITE_READ, C.SQLITE_RECURSIVE])
  const writes = new Set([C.SQLITE_CREATE_INDEX, C.SQLITE_CREATE_TABLE, C.SQLITE_CREATE_TEMP_INDEX, C.SQLITE_CREATE_TEMP_TABLE,
    C.SQLITE_CREATE_TEMP_TRIGGER, C.SQLITE_CREATE_TEMP_VIEW, C.SQLITE_CREATE_TRIGGER, C.SQLITE_CREATE_VIEW,
    C.SQLITE_DELETE, C.SQLITE_DROP_INDEX, C.SQLITE_DROP_TABLE, C.SQLITE_DROP_TEMP_INDEX, C.SQLITE_DROP_TEMP_TABLE,
    C.SQLITE_DROP_TEMP_TRIGGER, C.SQLITE_DROP_TEMP_VIEW, C.SQLITE_DROP_TRIGGER, C.SQLITE_DROP_VIEW, C.SQLITE_INSERT,
    C.SQLITE_UPDATE, C.SQLITE_ALTER_TABLE, C.SQLITE_REINDEX, C.SQLITE_ANALYZE, C.SQLITE_CREATE_VTABLE, C.SQLITE_DROP_VTABLE])
  // Only stock connection functions exist: no application UDFs or dynamic extensions are registered.
  const functions = new Set(db.prepare('PRAGMA function_list').all().filter(row =>
    !['load_extension', 'fts3_tokenizer', 'sqlite_log'].includes(row.name)).map(row => row.name))
  const pragmas = new Set(['table_info', 'table_xinfo', 'index_list', 'index_info', 'index_xinfo', 'foreign_key_list',
    'database_list', 'data_version', 'compile_options', 'collation_list', 'function_list', 'module_list', 'pragma_list', 'integrity_check', 'quick_check', 'foreign_key_check'])
  db.setAuthorizer((action, firstArg, secondArg) => {
    if (administrative && action === C.SQLITE_TRANSACTION) return C.SQLITE_OK
    if (pure.has(action)) return C.SQLITE_OK
    if (action === C.SQLITE_FUNCTION && functions.has(secondArg)) return C.SQLITE_OK
    if (action === C.SQLITE_PRAGMA && pragmas.has(firstArg)) return C.SQLITE_OK
    if (writes.has(action) && !input.readOnly) return C.SQLITE_OK
    refusal = writes.has(action) ? 'SQLITE_READ_ONLY' : 'SQLITE_OPERATION_UNSUPPORTED'
    return C.SQLITE_DENY
  })
  db.exec('BEGIN'); administrative = false
  send({ phase: 'executing' })
  const results = []
  let rowCount = 0, bytes = 0
  const encode = value => typeof value === 'bigint' ? (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Number(value) : { integer: String(value) }) : value instanceof Uint8Array ? { blob: Buffer.from(value).toString('base64') }
    : typeof value === 'number' && !Number.isFinite(value) ? { real: String(value) } : value
  for (const item of input.statements) {
    if (typeof item.sql !== 'string' || !Array.isArray(item.parameters)
      || !item.parameters.every(value => value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))) throw new Error('invalid statement')
    const statement = db.prepare(item.sql)
    if (statement.sourceSQL.trim() !== item.sql.trim()) throw Object.assign(new Error('multiple statements'), { code: 'SQLITE_MULTIPLE_STATEMENTS' })
    statement.setReadBigInts(true); statement.setReturnArrays(true)
    const columns = statement.columns().map(column => column.name), rows = []
    for (const row of statement.iterate(...item.parameters)) {
      const values = row.map(encode)
      bytes += Buffer.byteLength(JSON.stringify(values))
      if (++rowCount > input.maxRows || bytes > input.maxBytes) throw Object.assign(new Error('output limit'), { code: 'SQLITE_OUTPUT_LIMIT' })
      rows.push(values)
    }
    bytes += Buffer.byteLength(JSON.stringify(columns))
    if (bytes > input.maxBytes) throw Object.assign(new Error('output limit'), { code: 'SQLITE_OUTPUT_LIMIT' })
    results.push({ columns, rows })
  }
  if (Buffer.byteLength(JSON.stringify({ phase: 'prepared', results })) > input.maxBytes) {
    throw Object.assign(new Error('output limit'), { code: 'SQLITE_OUTPUT_LIMIT' })
  }
  send({ phase: 'prepared', results })
  const answer = await lines.next()
  if (answer.done || JSON.parse(answer.value).commit !== true) throw new Error('commit not authorized')
  administrative = true; db.exec('COMMIT'); committed = true; db.close(); db = undefined
  send({ phase: 'committed' })
} catch (error) {
  let rolledBack = db === undefined && !committed
  if (db !== undefined) {
    try { db.setAuthorizer(null); if (db.isTransaction) db.exec('ROLLBACK'); db.close(); rolledBack = !committed }
    catch (_cleanupError) { /* An unconfirmed native cleanup is reported as an unknown outcome below. */ }
  }
  const allowed = new Set(['SQLITE_RUNTIME_UNAVAILABLE', 'SQLITE_MULTIPLE_STATEMENTS', 'SQLITE_OUTPUT_LIMIT'])
  send({ phase: 'failed', code: rolledBack ? (refusal ?? (allowed.has(error.code) ? error.code : 'SQLITE_QUERY_REFUSED')) : 'SQLITE_OUTCOME_UNKNOWN', rolledBack })
} finally { process.stdin.destroy() }
