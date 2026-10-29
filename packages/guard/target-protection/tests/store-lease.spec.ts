/** Native SQLite read locks serialize final effects with cross-connection policy commits. @module */
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { TargetStore } from '../src/store.ts'

it('retains a checked revision while both local and external policy writes are refused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-policy-lease-'))
  const first = await TargetStore.open(join(root, 'rules.sqlite'), 10)
  const second = await TargetStore.open(join(root, 'rules.sqlite'), 10)
  let release = () => {}
  try {
    release = first.retainSnapshot(1)
    expect(() => first.configure({ mainlandEnabled: false, rules: [] }, 1)).toThrow(expect.objectContaining({ code: 'busy' }))
    expect(() => second.configure({ mainlandEnabled: false, rules: [] }, 1)).toThrow(expect.objectContaining({ code: 'busy' }))
    expect(second.snapshot().revision).toBe(1)
    release(); release()
    expect(second.configure({ mainlandEnabled: false, rules: [] }, 1).revision).toBe(2)
    expect(() => first.retainSnapshot(1)).toThrow(expect.objectContaining({ code: 'conflict' }))
  } finally { release(); first.close(); second.close(); await rm(root, { recursive: true, force: true }) }
})

it('refuses WAL policy stores because their readers cannot block policy writers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-policy-wal-')), path = join(root, 'rules.sqlite')
  const store = await TargetStore.open(path, 10), external = new DatabaseSync(path)
  try {
    external.exec('PRAGMA journal_mode=WAL')
    expect(() => store.retainSnapshot(1)).toThrow(expect.objectContaining({ code: 'unavailable' }))
    expect(store.snapshot().revision).toBe(1)
  } finally { external.close(); store.close(); await rm(root, { recursive: true, force: true }) }
})
