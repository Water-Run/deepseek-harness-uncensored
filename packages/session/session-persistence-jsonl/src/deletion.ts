/** Permanent deletion with kernel writer exclusion and recoverable retired-file cleanup. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionId as SessionIdType } from '@deepseek-ai/dsh-session'
import { SessionAlreadyOwnedError, SessionDeletionIncompleteError } from '@deepseek-ai/dsh-session-persistence'
import { SessionWriteLease } from './lease.ts'
import { ensureDurableDirectoryWin32, publishNewFileWin32 } from './win32.ts'

/** Reserved storage directories; ordinary Session discovery must exclude both. */
export const DELETION_DIRECTORIES = ['.dshu-deleting', '.dshu-deletion-locks'] as const
const INTENT = '.dshu-delete.json'

/** Deployment policy for transient filesystem sharing violations during physical cleanup. */
export interface DeletionPolicy { readonly maxRetries: number; readonly retryDelay: number }

function digest(id: SessionIdType): string { return createHash('sha256').update(id).digest('hex') }
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT' }

async function present(path: string): Promise<boolean> {
  try { await lstat(path); return true }
  catch (error) { if (missing(error)) return false; throw error }
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

async function privateDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') await ensureDurableDirectoryWin32(path)
  else { await mkdir(path, { recursive: true, mode: 0o700 }); await syncDirectory(dirname(path)) }
}

/** Reject substituted Session directories before any recursive filesystem operation. */
async function contained(root: string, target: string): Promise<void> {
  if ((await lstat(target)).isSymbolicLink()) throw new Error('Refusing to delete a symbolic-link Session directory.')
  const child = relative(await realpath(root), await realpath(target))
  if (!child || isAbsolute(child) || child === '..' || child.startsWith('../') || child.startsWith('..\\')) {
    throw new Error('Session deletion target is outside the configured storage root.')
  }
}

async function readIntent(directory: string): Promise<SessionIdType> {
  const value: unknown = JSON.parse(await readFile(join(directory, INTENT), 'utf8'))
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1
    || !('id' in value) || typeof value.id !== 'string' || value.id.length === 0) throw new Error('Invalid Session deletion record.')
  const id = SessionId(value.id)
  return id
}

async function acquireDeletionLease(root: string, key: string, id: SessionIdType): Promise<SessionWriteLease> {
  const parent = join(root, DELETION_DIRECTORIES[1])
  await privateDirectory(parent)
  await contained(root, parent)
  const path = join(parent, key)
  if (await present(path)) await contained(root, path)
  return SessionWriteLease.acquire(path, id)
}

async function withLeases<T>(operation: (leases: SessionWriteLease[]) => Promise<T>): Promise<T> {
  const leases: SessionWriteLease[] = []
  let outcome: { ok: true; value: T } | { ok: false; error: unknown }
  try { outcome = { ok: true, value: await operation(leases) } }
  catch (error) { outcome = { ok: false, error } }
  const released = await Promise.allSettled(leases.toReversed().map(lease => lease.release()))
  const failures: unknown[] = []
  for (const result of released) if (result.status === 'rejected') failures.push(result.reason)
  if (!outcome.ok) {
    if (failures.length) throw new AggregateError([outcome.error, ...failures], 'Session deletion and lock release failed.')
    throw outcome.error
  }
  if (failures.length) throw new AggregateError(failures, 'Session deletion locks could not be released.')
  return outcome.value
}

async function writeIntent(directory: string, id: SessionIdType): Promise<void> {
  const destination = join(directory, INTENT)
  if (await present(destination)) {
    if (await readIntent(directory) !== id) throw new Error('Session deletion record names a different identity.')
    return
  }
  const temporary = join(directory, `.delete-${randomUUID()}.tmp`)
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try { await handle.writeFile(JSON.stringify({ version: 1, id }) + '\n'); await handle.sync() }
    finally { await handle.close() }
    if (process.platform === 'win32') await publishNewFileWin32(temporary, destination)
    else await rename(temporary, destination)
  } finally { await rm(temporary, { force: true }) }
  await syncDirectory(directory)
}

async function recordRetirement(root: string, id: SessionIdType): Promise<void> {
  const directory = join(root, DELETION_DIRECTORIES[1], digest(id))
  await privateDirectory(directory)
  await contained(root, directory)
  await writeIntent(directory, id)
}

/**
 * Check whether a durable identity has already been retired.
 * @param root - Configured persistence root.
 * @param id - Requested new identity.
 * @returns Whether the identity has a committed deletion record.
 */
export async function isRetiredSession(root: string, id: SessionIdType): Promise<boolean> {
  try {
    if (await readIntent(join(root, DELETION_DIRECTORIES[1], digest(id))) !== id) throw new Error('Session deletion identity mismatch.')
    return true
  } catch (error) { if (missing(error)) return false; throw error }
}

/**
 * Read identity-only deletion records used to clear derived data after a restart.
 * @param root - Configured persistence root.
 * @returns Committed retired identities, excluding uncommitted lock directories.
 */
export async function readRetiredSessions(root: string): Promise<SessionIdType[]> {
  const directory = join(root, DELETION_DIRECTORIES[1])
  if (!await present(directory)) return []
  await contained(root, directory)
  const ids: SessionIdType[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'catalog') continue
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/u.test(entry.name)) throw new Error('Unexpected Session deletion record.')
    const path = join(directory, entry.name)
    await contained(root, path)
    let id: SessionIdType
    try { id = await readIntent(path) }
    catch (error) { if (missing(error)) continue; throw error }
    if (digest(id) !== entry.name) throw new Error('Session deletion identity mismatch.')
    ids.push(id)
  }
  return ids
}

