import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SessionId } from '@deepseek-ai/dsh-session'
import { DEFAULT_PREFERENCES, MICRO_CNY, SCHEMA_VERSION, SpendLedger } from '../src/ledger.ts'
import type { SpendAdmission } from '../src/ledger.ts'

const handles: SpendLedger[] = []
const directories: string[] = []
afterEach(async () => {
  for (const handle of handles.splice(0)) handle.close()
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function setup(path = ':memory:', now = () => 1000, alive?: (pid: number) => boolean) {
  const ledger = await SpendLedger.open(path, now, alive)
  handles.push(ledger)
  return ledger
}
function reservation(result: SpendAdmission) { if (result.kind !== 'reserved') throw new Error(result.kind); return result.id }
function enable(ledger: SpendLedger, autoResume = true) { ledger.configure({ ...DEFAULT_PREFERENCES, enabled: true, autoResume }) }

it('starts disabled with the six requested limits and no automatic recovery', async () => {
  const ledger = await setup()
  expect(ledger.snapshot().preferences).toEqual(DEFAULT_PREFERENCES)
  expect(ledger.reserve(10 * MICRO_CNY)).toEqual({ kind: 'disabled' })
  expect(ledger.snapshot().pending).toBe(0)
})

it('reserves against all windows and charges only complete reported usage', async () => {
  const ledger = await setup()
  enable(ledger)
  const first = reservation(ledger.reserve(4 * MICRO_CNY))
  expect(ledger.reserve(2 * MICRO_CNY)).toEqual({ kind: 'waiting', reason: 'limit' })
  ledger.settle(first, MICRO_CNY)
  expect(ledger.snapshot().windows[0]).toMatchObject({ spent: 1, reserved: 0, remaining: 4 })
  expect(ledger.reserve(4 * MICRO_CNY).kind).toBe('reserved')
})

it('does not age out active requests and dates settlements at completion', async () => {
  let now = 1000
  const ledger = await setup(':memory:', () => now)
  enable(ledger)
  const id = reservation(ledger.reserve(4 * MICRO_CNY))
  now += 40 * 86400000
  expect(ledger.snapshot().windows.every(window => window.reserved === 4)).toBe(true)
  ledger.settle(id, 2 * MICRO_CNY)
  now += 899999
  expect(ledger.snapshot().windows[0]?.spent).toBe(2)
  now++
  expect(ledger.snapshot().windows[0]?.spent).toBe(0)
  expect(ledger.snapshot().windows[1]?.spent).toBe(2)
})

it('keeps a manual pause after expiry until explicitly resumed', async () => {
  let now = 1000
  const ledger = await setup(':memory:', () => now)
  enable(ledger, false)
  ledger.settle(reservation(ledger.reserve(4 * MICRO_CNY)), 4 * MICRO_CNY)
  expect(ledger.reserve(2 * MICRO_CNY).kind).toBe('waiting')
  now += 900000
  expect(ledger.reserve(2 * MICRO_CNY)).toEqual({ kind: 'waiting', reason: 'paused' })
  ledger.resume()
  expect(ledger.reserve(2 * MICRO_CNY).kind).toBe('reserved')
})

it('waits for pending reservations without latching manual pause', async () => {
  const ledger = await setup()
  enable(ledger, false)
  const first = reservation(ledger.reserve(4 * MICRO_CNY))
  expect(ledger.reserve(2 * MICRO_CNY)).toEqual({ kind: 'waiting', reason: 'limit' })
  expect(ledger.snapshot().paused).toBe(false)
  ledger.settle(first, MICRO_CNY)
  expect(ledger.reserve(2 * MICRO_CNY).kind).toBe('reserved')
})

it('reset preserves active reservations and removes completed uncertain charges', async () => {
  const ledger = await setup()
  enable(ledger)
  const active = reservation(ledger.reserve(MICRO_CNY))
  ledger.settle(reservation(ledger.reserve(2 * MICRO_CNY)), null)
  expect(ledger.snapshot().windows[0]?.uncertain).toBe(2)
  ledger.reset()
  expect(ledger.snapshot().windows[0]).toMatchObject({ spent: 0, reserved: 1 })
  ledger.settle(active, 500000)
  expect(ledger.snapshot().windows[0]).toMatchObject({ spent: 0.5, reserved: 0 })
})

it('shares preferences and atomic admission between independent database connections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-')); directories.push(directory)
  const path = join(directory, 'budget.sqlite')
  const a = await setup(path), b = await setup(path)
  enable(a)
  const id = reservation(a.reserve(3 * MICRO_CNY))
  expect(b.reserve(3 * MICRO_CNY).kind).toBe('waiting')
  a.settle(id, MICRO_CNY)
  expect(b.reserve(3 * MICRO_CNY).kind).toBe('reserved')
  expect(a.snapshot().windows[0]).toMatchObject({ spent: 1, reserved: 3 })
})

