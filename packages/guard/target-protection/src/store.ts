/** Atomic, versioned target settings shared across local processes. @module */
import type { DatabaseSync } from 'node:sqlite'
import { mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { TargetProtectionError } from './errors.ts'
import { parseTargetPreferences } from './rules.ts'
import type { TargetPreferences, TargetSnapshot } from './types.ts'

/** On-disk format; successors must use a larger value. */
export const SCHEMA_VERSION = 2
/** SQLite application identifier for this registry, ASCII DSTP. */
const APPLICATION_ID = 0x44535450
const rowSchema = z.object({ revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), value: z.string() })

/** One database owner. Reads return newly parsed committed state rather than a process-local cache. */
export class TargetStore {
  private closed = false
  private constructor(private readonly db: DatabaseSync) {}

  /**
   * Open an explicitly selected store. Only an empty database is initialized.
   * @param filename - Deployment-owned registry path or :memory: for tests.
   * @param busyTimeoutMs - Bounded SQLite lock wait in milliseconds.
   * @returns Owned store, or an error without resetting existing settings.
   */
  static async open(filename: string, busyTimeoutMs: number): Promise<TargetStore> {
    const path = filename === ':memory:' ? filename : resolve(filename)
    if (path !== ':memory:') {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      try { const file = await open(path, 'wx', 0o600); await file.close() }
      catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error
      }
    }
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path, { timeout: busyTimeoutMs })
    const store = new TargetStore(db)
    try {
      store.transaction(() => {
        const version = z.object({ user_version: z.number().int() }).parse(db.prepare('PRAGMA user_version').get()).user_version
        const application = z.object({ application_id: z.number().int() }).parse(db.prepare('PRAGMA application_id').get()).application_id
        if (version !== 0 && version !== 1 && version !== SCHEMA_VERSION) {
          throw new TargetProtectionError('unsupported-version', `Unsupported target registry version ${String(version)}.`)
        }
        if (version === 0) {
          const tables = db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
          if (application !== 0 || tables.length !== 0) throw new TargetProtectionError('unrecognized-store', 'The selected database is not an empty target registry.')
          db.exec('CREATE TABLE preferences (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, value TEXT NOT NULL) STRICT')
          db.prepare('INSERT INTO preferences VALUES(1, 1, ?)').run(JSON.stringify({ mainlandEnabled: true, rules: [] }))
          db.exec(`PRAGMA application_id=${String(APPLICATION_ID)}; PRAGMA user_version=${String(SCHEMA_VERSION)}`)
        } else if (application !== APPLICATION_ID) {
          throw new TargetProtectionError('unrecognized-store', 'The database belongs to a different application.')
        }
        const snapshot = store.snapshot()
        if (version === 1) {
          if (snapshot.preferences.rules.some(rule => rule.match === 'path')) {
            throw new TargetProtectionError('unavailable', 'A version 1 target registry cannot contain path rules.')
          }
          db.exec(`PRAGMA user_version=${String(SCHEMA_VERSION)}`)
        }
      })
      return store
    } catch (error) {
      store.close()
      if (error instanceof TargetProtectionError) throw error
      throw new TargetProtectionError('unavailable', 'The target registry could not be opened.', { cause: error })
    }
  }

  private transaction<T>(operation: () => T): T {
    this.assertOpen()
    this.db.exec('BEGIN IMMEDIATE')
    try { const value = operation(); this.db.exec('COMMIT'); return value }
    catch (error) {
      try { this.db.exec('ROLLBACK') }
      catch (rollbackError) {
        this.close()
        throw new TargetProtectionError('unavailable', 'Registry rollback failed; this connection is closed.',
          { cause: new AggregateError([error, rollbackError], 'Target registry transaction failed') })
      }
      throw error
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new TargetProtectionError('unavailable', 'The target registry is closed.')
  }

  /**
   * Read the latest committed revision and validate every stored rule.
   * @returns A fresh settings value; failures never produce default allow rules.
   */
  snapshot(): TargetSnapshot {
    this.assertOpen()
    try {
      const row = rowSchema.parse(this.db.prepare('SELECT revision, value FROM preferences WHERE id=1').get())
      return { revision: row.revision, preferences: parseTargetPreferences(JSON.parse(row.value)) }
    } catch (error) {
      throw new TargetProtectionError('unavailable', 'Target settings could not be read; execution requires a valid registry.', { cause: error })
    }
  }

  /**
   * Validate and atomically replace the settings after a revision check.
   * @param preferences - Complete owner-selected rules.
   * @param expectedRevision - Revision read by the editing caller.
   * @returns The committed successor; concurrent or invalid changes do not overwrite settings.
   */
  configure(preferences: TargetPreferences, expectedRevision: number): TargetSnapshot {
    const value = parseTargetPreferences(preferences)
    return this.transaction(() => {
      const current = this.snapshot()
      if (current.revision !== expectedRevision) throw new TargetProtectionError('conflict', 'Target settings changed; reload before saving.')
      if (current.revision >= Number.MAX_SAFE_INTEGER) throw new TargetProtectionError('unavailable', 'Target settings revision is exhausted.')
      this.db.prepare('UPDATE preferences SET revision=revision+1, value=? WHERE id=1').run(JSON.stringify(value))
      return this.snapshot()
    })
  }

  /** Release the owned SQLite handle; repeated calls are harmless. */
  close(): void { if (!this.closed) { this.db.close(); this.closed = true } }
}
