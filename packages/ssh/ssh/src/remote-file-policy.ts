/** Resolve SSH file rules in the authenticated Linux helper's mount namespace. @module */
import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { posix } from 'node:path'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { z } from 'zod'
import { RemoteOperationError } from './protocol.ts'
import type { remoteFileProtectionSchema } from './schemas.ts'

type Rules = z.output<typeof remoteFileProtectionSchema>
type Operation = 'observe' | 'list' | 'mutate'
type Mount = { device: string; root: string; point: string }
type Coordinate = { device: string; path: string }

function unverified(): RemoteOperationError {
  return new RemoteOperationError('The remote file or mount identity could not be verified.', 'TARGET_IDENTITY_UNVERIFIED')
}

function within(root: string, path: string): boolean {
  return root === '/' || path === root || path.startsWith(`${root}/`)
}

function decodePath(value: string): string {
  return value.replace(/\\(040|011|012|134)/gu, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
}

/**
 * Read filesystem coordinates from Linux mountinfo, retaining bind roots and escaped paths.
 * @param input - Text from the helper's own mount namespace.
 * @returns Kernel mount entries in the visible namespace.
 */
export function parseMountInfo(input: string): Mount[] {
  const mounts = input.trimEnd().split('\n').map((line) => {
    const [, , device, root, point] = line.split(' ')
    if (device === undefined || !/^\d+:\d+$/u.test(device) || !root?.startsWith('/') || !point?.startsWith('/') || !line.includes(' - ')) {
      throw unverified()
    }
    return { device, root: posix.normalize(decodePath(root)), point: posix.normalize(decodePath(point)) }
  })
  if (!mounts.some(mount => mount.point === '/')) throw unverified()
  return mounts
}

function coordinate(mount: Mount, path: string): Coordinate {
  return { device: mount.device, path: posix.join(mount.root, posix.relative(mount.point, path)) }
}

function visible(path: string, mounts: readonly Mount[]): Coordinate {
  const best = mounts.filter(mount => within(mount.point, path)).sort((a, b) => b.point.length - a.point.length)
  const mount = best[0]
  if (mount === undefined || best[1]?.point === mount.point) throw unverified()
  return coordinate(mount, path)
}

/**
 * Compare two paths across bind mounts, including a mounted tree below a protected directory.
 * @param root - Canonical production path.
 * @param candidate - Canonical candidate path, which may be prospective.
 * @param mounts - Current Linux mount records.
 * @param includeDescendants - Whether enumerating or changing the candidate can affect a protected child.
 * @returns Whether the paths overlap lexically or refer to overlapping mount coordinates.
 */
export function mountPathMatches(root: string, candidate: string, mounts: readonly Mount[], includeDescendants: boolean): boolean {
  if (within(root, candidate) || (includeDescendants && within(candidate, root))) return true
  const target = visible(candidate, mounts)
  const production = [visible(root, mounts), ...mounts.filter(mount => within(root, mount.point) && mount.point !== root)
    .map(mount => coordinate(mount, mount.point))]
  const candidates = includeDescendants ? [target, ...mounts.filter(mount => within(candidate, mount.point) && mount.point !== candidate)
    .map(mount => coordinate(mount, mount.point))] : [target]
  return production.some(a => candidates.some(b => a.device === b.device
    && (within(a.path, b.path) || (includeDescendants && within(b.path, a.path)))))
}

function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function identify(path: string, prospective: boolean, signal?: AbortSignal) {
  let probe = path
  while (true) {
    signal?.throwIfAborted()
    let canonical
    try { canonical = await realpath(probe) }
    catch (error) {
      if (!prospective || !missing(error) || probe === '/') throw unverified()
      try { await lstat(probe); throw unverified() }
      catch (probeError) { if (!missing(probeError)) throw unverified() }
      probe = posix.dirname(probe)
      continue
    }
    const info = await stat(canonical, { bigint: true }).catch(() => { throw unverified() })
    signal?.throwIfAborted()
    if (probe !== path && !info.isDirectory()) throw unverified()
    return probe === path ? { path: canonical, info } : { path: posix.join(canonical, posix.relative(probe, path)), info: undefined }
  }
}

/** Mount and file identity checks for one authenticated helper. */
export class RemoteFileProtection {
  private configured: { workspace: string; rules: Rules } | undefined

  /** Whether this helper has installed production file rules. */
  get active(): boolean { return this.configured !== undefined }

  /**
   * Activate the owner's rules before any protected operation is dispatched.
   * @param workspace - Canonical helper workspace.
   * @param rules - Remote production paths and their protection levels.
   * @param signal - Activation cancellation.
   */
  async configure(workspace: string, rules: Rules, signal: AbortSignal): Promise<void> {
    if (this.configured !== undefined || process.platform !== 'linux' || rules.length === 0) throw unverified()
    const mounts = parseMountInfo(await readFile('/proc/self/mountinfo', 'utf8'))
    for (const rule of rules) visible((await identify(posix.resolve(rule.path), false, signal)).path, mounts)
    if (this.configured !== undefined) throw unverified()
    this.configured = { workspace, rules }
  }

  /**
   * Check a resolved file target and its display path before a remote effect.
   * @param targets - Absolute filesystem identities from the remote resolver.
   * @param operation - Effect selected by the dispatch method.
   * @param signal - Current operation cancellation.
   */
  async check(targets: readonly FsTarget[], operation: Operation, signal?: AbortSignal): Promise<void> {
    const policy = this.configured
    if (policy === undefined) return
    const mountInfo = await readFile('/proc/self/mountinfo', 'utf8').catch(() => { throw unverified() })
    const mounts = parseMountInfo(mountInfo)
    const rules = await Promise.all(policy.rules.map(async rule => ({
      ...rule, identity: await identify(posix.resolve(rule.path), false, signal),
    })))
    const includeDescendants = operation !== 'observe'
    let readOnly = false, unresolved = false
    for (const target of targets) {
      const key = posix.normalize(target.targetKey)
      const requested = posix.resolve(policy.workspace, target.displayPath)
      if (!within(policy.workspace, key)) throw unverified()
      const candidate = await identify(key, true, signal)
      const display = requested === key ? candidate : await identify(requested, true, signal)
      if (candidate.path !== key || display.path !== key) throw unverified()
      for (const { path, protection, identity } of rules) {
        const declared = posix.resolve(path)
        const sameFile = candidate.info !== undefined && candidate.info.ino !== 0n
          && candidate.info.dev === identity.info?.dev && candidate.info.ino === identity.info.ino
        const matches = sameFile || mountPathMatches(identity.path, key, mounts, includeDescendants)
          || within(declared, requested) || (includeDescendants && within(requested, declared))
        if (matches) {
          if (protection === 'full') throw new RemoteOperationError('This remote file is fully protected.', 'TARGET_FULLY_PROTECTED')
          readOnly ||= operation === 'mutate'
        } else if (candidate.info?.isFile() && candidate.info.nlink > 1n && identity.info?.isDirectory()) {
          unresolved = true
        }
      }
    }
    if (readOnly) throw new RemoteOperationError('This remote file only allows read-only audit.', 'TARGET_READ_ONLY')
    if (unresolved || await readFile('/proc/self/mountinfo', 'utf8').catch(() => { throw unverified() }) !== mountInfo) throw unverified()
    signal?.throwIfAborted()
  }
}
