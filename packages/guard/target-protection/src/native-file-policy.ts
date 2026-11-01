/** Expand owner file restrictions into native path policies without losing file aliases. @module */
import { opendir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { canonicalLocalPath, localIdentityPaths, localPathContains, resolveLocalPathIdentity } from './file-identity.ts'
import { TargetProtectionError } from './errors.ts'

/** A restriction supplied by the rule owner, never by a command argument. */
export interface NativeFileConstraint {
  path: string
  access: 'deny' | 'read-only'
  /** Database files include their SQLite-style journal companions. */
  database?: boolean
}

/** One committed revision and its owner/file restrictions. */
export interface NativeFileConstraints {
  revision: number
  entries: readonly NativeFileConstraint[]
}

/** Explicit deployment grants and a bounded filesystem scan. */
export interface NativeFileGrants {
  readonlyPaths: readonly string[]
  readwritePaths: readonly string[]
  maxEntries: number
  maxPaths: number
}

/** Detached path policy; the caller must retain its revision before native launch. */
export interface NativeFilePolicy {
  revision: number
  readonlyPaths: string[]
  readwritePaths: string[]
  deniedPaths: string[]
  enumeratePaths: string[]
}

function covers(paths: Iterable<string>, candidate: string): boolean {
  for (const path of paths) if (localPathContains(path, candidate)) return true
  return false
}

/**
 * Expand restrictions, linked directory contents and hard-link names before native execution.
 * @param constraints - Immutable owner snapshot, including private configuration and data sources.
 * @param grants - Explicit readable/writable deployment roots and positive scan budget.
 * @param signal - Cancels every filesystem phase; no policy is returned after cancellation or incomplete scanning.
 * @returns A native policy with production restrictions taking precedence over writable grants.
 */
export async function compileNativeFilePolicy(
  constraints: NativeFileConstraints, grants: NativeFileGrants, signal: AbortSignal,
): Promise<NativeFilePolicy> {
  const denied = new Set<string>(), readonly = new Set<string>(), writable = new Set<string>()
  const visited = new Map<string, Set<string>>()
  let entries = 0
  const add = (paths: Set<string>, path: string): void => {
    const value = canonicalLocalPath(path)
    if (covers(paths, value)) return
    for (const child of paths) if (localPathContains(value, child)) paths.delete(child)
    paths.add(value)
    if (paths.size > grants.maxPaths) throw new TargetProtectionError('unavailable', 'Native file policy exceeded its path limit; narrow the grants or increase the configured policy budget.')
  }
  const inspect = async (path: string) => {
    signal.throwIfAborted()
    if (++entries > grants.maxEntries) throw new TargetProtectionError('unavailable', 'Native file policy exceeded its entry limit; increase the configured scan budget.')
    return resolveLocalPathIdentity(path, signal)
  }
  const walk = async (path: string, access: NativeFileConstraint['access']): Promise<void> => {
    const identity = await inspect(path)
    const selected = access === 'deny' ? denied : readonly
    for (const alias of localIdentityPaths(identity)) add(selected, alias)
    if (identity.multipleLinks && identity.aliases === undefined) {
      throw new TargetProtectionError('unavailable', 'Native execution requires complete file alias information on this platform.')
    }
    if (!identity.directory) return
    if (identity.fileId === undefined) throw new TargetProtectionError('unavailable', 'A protected directory has no stable native identity.')
    const seen = visited.get(access) ?? new Set<string>()
    visited.set(access, seen)
    if (seen.has(identity.fileId)) return
    seen.add(identity.fileId)
    const before = await stat(identity.canonical, { bigint: true })
    const directory = await opendir(identity.canonical)
    for await (const entry of directory) await walk(join(identity.canonical, entry.name), access)
    const after = await stat(identity.canonical, { bigint: true })
    if (after.dev !== before.dev || after.ino !== before.ino || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) {
      throw new TargetProtectionError('unavailable', 'A protected directory changed during policy construction; retry after the change finishes.')
    }
  }
  for (const entry of constraints.entries) {
    await walk(entry.path, entry.access)
    if (entry.database && !(await inspect(entry.path)).directory) {
      for (const suffix of ['-wal', '-shm', '-journal']) await walk(entry.path + suffix, entry.access)
    }
  }
  const restrictionReadPaths = [...readonly]
  const readGrants = new Set<string>()
  for (const path of grants.readonlyPaths) {
    const identity = await inspect(path)
    if (!identity.exists) throw new TargetProtectionError('invalid', 'Native read grants must name existing paths.')
    for (const alias of localIdentityPaths(identity)) {
      if (!covers(denied, alias)) add(readGrants, alias)
    }
  }
  for (const path of grants.readwritePaths) {
    const identity = await inspect(path)
    if (!identity.exists || !identity.directory) throw new TargetProtectionError('invalid', 'Native write grants must name existing directories.')
    for (const alias of localIdentityPaths(identity)) {
      if (covers(denied, alias)) continue
      if (covers(restrictionReadPaths, alias)) add(readonly, alias)
      else add(writable, alias)
    }
  }
  // MXC permits an explicit writable child under a readonly parent. Owner restrictions must not create that exception.
  for (const path of readGrants) readonly.add(path)
  for (const path of readonly) if (covers(denied, path)) readonly.delete(path)
  const enumerate = new Set<string>()
  const granted = [...readonly, ...writable]
  const covered = [...denied, ...granted]
  for (const path of granted) {
    for (let parent = dirname(path); ; parent = dirname(parent)) {
      if (!covers(covered, parent)) enumerate.add(parent)
      if (parent === dirname(parent)) break
    }
  }
  signal.throwIfAborted()
  if (denied.size + readonly.size + writable.size + enumerate.size > grants.maxPaths) {
    throw new TargetProtectionError('unavailable', 'Native file policy exceeded its total path limit; narrow the grants or increase the configured policy budget.')
  }
  return { revision: constraints.revision, readonlyPaths: [...readonly], readwritePaths: [...writable],
    deniedPaths: [...denied], enumeratePaths: [...enumerate] }
}
