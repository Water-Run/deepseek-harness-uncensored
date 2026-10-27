/** Host-local path identities for target admission; remote and device namespaces are refused. @module */
import { lstat, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { TargetProtectionError } from './errors.ts'

/** One freshly resolved host-local path, including a prospective file under existing parents. */
export interface LocalPathIdentity {
  path: string
  canonical: string
  fileId?: string
  multipleLinks: boolean
  directory: boolean
}

/**
 * Validate an absolute host path without resolving links. Windows device, UNC and alternate streams are refused.
 * @param value - Owner or executor path in the host filesystem.
 * @returns Normalized absolute path preserving the spelling used for filesystem I/O.
 */
export function canonicalLocalPath(value: string): string {
  if (!isAbsolute(value) || value.includes('\0')) throw new TargetProtectionError('invalid', 'A file rule requires an absolute local path.')
  if (process.platform === 'win32' && (/^[\\/]{2}/u.test(value)
    || value.slice(2).includes(':') || value.split(/[\\/]/u).some(part =>
    (part !== '.' && part !== '..' && /[. ]$/u.test(part)) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)))) {
    throw new TargetProtectionError('invalid', 'UNC, device, stream and ambiguous Windows paths require a separate adapter.')
  }
  return normalize(resolve(value))
}

/**
 * Compare canonical local paths by complete components.
 * @param parent - Canonical resource root.
 * @param child - Canonical candidate.
 * @returns Whether the candidate is the root or a descendant.
 */
export function localPathContains(parent: string, child: string): boolean {
  const suffix = relative(parent, child)
  return suffix === '' || (suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix))
}

function absent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/**
 * Resolve links and the deepest existing ancestor; broken links and failed metadata cannot become absent files.
 * @param value - Absolute local path to inspect without reading content.
 * @param signal - Cancellation checked around each filesystem query.
 * @returns Canonical path and native file identity when the file exists.
 */
export async function resolveLocalPathIdentity(value: string, signal: AbortSignal): Promise<LocalPathIdentity> {
  const path = canonicalLocalPath(value)
  let candidate = path
  const missing: string[] = []
  while (true) {
    signal.throwIfAborted()
    try {
      const canonical = canonicalLocalPath(await realpath(candidate))
      const info = await stat(canonical)
      signal.throwIfAborted()
      if (missing.length > 0 && !info.isDirectory()) throw new TargetProtectionError('invalid', 'A file target traverses a non-directory parent.')
      return { path, canonical: canonicalLocalPath(join(canonical, ...missing)), directory: missing.length === 0 && info.isDirectory(),
        multipleLinks: missing.length === 0 && info.isFile() && info.nlink > 1,
        ...missing.length === 0 && info.ino !== 0 ? { fileId: `${String(info.dev)}:${String(info.ino)}` } : {},
      }
    } catch (error) {
      if (!absent(error)) throw error
      let link
      try { link = await lstat(candidate) }
      catch (probeError) { if (!absent(probeError)) throw probeError }
      if (link !== undefined) throw new TargetProtectionError('unavailable', 'The file target has an unresolved link or changed during inspection.')
      const parent = dirname(candidate)
      if (parent === candidate) throw new TargetProtectionError('unavailable', 'The filesystem root is unavailable.')
      missing.unshift(basename(candidate))
      candidate = parent
    }
  }
}
