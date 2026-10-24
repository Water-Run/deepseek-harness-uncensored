/** Locations of compatibility records and generated catalogs for this checkout. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Documentation placement; immutable schema snapshots retain their existing paths. */
export interface PersistenceLayout {
  readonly records: string
  readonly status: string
  readonly catalogs: 'full' | 'machine'
}

/**
 * Read the checkout's explicit documentation policy; upstream fixtures retain their public layout.
 * @param root - Checkout or isolated fixture directory.
 * @returns Record and status paths, and which catalog presentations to emit.
 */
export function persistenceLayout(root: string): PersistenceLayout {
  const path = join(root, 'scripts/persistence-layout.json')
  if (!existsSync(path)) return { records: 'docs/persistence-changes', status: 'docs/session-format-status.md', catalogs: 'full' }
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).join(',') !== 'documentation' || !('documentation' in value) || value.documentation !== 'internal') {
    throw new Error('persistence-layout.json must contain only documentation: "internal"')
  }
  return { records: '.agents/persistence/changes', status: '.agents/persistence/status.md', catalogs: 'machine' }
}
