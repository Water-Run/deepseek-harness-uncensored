/** Transactional reservations shared by local processes, with conservative crash recovery. */
import { randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SpendPauseId, SpendPausedSession, SpendPeriod, SpendPreferences, SpendReservationId, SpendSnapshot } from './types.ts'

/** Integer micro-CNY keeps parallel reservation arithmetic exact. */
export const MICRO_CNY = 1_000_000
/** Durable ledger schema; newer files are rejected instead of reset. */
export const SCHEMA_VERSION = 2
/** Fixed rolling periods exposed by the product. */
export const SPEND_PERIODS: Readonly<Record<SpendPeriod, number>> = { '15m': 900_000, '1h': 3_600_000, '5h': 18_000_000, '1d': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 }
/** Defaults apply only when the independent ledger is first created. */
export const DEFAULT_PREFERENCES: SpendPreferences = { enabled: false, autoResume: false, limits: { '15m': 5, '1h': 15, '5h': 50, '1d': 100, '7d': 500, '30d': 2000 } }
const amount = z.number().finite().min(0.000001).max(1_000_000)
/** Validation for both remote writes and persisted preferences. */
export const preferencesSchema = z.object({ enabled: z.boolean(), autoResume: z.boolean(), limits: z.object({ '15m': amount, '1h': amount, '5h': amount, '1d': amount, '7d': amount, '30d': amount }) })
const settingsSchema = z.object({ preferences: preferencesSchema, paused: z.boolean() })
const entrySchema = z.object({ id: z.string(), owner: z.string(), pid: z.number().int(), time: z.number().int(), reserved: z.number().int().nonnegative(), cost: z.number().int().nonnegative().nullable(), state: z.enum(['pending', 'settled', 'uncertain']) })
const pauseSchema = z.object({ session_id: z.string().min(1), state: z.enum(['waiting', 'blocked']), pid: z.number().int(), updated_at: z.number().int(),
  ticket: z.string().min(1), owner: z.string(), required: z.number().int().nonnegative().safe(),
  manual_only: z.union([z.literal(0), z.literal(1)]),
  claim_owner: z.string().nullable(), claim_pid: z.number().int().nullable() })
type Pause = z.infer<typeof pauseSchema>
/** One recoverable pause claimed exclusively by this ledger handle. */
export interface SpendPauseClaim {
  readonly id: SpendPauseId
  readonly sessionId: SessionId
}
type Entry = z.infer<typeof entrySchema>
type Settings = z.infer<typeof settingsSchema>
/** Admission result; a waiting result has no network or reservation side effects. */
export type SpendAdmission = { kind: 'disabled' } | { kind: 'reserved'; id: SpendReservationId } | { kind: 'waiting'; reason: 'paused' | 'limit' } | { kind: 'too-large' }

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; return true }
}

/**
 * Synchronous SQL transactions exclude other processes during admission and settlement.
 * Pending requests never age out. A dead owner becomes an uncertain charge at recovery time.
 */
export class SpendLedger {
  private readonly owner = randomUUID()
  private closed = false
  private constructor(
    private readonly db: DatabaseSync, private readonly now: () => number, private readonly isAlive: (pid: number) => boolean,
  ) {}

