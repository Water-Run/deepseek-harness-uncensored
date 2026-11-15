/** The pinned browser entry keeps the real engine and notices without requesting another Worker. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { sqliteCore } from '../src/module-system/sqlite-core.ts'

it('preserves the shipped engine while removing the separate Worker client', () => {
  const wasm = import.meta.resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm')
  const source = readFileSync(new URL('index.mjs', wasm), 'utf8')
  const core = sqliteCore(source)
  expect(core).toContain('LICENSE for the sqlite3 WebAssembly/JavaScript APIs')
  expect(core).toContain('async function sqlite3InitModule$1')
  expect(core).toContain('export default sqlite3_bundler_friendly_default;')
  expect(core).not.toContain('sqlite3-worker1.mjs')
  expect(core).not.toContain('globalThis.sqlite3Worker1Promiser')
})

it('rejects unrecognized or ambiguous dependency layouts', () => {
  expect(() => sqliteCore('export default function changed() {}')).toThrow(/entry changed/u)
  expect(() => sqliteCore('//#region src/bin/sqlite3-worker1-promiser.mjs'.repeat(2))).toThrow(/entry changed/u)
})
