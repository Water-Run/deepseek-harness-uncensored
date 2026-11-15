/** One real SQLite WASM engine per dedicated Worker, prepared before Node globals. */
import initialize from '@sqlite.org/sqlite-wasm'
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm'

let engine: Sqlite3Static | undefined
let readiness: Promise<void> | undefined

/**
 * Initialize the engine once; failure remains a rejected readiness promise.
 * @param binary - Embedded browser WASM bytes; Node tests use the package's native locator.
 * @returns Readiness before any SQLite constructor can run.
 */
export function initializeSqlite(binary?: Uint8Array): Promise<void> {
  // The upstream factory accepts Emscripten options, which its declaration omits.
  const factory: (options?: { wasmBinary: Uint8Array }) => Promise<Sqlite3Static> = initialize
  readiness ??= (async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'sqlite3ApiConfig')
    Object.defineProperty(globalThis, 'sqlite3ApiConfig', {
      configurable: true, writable: true,
      value: { disable: { vfs: { kvvfs: true, opfs: true, 'opfs-wl': true, 'opfs-sahpool': true } } },
    })
    try { engine = await factory(binary === undefined ? undefined : { wasmBinary: binary }) }
    finally {
      if (previous === undefined) Reflect.deleteProperty(globalThis, 'sqlite3ApiConfig')
      else Object.defineProperty(globalThis, 'sqlite3ApiConfig', previous)
    }
  })()
  return readiness
}

/**
 * Read the prepared engine without an asynchronous fallback during a SQL call.
 * @returns The initialized engine.
 */
export function sqliteEngine(): Sqlite3Static {
  if (engine === undefined) throw new Error('webworker sqlite: initialize the WASM engine before starting the Host')
  return engine
}