  /**
   * Open an independent ledger; malformed or unsupported data fails without resetting totals.
   * @param path - Local SQLite filename, or :memory: for isolated tests.
   * @param now - Wall clock used for rolling windows.
   * @param isAlive - Local process liveness check; permission failures count as alive.
   * @returns An owned handle; callers must drain requests before closing it.
   */
  static async open(path: string, now = Date.now, isAlive = alive): Promise<SpendLedger> {
    const file = path === ':memory:' ? path : resolve(path)
    if (file !== ':memory:') {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 })
      try { const handle = await open(file, 'wx', 0o600); await handle.close() }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    const db = new DatabaseSync(file)
    try {
      db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL')
      const version = z.object({ user_version: z.number() }).parse(db.prepare('PRAGMA user_version').get()).user_version
      if (!Number.isInteger(version) || version < 0 || version > SCHEMA_VERSION) throw new Error(`spend-limit: unsupported ledger version ${version}`)
      const ledger = new SpendLedger(db, now, isAlive)
      ledger.transaction(() => {
        db.exec('CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL) STRICT')
        db.exec("CREATE TABLE IF NOT EXISTS charges (id TEXT PRIMARY KEY, owner TEXT NOT NULL, pid INTEGER NOT NULL, time INTEGER NOT NULL, reserved INTEGER NOT NULL CHECK(reserved >= 0), cost INTEGER, state TEXT NOT NULL CHECK(state IN ('pending', 'settled', 'uncertain'))) STRICT")
        db.exec('CREATE INDEX IF NOT EXISTS charges_time ON charges(time)')
        db.exec("CREATE TABLE IF NOT EXISTS session_pauses (session_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('waiting', 'blocked')), pid INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT")
        if (version < 2) {
          db.exec("ALTER TABLE session_pauses ADD COLUMN ticket TEXT NOT NULL DEFAULT ''; ALTER TABLE session_pauses ADD COLUMN owner TEXT NOT NULL DEFAULT ''; ALTER TABLE session_pauses ADD COLUMN required INTEGER NOT NULL DEFAULT 0; ALTER TABLE session_pauses ADD COLUMN manual_only INTEGER NOT NULL DEFAULT 1; ALTER TABLE session_pauses ADD COLUMN claim_owner TEXT; ALTER TABLE session_pauses ADD COLUMN claim_pid INTEGER")
          const legacy = z.array(pauseSchema.pick({ session_id: true, state: true, pid: true, updated_at: true }))
            .parse(db.prepare('SELECT session_id, state, pid, updated_at FROM session_pauses').all())
          for (const row of legacy) db.prepare("UPDATE session_pauses SET ticket = ?, state = 'blocked' WHERE session_id = ?").run(randomUUID(), row.session_id)
        }
        db.prepare('INSERT OR IGNORE INTO preferences VALUES (1, ?)').run(JSON.stringify({ preferences: DEFAULT_PREFERENCES, paused: false }))
        ledger.settings()
        ledger.pauseRows()
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
      })
      return ledger
    } catch (error) { db.close(); throw error }
  }

  private transaction<T>(operation: () => T): T {
    if (this.closed) throw new Error('spend-limit: ledger is closed')
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = operation(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  private settings(): Settings {
    const row = z.object({ value: z.string() }).parse(this.db.prepare('SELECT value FROM preferences WHERE id = 1').get())
    return settingsSchema.parse(JSON.parse(row.value))
  }

  private writeSettings(value: Settings): void {
    this.db.prepare('UPDATE preferences SET value = ? WHERE id = 1').run(JSON.stringify(value))
  }

  private entries(time: number): Entry[] {
    this.db.prepare("DELETE FROM charges WHERE state != 'pending' AND time <= ?").run(time - SPEND_PERIODS['30d'])
    const entries = z.array(entrySchema).parse(this.db.prepare('SELECT * FROM charges').all())
    for (const entry of entries) {
      if (entry.state !== 'pending' || entry.owner === this.owner || this.isAlive(entry.pid)) continue
      this.db.prepare("UPDATE charges SET state = 'uncertain', cost = reserved, time = ? WHERE id = ?").run(time, entry.id)
      entry.state = 'uncertain'; entry.cost = entry.reserved; entry.time = time
    }
    return entries
  }

  private pauseRows(): Pause[] {
    return z.array(pauseSchema).parse(this.db.prepare('SELECT * FROM session_pauses').all())
  }

  private pauses(time: number): SpendPausedSession[] {
    const rows = this.pauseRows()
    return rows.map((row) => {
      if (row.state === 'waiting' && row.owner !== this.owner && !this.isAlive(row.pid)) {
        this.db.prepare("UPDATE session_pauses SET state = 'blocked', updated_at = ? WHERE session_id = ?").run(time, row.session_id)
        return { sessionId: brandString<SessionId>(row.session_id), state: 'blocked' as const }
      }
      return { sessionId: brandString<SessionId>(row.session_id), state: row.state }
    }).sort((left, right) => left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0)
  }

  private snapshotAt(time: number, settings: Settings, entries: Entry[], waiting: number): SpendSnapshot {
    let nextExpiry: number | null = null
    const windows = (Object.entries(SPEND_PERIODS) as [SpendPeriod, number][]).map(([period, duration]) => {
      let spent = 0, reserved = 0, uncertain = 0
      for (const entry of entries) {
        if (entry.state === 'pending') { reserved += entry.reserved; continue }
        if (entry.time <= time - duration) continue
        const cost = entry.cost ?? entry.reserved
        spent += cost
        if (entry.state === 'uncertain') uncertain += cost
        nextExpiry = Math.min(nextExpiry ?? Infinity, entry.time + duration)
      }
      const limit = settings.preferences.limits[period]
      return { period, limit, spent: spent / MICRO_CNY, reserved: reserved / MICRO_CNY, uncertain: uncertain / MICRO_CNY,
        remaining: Math.max(0, Math.round(limit * MICRO_CNY) - spent - reserved) / MICRO_CNY }
    })
    return { preferences: settings.preferences, paused: settings.paused, windows, pending: entries.filter(entry => entry.state === 'pending').length, waiting, pausedSessions: this.pauses(time), nextExpiry, updatedAt: time }
  }

  /**
   * Read current rolling totals and recover dead owners.
   * @param waiting - Locally queued requests.
   * @returns Totals read in one transaction.
   */
  snapshot(waiting = 0): SpendSnapshot {
    return this.transaction(() => { const time = this.now(); return this.snapshotAt(time, this.settings(), this.entries(time), waiting) })
  }

  /**
   * Reserve before dispatch. No-auto-resume exhaustion latches until resume, reset, or disable.
   * @param microCny - Conservative maximum request estimate, in integer micro-CNY.
   * @returns The committed reservation or a reason not to dispatch.
   */
  reserve(microCny: number): SpendAdmission {
    if (!Number.isSafeInteger(microCny) || microCny < 0) throw new Error('spend-limit: invalid reservation amount')
    return this.transaction(() => {
      const settings = this.settings()
      if (!settings.preferences.enabled) return { kind: 'disabled' }
      const time = this.now(), snapshot = this.snapshotAt(time, settings, this.entries(time), 0)
      if (snapshot.windows.some(window => microCny > Math.round(window.limit * MICRO_CNY))) return { kind: 'too-large' }
      if (settings.paused) return { kind: 'waiting', reason: 'paused' }
      if (snapshot.windows.some(window => microCny > Math.round(window.remaining * MICRO_CNY))) {
        const exhausted = snapshot.windows.some(window =>
          Math.round(window.spent * MICRO_CNY) + microCny > Math.round(window.limit * MICRO_CNY))
        if (!settings.preferences.autoResume && exhausted) this.writeSettings({ ...settings, paused: true })
        return { kind: 'waiting', reason: 'limit' }
      }
      const id = randomUUID() as SpendReservationId
      this.db.prepare("INSERT INTO charges VALUES (?, ?, ?, ?, ?, NULL, 'pending')").run(id, this.owner, process.pid, time, microCny)
      return { kind: 'reserved', id }
    })
  }

  /**
   * Settle once. Missing complete usage retains the reservation; observed overruns pause admission.
   * @param id - Reservation issued by this handle.
   * @param microCny - Complete reported cost estimate; null denotes unknown final usage.
   */
  settle(id: SpendReservationId, microCny: number | null): void {
    if (microCny !== null && (!Number.isSafeInteger(microCny) || microCny < 0)) throw new Error('spend-limit: invalid settlement amount')
    this.transaction(() => {
      const entry = entrySchema.parse(this.db.prepare('SELECT * FROM charges WHERE id = ? AND owner = ?').get(id, this.owner))
      if (entry.state !== 'pending') throw new Error('spend-limit: reservation already settled')
      this.db.prepare('UPDATE charges SET cost = ?, state = ?, time = ? WHERE id = ?').run(microCny ?? entry.reserved, microCny === null ? 'uncertain' : 'settled', this.now(), id)
      if (microCny !== null && microCny > entry.reserved) this.writeSettings({ ...this.settings(), paused: true })
    })
  }

  /**
   * Commit user limits without discarding any charges.
   * @param value - Complete validated preferences.
   * @returns Preferences after durable commit.
   */
  configure(value: SpendPreferences): SpendSnapshot {
    const preferences = preferencesSchema.parse(value)
    this.transaction(() => {
      const current = this.settings()
      this.writeSettings({ preferences, paused: preferences.enabled && !preferences.autoResume ? current.paused : false })
    })
    return this.snapshot()
  }

  /**
   * Persist a real conversation request only after spending admission makes it wait.
   * @param sessionId - Conversation whose current request is waiting.
   * @param required - Original reservation requirement in micro-CNY.
   * @returns Stable pause identity used for exclusive recovery and replay deduplication.
   */
  waitForSession(sessionId: SessionId, required: number): SpendPauseId {
    if (!Number.isSafeInteger(required) || required < 0) throw new Error('spend-limit: invalid pause reservation')
    return this.transaction(() => {
      const existing = this.pauseRows().find(row => row.session_id === sessionId)
      if (existing?.state === 'waiting' && this.isAlive(existing.pid)) throw new Error('spend-limit: conversation already has an admission waiter')
      const id = brandString<SpendPauseId>(randomUUID())
      this.db.prepare(`INSERT INTO session_pauses (session_id, state, pid, updated_at, ticket, owner, required, manual_only, claim_owner, claim_pid)
        VALUES (?, 'waiting', ?, ?, ?, ?, ?, 0, NULL, NULL)
        ON CONFLICT(session_id) DO UPDATE SET state = excluded.state, pid = excluded.pid, updated_at = excluded.updated_at,
        ticket = excluded.ticket, owner = excluded.owner, required = excluded.required, manual_only = 0, claim_owner = NULL, claim_pid = NULL`)
        .run(sessionId, process.pid, this.now(), id, this.owner, required)
      return id
    })
  }

  /**
   * Retain an owned admission waiter for recovery after shutdown.
   * @param id - Owned waiter interrupted by application shutdown.
   */
  blockSession(id: SpendPauseId): void {
    this.transaction(() => { this.db.prepare("UPDATE session_pauses SET state = 'blocked', updated_at = ? WHERE ticket = ? AND owner = ?").run(this.now(), id, this.owner) })
  }

  /**
   * Drop a conversation pause after admission, cancellation, or deletion.
   * @param sessionId - Conversation that no longer needs continuation.
   * @param id - When present, clear only this exact waiting request.
   */
  clearSession(sessionId: SessionId, id?: SpendPauseId): void {
    this.transaction(() => {
      if (id === undefined) this.db.prepare('DELETE FROM session_pauses WHERE session_id = ?').run(sessionId)
      else this.db.prepare('DELETE FROM session_pauses WHERE session_id = ? AND ticket = ?').run(sessionId, id)
    })
  }

  /**
   * Claim blocked conversations whose original reservation fits the remaining windows.
   * Records remain durable until acknowledged; another process may reclaim only a dead claim owner.
   * @returns Exclusive claims; callers must complete or release each one.
   */
  claimBlockedSessions(): SpendPauseClaim[] {
    return this.transaction(() => {
      const settings = this.settings()
      if (settings.paused) return []
      const time = this.now()
      const snapshot = this.snapshotAt(time, settings, this.entries(time), 0)
      const claims: SpendPauseClaim[] = []
      const pauses = this.pauseRows()
      if (settings.preferences.enabled && !settings.preferences.autoResume && pauses.some(row => row.state === 'blocked' && row.manual_only === 0
        && snapshot.windows.some(window => Math.round(window.spent * MICRO_CNY) + row.required > Math.round(window.limit * MICRO_CNY)))) {
        this.writeSettings({ ...settings, paused: true })
        return []
      }
      for (const row of pauses) {
        if (row.state !== 'blocked' || row.manual_only === 1 || row.claim_owner === this.owner
          || (row.claim_pid !== null && this.isAlive(row.claim_pid))) continue
        if (settings.preferences.enabled
          && snapshot.windows.some(window => Math.round(window.remaining * MICRO_CNY) < row.required)) continue
        this.db.prepare('UPDATE session_pauses SET claim_owner = ?, claim_pid = ? WHERE ticket = ?').run(this.owner, process.pid, row.ticket)
        claims.push({ id: brandString<SpendPauseId>(row.ticket), sessionId: brandString<SessionId>(row.session_id) })
      }
      return claims
    })
  }

  /**
   * Remove an acknowledged claim only while this handle still owns it.
   * @param id - Claim whose continuation was accepted or whose session was deleted.
   */
  completeClaim(id: SpendPauseId): void {
    this.transaction(() => { this.db.prepare('DELETE FROM session_pauses WHERE ticket = ? AND claim_owner = ?').run(id, this.owner) })
  }

  /**
   * Release an owned claim without discarding the pause or a newer replacement.
   * @param id - Claim that could not continue and must remain available for retry.
   */
  releaseClaim(id: SpendPauseId): void {
    this.transaction(() => { this.db.prepare('UPDATE session_pauses SET claim_owner = NULL, claim_pid = NULL WHERE ticket = ? AND claim_owner = ?').run(id, this.owner) })
  }

  /** Clear the manual pause without bypassing any remaining window limit. */
  resume(): void { this.transaction(() => { this.writeSettings({ ...this.settings(), paused: false }); this.db.exec('UPDATE session_pauses SET manual_only = 0') }) }

  /** Reset completed statistics while preserving every active request reservation. */
  reset(): void {
    this.transaction(() => { this.entries(this.now()); this.db.exec("DELETE FROM charges WHERE state != 'pending'"); this.writeSettings({ ...this.settings(), paused: false }) })
  }

  /** Retain unsettled owned requests as uncertain charges, then release the database. */
  close(): void {
    if (this.closed) return
    try { this.transaction(() => {
      this.db.prepare("UPDATE charges SET state = 'uncertain', cost = reserved, time = ? WHERE owner = ? AND state = 'pending'").run(this.now(), this.owner)
      this.db.prepare("UPDATE session_pauses SET state = 'blocked' WHERE owner = ? AND state = 'waiting'").run(this.owner)
      this.db.prepare('UPDATE session_pauses SET claim_owner = NULL, claim_pid = NULL WHERE claim_owner = ?').run(this.owner)
    }) }
    finally { this.closed = true; this.db.close() }
  }
}