it('recovers a dead process conservatively without releasing its unknown charge', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-')); directories.push(directory)
  const path = join(directory, 'budget.sqlite')
  const a = await setup(path), b = await setup(path, () => 2000, () => false)
  enable(a)
  a.reserve(4 * MICRO_CNY)
  expect(b.snapshot().windows[0]).toMatchObject({ spent: 4, uncertain: 4, reserved: 0 })
  expect(b.reserve(2 * MICRO_CNY).kind).toBe('waiting')
})

it('rejects a request that cannot fit even an empty window and pauses on under-reservation', async () => {
  const ledger = await setup()
  enable(ledger)
  expect(ledger.reserve(6 * MICRO_CNY)).toEqual({ kind: 'too-large' })
  expect(ledger.snapshot().paused).toBe(false)
  ledger.settle(reservation(ledger.reserve(MICRO_CNY)), 2 * MICRO_CNY)
  expect(ledger.snapshot().paused).toBe(true)
})

it('keeps a live process waiting and promotes only a dead process to blocked', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-')); directories.push(directory)
  const path = join(directory, 'budget.sqlite')
  const live = await setup(path, () => 1000, pid => pid === process.pid)
  enable(live, false)
  live.waitForSession(SessionId('dead-task'), MICRO_CNY)
  live.waitForSession(SessionId('live-task'), MICRO_CNY)
  const external = new DatabaseSync(path)
  external.prepare('UPDATE session_pauses SET pid = ?, owner = ? WHERE session_id = ?').run(999_999, 'dead-owner', 'dead-task')
  external.close()
  expect(live.snapshot().pausedSessions).toEqual([
    { sessionId: 'dead-task', state: 'blocked' },
    { sessionId: 'live-task', state: 'waiting' },
  ])
  const restarted = await setup(path, () => 1000, () => false)
  expect(restarted.snapshot().pausedSessions).toEqual([
    { sessionId: 'dead-task', state: 'blocked' },
    { sessionId: 'live-task', state: 'blocked' },
  ])
})

it('claims blocked conversations only after the manual pause is clear and a window has room', async () => {
  let now = 1000
  const ledger = await setup(':memory:', () => now)
  enable(ledger, false)
  const pauseId = ledger.waitForSession(SessionId('paused-task'), 2 * MICRO_CNY)
  ledger.blockSession(pauseId)
  ledger.settle(reservation(ledger.reserve(4 * MICRO_CNY)), 4 * MICRO_CNY)
  expect(ledger.reserve(2 * MICRO_CNY)).toEqual({ kind: 'waiting', reason: 'limit' })
  expect(ledger.snapshot().paused).toBe(true)
  expect(ledger.claimBlockedSessions()).toEqual([])
  ledger.resume()
  expect(ledger.claimBlockedSessions()).toEqual([])
  now += 900001
  expect(ledger.claimBlockedSessions()).toEqual([])
  ledger.resume()
  expect(ledger.claimBlockedSessions()).toEqual([{ id: pauseId, sessionId: 'paused-task' }])
  expect(ledger.claimBlockedSessions()).toEqual([])
  expect(ledger.snapshot().pausedSessions).toEqual([{ sessionId: 'paused-task', state: 'blocked' }])
  ledger.completeClaim(pauseId)
  expect(ledger.snapshot().pausedSessions).toEqual([])
})