/**
 * Exclude concurrent native-family publication/deletion across backend instances and processes.
 * @param root - Configured storage root.
 * @param id - Conversation identity for contention errors.
 * @param operation - Non-nested catalog mutation to complete while exclusion is held.
 * @returns Operation result after releasing the kernel lease.
 */
export function withCatalogMutation<T>(root: string, id: SessionIdType, operation: () => Promise<T>): Promise<T> {
  return withLeases(async (leases) => {
    leases.push(await acquireDeletionLease(root, 'catalog', id))
    return operation()
  })
}

async function purge(root: string, directory: string, id: SessionIdType, policy: DeletionPolicy): Promise<void> {
  try {
    await contained(root, directory)
    if (basename(directory) !== digest(id) || await readIntent(directory) !== id) throw new Error('Session cleanup identity mismatch.')
    for (const entry of await readdir(directory)) {
      if (entry !== INTENT) await rm(join(directory, entry), { recursive: true, force: true, ...policy })
    }
    if ((await readdir(directory)).some(entry => entry !== INTENT)) throw new Error('Session files are still in use.')
    // Keep the identity record through every potentially partial content removal.
    await rm(directory, { recursive: true, force: true, ...policy })
    await syncDirectory(dirname(directory))
  } catch (error) { throw new SessionDeletionIncompleteError(id, error) }
}

/**
 * Finish only cleanup whose retirement already committed; live Session directories are never recovered as deletions.
 * @param root - Configured storage root.
 * @param policy - Validated filesystem retry policy.
 */
export async function recoverSessionDeletions(root: string, policy: DeletionPolicy): Promise<void> {
  const pending = join(root, DELETION_DIRECTORIES[0])
  if (!await present(pending)) return
  await contained(root, pending)
  let entries
  try { entries = await readdir(pending, { withFileTypes: true }) }
  catch (error) { if (missing(error)) return; throw error }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/u.test(entry.name)) throw new Error('Unexpected entry in Session deletion storage.')
    const directory = join(pending, entry.name)
    let id: SessionIdType | undefined
    try { id = await readIntent(directory) }
    catch (error) { if (!missing(error)) throw error }
    if (id !== undefined && digest(id) !== entry.name) throw new Error('Session cleanup identity mismatch.')
    let lease: SessionWriteLease
    try { lease = await acquireDeletionLease(root, entry.name, id ?? SessionId(entry.name)) }
    catch (error) { if (error instanceof SessionAlreadyOwnedError) continue; throw error }
    await withLeases(async (leases) => {
      leases.push(lease)
      if (!await present(directory)) return
      if (id === undefined) {
        await contained(root, directory)
        // A crash after removing the last marker can leave only an empty directory.
        // rmdir rejects nonempty unknown data instead of recursively deleting it.
        await rmdir(directory)
        await syncDirectory(pending)
      } else {
        await recordRetirement(root, id)
        await purge(root, directory, id, policy)
      }
    })
  }
}

/**
 * Lock every target before retiring any directory, then purge each target's owned files.
 * @param root - Configured persistence root.
 * @param ids - Validated Session identities in deletion order.
 * @param locate - Fresh authoritative directory lookup; never derived from workspace paths.
 * @param retireReaders - Drain local readers and clear prepared-log caches while the writer lock is held.
 * @param removed - Publish catalog removal after its durable rename commit.
 * @param policy - Filesystem sharing retry policy.
 * @returns Removed identities; filesystem failure can leave an already-retired prefix, and retry is idempotent.
 */
export async function deleteSessionDirectories(
  root: string, ids: readonly SessionIdType[], locate: (id: SessionIdType) => Promise<string | undefined>,
  retireReaders: (ids: readonly SessionIdType[]) => Promise<void>, removed: (id: SessionIdType) => void, policy: DeletionPolicy,
): Promise<readonly SessionIdType[]> {
  const candidates: SessionIdType[] = []
  for (const id of ids) {
    if (await present(join(root, DELETION_DIRECTORIES[0], digest(id))) || await locate(id) !== undefined) candidates.push(id)
  }
  return withLeases(async (leases) => {
    for (const id of [...candidates].sort()) leases.push(await acquireDeletionLease(root, digest(id), id))
    const targets: { id: SessionIdType; retired: string; source?: string }[] = []
    for (const id of candidates) {
      const retired = join(root, DELETION_DIRECTORIES[0], digest(id))
      if (await present(retired)) { targets.push({ id, retired }); continue }
      const source = await locate(id)
      if (source === undefined) continue
      await contained(root, source)
      leases.push(await SessionWriteLease.acquire(source, id))
      if (await locate(id) !== source) throw new Error('Session location changed during deletion.')
      targets.push({ id, retired, source })
    }
    await retireReaders(targets.map(target => target.id))
    const result: SessionIdType[] = []
    for (const { id, source, retired } of targets) {
      if (source === undefined) {
        removed(id); await recordRetirement(root, id); await purge(root, retired, id, policy); result.push(id); continue
      }
      await writeIntent(source, id)
      await privateDirectory(dirname(retired))
      await contained(root, dirname(retired))
      if (process.platform === 'win32') await publishNewFileWin32(source, retired)
      else { await rename(source, retired); await syncDirectory(dirname(source)); await syncDirectory(dirname(retired)) }
      removed(id)
      await recordRetirement(root, id)
      await purge(root, retired, id, policy)
      result.push(id)
    }
    return result
  })
}
