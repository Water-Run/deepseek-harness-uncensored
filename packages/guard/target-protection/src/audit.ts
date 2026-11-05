/** Bounded persistent records of protected execution admission. @module */
import { createHmac, randomBytes } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TargetProtectionError } from './errors.ts'

const applicationId = 0x44535441
const schemaVersion = 2
const sessionIdSchema = z.string().min(1).transform(value => brandString<SessionId>(value))
const operationSchema = z.enum(['http', 'proxy-http', 'connection', 'file', 'unconfined', 'http-dns', 'connection-dns'])
const effectSchema = z.enum(['observe', 'mutate', 'unknown', 'unconfined', 'metadata', 'read', 'list', 'watch'])
const recordSchema = z.object({
  at: z.number().int().nonnegative(), revision: z.number().int().positive().nullable(),
  operation: operationSchema, effect: effectSchema, phase: z.enum(['preflight', 'execution']),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u).nullable(), peerFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  decision: z.enum(['allow', 'deny', 'cancelled', 'error']),
  code: z.enum(['TARGET_FULLY_PROTECTED', 'TARGET_READ_ONLY', 'TARGET_IDENTITY_UNVERIFIED', 'TARGET_MAINLAND_PROTECTED',
    'TARGET_OWNER_RESOURCE', 'TARGET_EXECUTION_UNCONFINED', 'TARGET_CHECK_CANCELLED', 'TARGET_SETTINGS_CHANGED',
    'TARGET_CHECK_FAILED', 'TARGET_RESOLUTION_FAILED', 'TARGET_CHECK_TIMEOUT']).nullable(),
  ruleIds: z.array(z.uuid()).max(64), matchedRules: z.number().int().nonnegative(),
  source: z.object({ sessionId: sessionIdSchema, parentSessionId: sessionIdSchema.optional() }).strict().optional(),
}).strict()

/** Typed audit outcome. A fingerprint is keyed to the local audit store and carries no raw target. */
export type TargetAuditRecord = z.infer<typeof recordSchema>

/** Stable row identity within its owning audit database. */
export type TargetAuditId = Branded<'TargetAuditId'>

/** One persisted check with its database-assigned identity. */
export type TargetAuditEntry = TargetAuditRecord & { id: TargetAuditId }

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Redacted execution admission recorded by the optional target audit owner; never model-visible. */
    'target/admission': TargetAuditEntry
  }
}

/** Latest accepted audit records, newest first. */
export interface TargetAuditHistory {
  state: 'off' | 'ready' | 'unavailable'
  entries: TargetAuditEntry[]
}

/** One internal audit subject. Raw inputs exist only long enough to fingerprint them. */
export interface AuditSubject {
  operation: TargetAuditRecord['operation']
  effect: TargetAuditRecord['effect']
  phase: TargetAuditRecord['phase']
  identity?: readonly (string | number | undefined)[]
  peers?: readonly string[]
}

type Outcome = Pick<TargetAuditRecord, 'revision' | 'decision' | 'code'> & { ruleIds: readonly string[] }

/** Independent SQLite owner so an audit write never upgrades the rule registry's read lease. */
export class TargetAuditStore {
  private constructor(private readonly db: DatabaseSync, private readonly secret: Buffer, private readonly limit: number) {}

  /**
   * Open or initialize a dedicated audit database without overwriting other SQLite files.
   * @param path - Deployment-owned file, separate from the rule registry.
   * @param busyTimeoutMs - Bounded lock wait.
   * @param limit - Maximum records retained across all writers.
   * @returns An owned audit database with its stable fingerprint key.
   */
  static async open(path: string, busyTimeoutMs: number, limit: number): Promise<TargetAuditStore> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    try { const file = await open(path, 'wx', 0o600); await file.close() }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path, { timeout: busyTimeoutMs })
    try {
      db.exec('BEGIN IMMEDIATE')
      const application = z.object({ application_id: z.number() }).parse(db.prepare('PRAGMA application_id').get()).application_id
      const version = z.object({ user_version: z.number() }).parse(db.prepare('PRAGMA user_version').get()).user_version
      const empty = application === 0 && version === 0
        && db.prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get() === undefined
      if (empty) {
        db.exec(`CREATE TABLE audit_identity (id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL) STRICT;
          CREATE TABLE admission (id INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT NOT NULL) STRICT;
          PRAGMA application_id=${applicationId}; PRAGMA user_version=${schemaVersion}`)
        db.prepare('INSERT INTO audit_identity VALUES(1, ?)').run(randomBytes(32).toString('hex'))
      } else if (application !== applicationId || (version !== 1 && version !== schemaVersion)) {
        throw new TargetProtectionError('unrecognized-store', 'The selected database is not a supported target audit store.')
      }
      if (version === 1) db.exec(`PRAGMA user_version=${schemaVersion}`)
      const identity = db.prepare('SELECT secret FROM audit_identity WHERE id=1').get()
      const key = z.object({ secret: z.string().regex(/^[a-f0-9]{64}$/u) }).parse(identity)
      db.exec('COMMIT')
      return new TargetAuditStore(db, Buffer.from(key.secret, 'hex'), limit)
    } catch (error) { db.close(); throw error }
  }

  /**
   * Persist one decision and remove records beyond the retention limit in the same transaction.
   * @param subject - Execution stage and identities to fingerprint.
   * @param outcome - Stable rule decision or redacted check failure.
   * @param source - Exact initiating Session and its recorded parent; absent for agentless calls.
   * @returns The committed redacted entry, including its database identity.
   */
  append(subject: AuditSubject, outcome: Outcome, source?: TargetAuditRecord['source']): TargetAuditEntry {
    const fingerprint = (identity: readonly (string | number | undefined)[]) =>
      createHmac('sha256', this.secret).update(JSON.stringify(identity)).digest('hex')
    const { operation, effect, phase, identity, peers } = subject
    const record = recordSchema.parse({ at: Date.now(), operation, effect, phase, ...outcome, ...source === undefined ? {} : { source },
      fingerprint: identity === undefined ? null : fingerprint(identity),
      peerFingerprint: peers === undefined ? null : fingerprint(['peers', ...new Set(peers.toSorted())]),
      ruleIds: outcome.ruleIds.slice(0, 64), matchedRules: outcome.ruleIds.length })
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const insert = this.db.prepare('INSERT INTO admission(record) VALUES(?)')
      insert.setReadBigInts(true)
      const { lastInsertRowid } = insert.run(JSON.stringify(record))
      this.db.prepare('DELETE FROM admission WHERE id <= ?').run(BigInt(lastInsertRowid) - BigInt(this.limit))
      this.db.exec('COMMIT')
      return { ...record, id: brandString<TargetAuditId>(lastInsertRowid.toString()) }
    } catch (error) {
      try { this.db.exec('ROLLBACK') }
      catch (rollback) { throw new AggregateError([error, rollback], 'Target audit transaction failed.') }
      throw error
    }
  }

  /** @returns Up to 100 verified audit records, newest first. */
  recent(): TargetAuditEntry[] {
    const statement = this.db.prepare('SELECT id, record FROM admission ORDER BY id DESC LIMIT 100')
    statement.setReadBigInts(true)
    return statement.all()
      .map(row => ({ ...recordSchema.parse(JSON.parse(z.string().parse(row.record))),
        id: brandString<TargetAuditId>(z.bigint().positive().parse(row.id).toString()) }))
  }

  /** Release the local SQLite connection. */
  close(): void { this.db.close() }
}
