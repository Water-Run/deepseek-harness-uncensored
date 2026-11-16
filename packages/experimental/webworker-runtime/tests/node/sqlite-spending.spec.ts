/** The product ledger runs unchanged over the Worker's real SQLite and filesystem adapters. */
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { initializeSqlite } from '../../src/node/sqlite-engine.ts'
import { MemoryVfs } from '../../src/storage/memory.ts'
import { setActiveVfs } from '../../src/storage/active.ts'
import { DEFAULT_PREFERENCES, MICRO_CNY, SpendLedger } from '../../../../guard/spend-limit/src/ledger.ts'

vi.mock('node:sqlite', async () => await import('../../src/node/builtin_modules/implemented/sqlite.ts'))
vi.mock('node:fs/promises', async () => await import('../../src/node/builtin_modules/implemented/fs/promises.ts'))
vi.mock('node:path', async () => {
  const native = await vi.importActual<typeof import('node:path')>('node:path')
  return { ...native,
    resolve: (...paths: string[]) => native.posix.resolve(...paths),
    dirname: (path: string) => native.posix.dirname(path),
  }
})

const ledgers: SpendLedger[] = []
let vfs: MemoryVfs
let now: number
async function open(): Promise<SpendLedger> {
  const ledger = await SpendLedger.open('/db/spending.sqlite', () => now, () => true)
  ledgers.push(ledger)
  return ledger
}

beforeAll(async () => { await initializeSqlite() })
beforeEach(() => {
  now = 1_000_000
  vfs = new MemoryVfs()
  setActiveVfs(vfs)
})
afterEach(() => { for (const ledger of ledgers.splice(0)) ledger.close() })

it('persists real reservations and charges, refuses overspending, and keeps window resets independent', async () => {
  const first = await open()
  expect(first.snapshot().preferences.enabledPeriods).toEqual([])
  first.configure({ ...DEFAULT_PREFERENCES, enabledPeriods: ['5h', '7d'], autoResume: true })
  const reserved = first.reserve(20 * MICRO_CNY)
  expect(reserved.kind).toBe('reserved')
  if (reserved.kind !== 'reserved') throw new Error('Expected a persisted reservation')
  first.settle(reserved.id, 20 * MICRO_CNY)
  const second = await open()
  expect(second.snapshot().windows.find(window => window.period === '5h')?.spent).toBe(20)
  expect(second.reserve(31 * MICRO_CNY)).toEqual({ kind: 'waiting', reason: 'limit' })
  second.reset('5h')
  expect(first.snapshot().windows.find(window => window.period === '5h')?.spent).toBe(0)
  expect(first.snapshot().windows.find(window => window.period === '7d')?.spent).toBe(20)
  const uncertain = first.reserve(30 * MICRO_CNY)
  if (uncertain.kind !== 'reserved') throw new Error('Expected an independent-window reservation')
  first.reset('5h')
  expect(first.snapshot().pending).toBe(1)
  first.settle(uncertain.id, null)
  expect(second.snapshot().windows.find(window => window.period === '5h')?.uncertain).toBe(30)
  now += 18_000_001
  expect(second.snapshot().windows.find(window => window.period === '5h')?.spent).toBe(0)
  for (const ledger of ledgers.splice(0)) ledger.close()
  const reopened = await open()
  expect(reopened.snapshot().windows.find(window => window.period === '7d')?.spent).toBe(50)
  reopened.disableAll()
  expect(reopened.reserve(999 * MICRO_CNY)).toEqual({ kind: 'disabled' })
})

it('refuses a corrupted persisted ledger instead of resetting its totals', async () => {
  const ledger = await open()
  ledger.close()
  ledgers.splice(0)
  const damaged = new Uint8Array([1, 2, 3, 4])
  vfs.writeFileSync('/db/spending.sqlite', damaged)
  await expect(open()).rejects.toThrow()
  expect(vfs.readFileSync('/db/spending.sqlite')).toEqual(damaged)
})
