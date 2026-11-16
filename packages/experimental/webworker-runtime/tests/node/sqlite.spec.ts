/** Real SQLite transactions, binary persistence, and failure containment in a mounted VFS. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeSqlite } from '../../src/node/sqlite-engine.ts'
import { DatabaseSync } from '../../src/node/builtin_modules/implemented/sqlite.ts'
import { MemoryVfs } from '../../src/storage/memory.ts'
import { setActiveVfs } from '../../src/storage/active.ts'

let vfs: MemoryVfs
const handles: DatabaseSync[] = []
function open(path = '/db/test.sqlite', options: import('node:sqlite').DatabaseSyncOptions = {}): DatabaseSync {
  const db = new DatabaseSync(path, options)
  handles.push(db)
  return db
}

beforeAll(async () => { await initializeSqlite() })
beforeEach(() => {
  vfs = new MemoryVfs()
  vfs.mkdirSync('/db', { recursive: true })
  setActiveVfs(vfs)
})
afterEach(() => {
  vi.restoreAllMocks()
  for (const db of handles.splice(0)) {
    if (db.isOpen) {
      try { db.close() } catch (error) {
        // Failed storage remains poisoned, but close must still release the engine handle.
        expect(db.isOpen, String(error)).toBe(false)
      }
    }
  }
})

describe('Worker SQLite', () => {
  it('commits real SQLite bytes, rolls back transactions, and reopens the VFS database', () => {
    const db = open()
    db.exec('CREATE TABLE costs(id INTEGER PRIMARY KEY, amount REAL NOT NULL CHECK(amount >= 0)) STRICT')
    expect(db.prepare('INSERT INTO costs(amount) VALUES(?)').run(2.5)).toEqual({ changes: 1, lastInsertRowid: 1 })
    db.exec('BEGIN IMMEDIATE; INSERT INTO costs(amount) VALUES(9); SAVEPOINT sample; INSERT INTO costs(amount) VALUES(3); ROLLBACK TO sample; RELEASE sample')
    expect(db.isTransaction).toBe(true)
    db.exec('ROLLBACK')
    expect(db.isTransaction).toBe(false)
    expect(() => db.prepare('INSERT INTO costs(amount) VALUES(?)').run(-1)).toThrow(/CHECK/u)
    const bytes = vfs.readFileSync('/db/test.sqlite')
    expect(bytes).toBeInstanceOf(Uint8Array)
    if (!(bytes instanceof Uint8Array)) throw new Error('SQLite database bytes were not returned')
    expect(new TextDecoder().decode(bytes.slice(0, 16))).toBe('SQLite format 3\0')
    db.close()
    const reopened = open()
    expect(reopened.prepare('SELECT id,amount FROM costs').all()).toEqual([{ id: 1, amount: 2.5 }])
    reopened.exec('BEGIN; INSERT INTO costs(amount) VALUES(7)')
    reopened.close()
    expect(open().prepare('SELECT count(*) AS count FROM costs').get()).toEqual({ count: 1 })
  })

  it('runs FTS5 queries and preserves binary values without sharing WASM memory', () => {
    const db = open(':memory:')
    db.exec('CREATE VIRTUAL TABLE notes USING fts5(body); CREATE TABLE blobs(data BLOB)')
    db.prepare('INSERT INTO notes(body) VALUES(?)').run('critical parser observation')
    expect(db.prepare('SELECT body FROM notes WHERE notes MATCH ?').get('parser')).toEqual({ body: 'critical parser observation' })
    const bytes = new Uint8Array([0, 128, 255])
    db.prepare('INSERT INTO blobs VALUES(?)').run(bytes)
    const row = db.prepare('SELECT data FROM blobs').get()
    expect(row).toEqual({ data: bytes })
    expect(Array.isArray(row)).toBe(false)
    if (row !== undefined && !Array.isArray(row) && row.data instanceof Uint8Array) row.data[0] = 9
    expect(db.prepare('SELECT data FROM blobs').get()).toEqual({ data: bytes })
  })

  it('binds mixed and numbered parameters, rejects unknown keys, and honors statement defaults', () => {
    const db = open(':memory:')
    expect(db.prepare('SELECT @x a, ? b').get({ x: 1 }, 2)).toEqual({ a: 1, b: 2 })
    expect(db.prepare('SELECT ?2 a').get(3, 4)).toEqual({ a: 4 })
    const stmt = db.prepare('SELECT @x a')
    expect(() => stmt.get({ missing: 3 })).toThrow(/Unknown/u)
    stmt.setAllowUnknownNamedParameters(true)
    expect(stmt.get({ missing: 3 })).toEqual({ a: null })
    const configured = open(':memory:', { returnArrays: true, readBigInts: true, allowBareNamedParameters: false })
    expect(configured.prepare('SELECT @x').get({ '@x': 4 })).toEqual([4n])
    expect(() => configured.prepare('SELECT @x').get({ x: 4 })).toThrow(/Unknown/u)
    expect(stmt.expandedSQL).toContain('NULL')
  })

  it('checks number precision and returns exact bigint rows and change counts when selected', () => {
    const db = open(':memory:')
    const stmt = db.prepare('SELECT 9223372036854775807 AS value')
    expect(() => stmt.get()).toThrow(expect.objectContaining({ code: 'ERR_OUT_OF_RANGE' }))
    stmt.setReadBigInts(true)
    expect(stmt.get()).toEqual({ value: 9223372036854775807n })
    db.exec('CREATE TABLE values_table(value INTEGER)')
    const insert = db.prepare('INSERT INTO values_table VALUES(?)')
    insert.setReadBigInts(true)
    expect(insert.run(9223372036854775807n)).toEqual({ changes: 1n, lastInsertRowid: 1n })
    expect(db.prepare('INSERT INTO values_table VALUES(2) RETURNING 9223372036854775807').run()).toEqual({ changes: 1, lastInsertRowid: 2 })
    expect(db.prepare('SELECT value FROM values_table WHERE 0').get()).toBeUndefined()
  })

  it('shares one physical database across live connections and preserves committed sibling changes', () => {
    const first = open()
    first.exec('CREATE TABLE entries(value INTEGER); INSERT INTO entries VALUES(1)')
    const second = open()
    first.exec('BEGIN IMMEDIATE; INSERT INTO entries VALUES(2)')
    expect(second.prepare('SELECT count(*) AS count FROM entries').get()).toEqual({ count: 1 })
    first.exec('COMMIT')
    expect(second.prepare('SELECT count(*) AS count FROM entries').get()).toEqual({ count: 2 })
    first.close()
    second.exec('INSERT INTO entries VALUES(3)')
    second.close()
    expect(open().prepare('SELECT value FROM entries ORDER BY value').all()).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }])
  })

  it('does not rewrite read-only files and supports reopening after a closed-file rename', () => {
    const writable = open()
    writable.exec('CREATE TABLE entries(value INTEGER); INSERT INTO entries VALUES(1)')
    writable.close()
    const before = vfs.readFileSync('/db/test.sqlite')
    const writes = vi.spyOn(vfs, 'writeFileSync')
    const readOnly = open('/db/test.sqlite', { readOnly: true })
    readOnly.exec('SELECT * FROM entries')
    expect(() => { readOnly.exec('INSERT INTO entries VALUES(2)') }).toThrow(/readonly/u)
    readOnly.close()
    expect(vfs.readFileSync('/db/test.sqlite')).toEqual(before)
    expect(writes).not.toHaveBeenCalled()
    vfs.renameSync('/db/test.sqlite', '/db/renamed.sqlite')
    expect(open('/db/renamed.sqlite').prepare('SELECT * FROM entries').get()).toEqual({ value: 1 })
  })

  it('rejects external replacement before SQL and leaves the replacement untouched', () => {
    const db = open()
    db.exec('CREATE TABLE entries(value INTEGER)')
    const replacement = new Uint8Array([1, 2, 3])
    vfs.writeFileSync('/db/test.sqlite', replacement)
    expect(() => db.prepare('SELECT * FROM entries')).toThrow(/no longer trusted/u)
    expect(() => { db.exec('INSERT INTO entries VALUES(1)') }).toThrow(/no longer trusted/u)
    expect(vfs.readFileSync('/db/test.sqlite')).toEqual(replacement)
  })

  it('blocks all sibling connections after publishing committed bytes fails', () => {
    const first = open()
    first.exec('CREATE TABLE entries(value INTEGER)')
    const second = open()
    vi.spyOn(vfs, 'writeFileSync').mockImplementationOnce(() => { throw Object.assign(new Error('disk write failed'), { code: 'EIO' }) })
    expect(() => { first.exec('INSERT INTO entries VALUES(1)') }).toThrow(/could not commit/u)
    expect(() => second.prepare('SELECT * FROM entries')).toThrow(/could not commit/u)
  })

  it('denies attached files and VACUUM INTO through SQLite authorization', () => {
    const db = open()
    db.exec('CREATE TABLE entries(value INTEGER)')
    expect(() => { db.exec("ATTACH DATABASE '/outside.sqlite' AS outside") }).toThrow(expect.objectContaining({ resultCode: 23 }))
    expect(() => { db.exec("VACUUM INTO '/outside.sqlite'") }).toThrow(expect.objectContaining({ resultCode: 23 }))
    expect(vfs.existsSync('/outside.sqlite')).toBe(false)
    expect('setAuthorizer' in db).toBe(false)
  })

  it('supports deferred open and disposal, and rejects SQL on a closed handle', () => {
    const db = open(':memory:', { open: false })
    expect(db.isOpen).toBe(false)
    expect(() => db.prepare('SELECT 1')).toThrow(/closed/u)
    db.open()
    expect(db.location()).toBeNull()
    expect(() => { db.open() }).toThrow(/already open/u)
    db[Symbol.dispose]()
    db[Symbol.dispose]()
    expect(() => { db.close() }).toThrow(/closed/u)
  })
})
