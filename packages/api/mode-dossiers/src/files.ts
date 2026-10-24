/**
 * Filesystem plumbing shared by the dossier stores: workspace-relative path
 * normalization, containment, and the error vocabulary callers map onto Remote
 * failures.
 */

import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import type { DossierProblemCode } from './types.ts'

/** A storage condition this service reports instead of an unhandled throw. */
export class DossierProblemError extends Error {
  /**
   * @param code - reported problem code.
   * @param detail - operator-facing explanation of the concrete condition.
   */
  constructor(readonly code: DossierProblemCode, detail: string) {
    super(detail)
    this.name = 'DossierProblemError'
  }
}

/** Placeholder used when a stored field has no usable value. */
const EMPTY = ''

/**
 * Whether a value is a plain JSON object.
 * @param value - parsed JSON or any other runtime value.
 * @returns true for a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one string field, falling back when the stored value is not a string.
 * @param record - parsed JSON object.
 * @param key - field name.
 * @returns the stored string, or an empty string.
 */
export function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : EMPTY
}

/**
 * Read one numeric field, falling back when the stored value is not a finite number.
 * @param record - parsed JSON object.
 * @param key - field name.
 * @param fallback - value returned when the field is absent or not a finite number.
 * @returns the stored number, or the fallback.
 */
export function numberField(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Read one string array field, dropping members that are not strings.
 * @param record - parsed JSON object.
 * @param key - field name.
 * @returns the string members of the stored array, or an empty array.
 */
export function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/**
 * Normalize a caller-supplied workspace-relative path.
 *
 * The wire accepts the path a person sees in the workspace; storage never
 * accepts an absolute path, a drive letter, an escape segment, or a NUL, so a
 * dossier request cannot name a file outside the workspace it was bound to.
 * @param path - workspace-relative path from the request.
 * @returns the same path with `/` separators and no redundant segments.
 * @throws {DossierProblemError} when the path is absolute, empty, or escapes upward.
 */
export function normalizeRelativePath(path: string): string {
  const slashed = path.replace(/\\/g, '/').trim()
  if (slashed.length === 0) throw new DossierProblemError('unreadable', 'a workspace-relative path is required')
  if (slashed.startsWith('/') || /^[a-zA-Z]:/u.test(slashed) || slashed.includes('\0')) {
    throw new DossierProblemError('unreadable', `"${path}" must be a relative path inside the workspace`)
  }
  const segments: string[] = []
  for (const segment of slashed.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') throw new DossierProblemError('unreadable', `"${path}" escapes the workspace`)
    segments.push(segment)
  }
  if (segments.length === 0) throw new DossierProblemError('unreadable', `"${path}" names no file`)
  return segments.join('/')
}

/**
 * Resolve options that omit `signal` entirely when there is none, so callers
 * with an optional cancellation token still satisfy the backend's optional
 * property type.
 * @param signal - caller cancellation, or undefined.
 * @returns options carrying the signal only when it exists.
 */
export function resolveOptions(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal }
}

/**
 * Resolve a workspace-relative path and refuse it unless the workspace contains it.
 * @param fs - composed filesystem serving the workspace.
 * @param root - resolved workspace root.
 * @param rootPath - the workspace directory as registered.
 * @param relative - normalized workspace-relative path.
 * @param signal - caller cancellation.
 * @returns the resolved target.
 * @throws {DossierProblemError} when the path resolves outside the workspace.
 */
export async function resolveInside(
  fs: FileSystem,
  root: FsTarget,
  rootPath: string,
  relative: string,
  signal: AbortSignal | undefined,
): Promise<FsTarget> {
  const target = await fs.resolve(relative, { cwd: rootPath, ...resolveOptions(signal) })
  if (!fs.contains(root, target)) {
    throw new DossierProblemError('unreadable', `"${relative}" is outside the workspace`)
  }
  return target
}

/**
 * The backend error code carried by a filesystem failure.
 * @param error - value thrown by the filesystem backend.
 * @returns the code when the failure carries one.
 */
export function fsErrorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined
}

/**
 * Translate a filesystem failure into a reported dossier problem.
 * @param error - failure from one storage operation.
 * @returns the reported problem, classified by the backend's code.
 */
export function problemOf(error: unknown): DossierProblemError {
  if (error instanceof DossierProblemError) return error
  const code = fsErrorCode(error)
  if (code === 'FS_NOT_FOUND') return new DossierProblemError('workspace-missing', 'the selected path no longer exists')
  if (code === 'FS_STALE_VERSION') return new DossierProblemError('conflict', 'the file changed since it was opened')
  if (code === 'FS_PERMISSION_DENIED') return new DossierProblemError('unreadable', 'the selected path is not readable with the current permissions')
  return new DossierProblemError('unreadable', error instanceof Error ? error.message : String(error))
}

/**
 * Read a UTF-8 file, treating absence as undefined.
 * @param fs - composed filesystem.
 * @param target - resolved file target.
 * @param signal - caller cancellation.
 * @returns the text, or undefined when the file does not exist.
 */
export async function readTextIfPresent(
  fs: FileSystem,
  target: FsTarget,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  const info = await fs.stat(target, signal)
  if (info === undefined) return undefined
  if (info.type !== 'file') throw new DossierProblemError('unreadable', `"${target.displayPath}" is not a regular file`)
  return await fs.readText(target, signal)
}

/**
 * Current time as the ISO string stored by `casefile.mjs`.
 * @returns the current instant in ISO 8601 form.
 */
export function nowIso(): string {
  return new Date().toISOString()
}
