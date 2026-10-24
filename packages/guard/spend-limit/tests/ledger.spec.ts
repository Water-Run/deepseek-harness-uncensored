import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DEFAULT_PREFERENCES, MICRO_CNY, SpendLedger } from '../src/ledger.ts'
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
  live.noteSession('dead-task', 'waiting')
  live.noteSession('live-task', 'waiting')
  const external = new DatabaseSync(path)
  external.prepare('UPDATE session_pauses SET pid = ? WHERE session_id = ?').run(999_999, 'dead-task')
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
  const ledger = await setup(':memory:', () => 1000, () => false)
  enable(ledger, false)
  ledger.noteSession('paused-task', 'waiting')
  ledger.settle(reservation(ledger.reserve(4 * MICRO_CNY)), 4 * MICRO_CNY)
  expect(ledger.reserve(2 * MICRO_CNY)).toEqual({ kind: 'waiting', reason: 'limit' })
  expect(ledger.snapshot().paused).toBe(true)
  expect(ledger.claimBlockedSessions()).toEqual([])
  ledger.resume()
  expect(ledger.claimBlockedSessions()).toEqual(['paused-task'])
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