it('rejects malformed persisted preferences without resetting them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-')); directories.push(directory)
  const path = join(directory, 'budget.sqlite')
  const ledger = await setup(path)
  ledger.close()
  const db = new DatabaseSync(path)
  try { db.prepare('UPDATE preferences SET value = ?').run('{"broken":true}') }
  finally { db.close() }
  await expect(SpendLedger.open(path)).rejects.toThrow()
})

it('retains recovery claims across handles until acknowledgement or owner release', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-claims-')); directories.push(directory)
  const path = join(directory, 'budget.sqlite')
  const first = await setup(path), second = await setup(path)
  const sessionId = SessionId('recover-me')
  const id = first.waitForSession(sessionId, MICRO_CNY)
  first.blockSession(id)
  expect(first.claimBlockedSessions()).toEqual([{ id, sessionId }])
  expect(second.claimBlockedSessions()).toEqual([])
  first.releaseClaim(id)
  expect(second.claimBlockedSessions()).toEqual([{ id, sessionId }])
  first.completeClaim(id)
  expect(second.snapshot().pausedSessions).toHaveLength(1)
  second.close()
  expect(first.claimBlockedSessions()).toEqual([{ id, sessionId }])
  first.completeClaim(id)
  expect(first.snapshot().pausedSessions).toEqual([])
})

it('migrates legacy pauses without automatically executing an unclassified old request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-migrate-')); directories.push(directory)
  const path = join(directory, 'budget.sqlite')
  const previous = await setup(path)
  previous.configure({ ...DEFAULT_PREFERENCES, enabled: true, autoResume: true })
  previous.close()
  const db = new DatabaseSync(path)
  try {
    db.exec('DROP TABLE session_pauses; CREATE TABLE session_pauses (session_id TEXT PRIMARY KEY, state TEXT NOT NULL, pid INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT; PRAGMA user_version = 1')
    db.prepare("INSERT INTO session_pauses VALUES ('legacy', 'waiting', ?, 1000)").run(process.pid)
  } finally { db.close() }
  const migrated = await setup(path)
  expect(migrated.snapshot().preferences.autoResume).toBe(true)
  expect(migrated.snapshot().pausedSessions).toEqual([{ sessionId: 'legacy', state: 'blocked' }])
  expect(migrated.claimBlockedSessions()).toEqual([])
  migrated.configure(migrated.snapshot().preferences)
  migrated.reset()
  expect(migrated.claimBlockedSessions()).toEqual([])
  migrated.resume()
  expect(migrated.claimBlockedSessions()).toEqual([{ id: expect.any(String), sessionId: 'legacy' }])
  const inspect = new DatabaseSync(path)
  try { expect(inspect.prepare('PRAGMA user_version').get()?.user_version).toBe(SCHEMA_VERSION) }
  finally { inspect.close() }
})

it('keeps recovery manual when a dead reservation becomes an uncertain charge', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-dead-charge-')); directories.push(directory)
  const path = join(directory, 'budget.sqlite')
  let now = 1000
  const previous = await setup(path, () => now)
  enable(previous, false)
  reservation(previous.reserve(4 * MICRO_CNY))
  const id = previous.waitForSession(SessionId('blocked-by-reservation'), 2 * MICRO_CNY)
  previous.close()
  const next = await setup(path, () => now)
  expect(next.claimBlockedSessions()).toEqual([])
  expect(next.snapshot().paused).toBe(true)
  now += 900001
  expect(next.claimBlockedSessions()).toEqual([])
  next.resume()
  expect(next.claimBlockedSessions()).toEqual([{ id, sessionId: 'blocked-by-reservation' }])
})

it('rejects a corrupt recovery record while opening without discarding it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-corrupt-pause-')); directories.push(directory)
  const path = join(directory, 'budget.sqlite')
  const previous = await setup(path)
  previous.waitForSession(SessionId('corrupt-pause'), MICRO_CNY)
  previous.close()
  const db = new DatabaseSync(path)
  try { db.prepare("UPDATE session_pauses SET ticket = ''").run() }
  finally { db.close() }
  await expect(SpendLedger.open(path)).rejects.toThrow()
  const inspect = new DatabaseSync(path)
  try { expect(inspect.prepare('SELECT ticket FROM session_pauses').get()?.ticket).toBe('') }
  finally { inspect.close() }
})
