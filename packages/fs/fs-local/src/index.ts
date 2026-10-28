/**
 * Host-filesystem implementation of `ctx.fs`. Realpath-derived target identity makes aliases
 * share stale guards, and writes through a symlink update its target without replacing the link.
 * @module @deepseek-ai/dsh-fs-local
 */

import { Context } from '@deepseek-ai/cordis'
import { constants as bufferConstants } from 'node:buffer'
import { once } from 'node:events'
import { link, unlink } from 'node:fs/promises'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import { watch } from 'chokidar'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { FileSystem, FsError, FsVersion } from '@deepseek-ai/dsh-fs'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsWriteIntent,
  FsWriteOutcome,
} from '@deepseek-ai/dsh-fs'
import {
  applyLiteralEdit,
  listDirectory,
  localDisplayPath,
  normalizeLineEndings,
  probe,
  probeNoFollow,
  readForEdit,
  readByteWindow,
  readTextForDiff,
  readWholeBytes,
  readWholeText,
  resolveLocalTarget,
  restoreLineEndings,
  streamWholeText,
  writeFileAtomic,
} from './fsio.ts'
import type { FsIoInternals } from './fsio.ts'

/** Configuration for the local filesystem backend. */
export interface Config {
  /** Base directory for relative paths. Defaults to `process.cwd()`. */
  cwd?: string
  /**
   * Exclusive UTF-8 byte limit on each overwrite-diff side, capped by the
   * runtime's safe allocation/decode maximum. Defaults to 10 MiB.
   */
  diffBasisMaxBytes?: number
}

type ResolvedConfig = Required<Config>
const DEFAULT_DIFF_BASIS_MAX_BYTES = 10 * 1024 * 1024
const MAX_DIFF_BASIS_BYTES = Math.min(
  bufferConstants.MAX_LENGTH,
  bufferConstants.MAX_STRING_LENGTH,
)

/**
 * The host-filesystem backend. Reads resolve relative paths from {@link Config.cwd}
 * (a resolution default, NOT a containment boundary — see the filesystem
 * capability-seam Agent Note); enforce
 * containment with a stricter backend or a `tools/execute` permission plugin.
 */
export class LocalFileSystem extends FileSystem {
  override async watch(target: FsTarget, changed: (error?: Error) => void, signal: AbortSignal): Promise<() => Promise<void>> {
    signal.throwIfAborted()
    const path = resolve(this.processPath(target))
    const directory = (await this.stat(target, signal))?.type === 'directory'
    signal.throwIfAborted()
    const root = directory ? path : dirname(path)
    const watcher = watch(root, {
      ignoreInitial: true, depth: 0,
      ignored: entry => !directory && resolve(entry) !== root && resolve(entry) !== path,
    })
    watcher.on('all', (_event, entry) => {
      if (directory || resolve(entry) === path) changed()
    })
    watcher.on('error', (error) => { changed(error instanceof Error ? error : new Error(String(error))) })
    try {
      await once(watcher, 'ready', { signal })
      return () => watcher.close()
    } catch (error) {
      await watcher.close()
      throw error
    }
  }

  static Config: z<Config> = z.object({
    cwd: z.string().default(process.cwd()),
    diffBasisMaxBytes: z.number().default(DEFAULT_DIFF_BASIS_MAX_BYTES),
  })

  /** Validated config (schemastery applied the defaults before construction). */
  readonly config: ResolvedConfig
  /** Test hook forwarded to fsio for atomic-publication boundaries. */
  internals: FsIoInternals = {}
  /** Per-targetKey tail promise: serializes mutating ops so the read→guard→write
   * window can't interleave, making concurrent writes/edits deterministically
   * ordered (one wins, the rest see the new version and reject as stale). */
  private locks = new Map<string, Promise<unknown>>()

  constructor(ctx: Context, config: Config) {
    super(ctx)
    const resolved = config as ResolvedConfig
    if (!Number.isSafeInteger(resolved.diffBasisMaxBytes)
      || resolved.diffBasisMaxBytes <= 0
      || resolved.diffBasisMaxBytes > MAX_DIFF_BASIS_BYTES) {
      throw new Error(`fs-local: diffBasisMaxBytes must be a positive safe integer no greater than ${MAX_DIFF_BASIS_BYTES}`)
    }
    this.config = resolved
  }

  /** Run `op` with exclusive access to `targetKey` (FIFO per key). */
  private async withLock<T>(targetKey: string, op: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(targetKey) ?? Promise.resolve()
    const run = prior.then(op, op)
    // Keep the chain alive but swallow this op's result/throw for the *next* waiter.
    const tail = run.then(() => undefined, () => undefined)
    this.locks.set(targetKey, tail)
    try {
      return await run
    } finally {
      if (this.locks.get(targetKey) === tail) {
        this.locks.delete(targetKey)
      }
    }
  }

  /**
   * Revalidate provider-owned mutation policy inside the file lock and at atomic publication.
   * @param target - Exact destination whose canonical identity must remain authorized.
   * @param signal - Cancellation checked before staging or committing content.
   * @returns Completion when the destination remains permitted; rejection leaves final content unpublished.
   */
  protected authorizeMutation(target: FsTarget, signal?: AbortSignal): Promise<void> {
    void target
    if (signal?.aborted) throw new FsError('write aborted', 'FS_ABORTED')
    return Promise.resolve()
  }

  /**
   * Recheck every namespace target under the operation's policy while mutation locks are held.
   * @param targets - Source and, for rename, destination.
   * @param signal - Cancels before a native effect.
   * @param policy - Per-call sandbox policy; the bare local backend has no sandbox.
   * @returns Completion only while all targets remain authorized and resolve to the same paths.
   */
  protected async authorizeFileMutation(
    targets: readonly FsTarget[], signal?: AbortSignal, policy?: SandboxExecutionPolicy,
  ): Promise<void> {
    void policy
    for (const target of targets) {
      await this.authorizeMutation(target, signal)
      const fresh = await resolveLocalTarget(this.config.cwd, target.displayPath)
      if (fresh.targetKey !== target.targetKey) throw new FsError('File path changed; resolve it again before retrying.', 'FS_STALE_VERSION')
      const entry = await probeNoFollow(target.displayPath)
      if (entry?.type === 'symlink') throw new FsError('File removal and renaming do not follow symbolic-link entries.', 'FS_NOT_REGULAR_FILE')
    }
    if (signal?.aborted) throw new FsError('file mutation aborted', 'FS_ABORTED')
  }

  private async checkedSource(target: FsTarget, expected: { version: FsVersion }): Promise<void> {
    const source = await probeNoFollow(target.targetKey)
    if (source === null || source.version !== expected.version) throw new FsError('Source file changed; inspect it before retrying.', 'FS_STALE_VERSION')
    if (source.type !== 'file') throw new FsError('Only regular files can be removed or renamed.', 'FS_NOT_REGULAR_FILE')
  }

  override async removeFile(
    target: FsTarget, expected: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<void> {
    return this.withLock(target.targetKey, async () => {
      await this.authorizeFileMutation([target], signal, sandboxPolicy)
      await this.checkedSource(target, expected)
      await this.internals.beforeFileMutation?.()
      await this.authorizeFileMutation([target], signal, sandboxPolicy)
      await this.checkedSource(target, expected)
      if (signal?.aborted) throw new FsError('file deletion aborted', 'FS_ABORTED')
      try { await (this.internals.unlinkFile ?? unlink)(target.targetKey) }
      catch (error) { throw this.fileMutationError(error) }
    })
  }

  override async renameFile(
    source: FsTarget, destination: FsTarget, expected: { version: FsVersion },
    signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<void> {
    const keys = [...new Set([source.targetKey, destination.targetKey])].sort()
    const locked = (index: number): Promise<void> => {
      const key = keys[index]
      return key === undefined ? this.renameLocked(source, destination, expected, signal, sandboxPolicy)
        : this.withLock(key, () => locked(index + 1))
    }
    return locked(0)
  }

  private async renameLocked(
    source: FsTarget, destination: FsTarget, expected: { version: FsVersion },
    signal?: AbortSignal, policy?: SandboxExecutionPolicy,
  ): Promise<void> {
    const targets = [source, destination]
    await this.authorizeFileMutation(targets, signal, policy)
    await this.checkedSource(source, expected)
    await this.internals.beforeFileMutation?.()
    await this.authorizeFileMutation(targets, signal, policy)
    await this.checkedSource(source, expected)
    if (signal?.aborted) throw new FsError('file rename aborted', 'FS_ABORTED')
    try { await (this.internals.linkFile ?? link)(source.targetKey, destination.targetKey) }
    catch (error) { throw this.fileMutationError(error) }
    try {
      // Publication is irreversible for this call: never remove a destination another writer may own.
      const original = await probeNoFollow(source.targetKey), published = await probeNoFollow(destination.targetKey)
      if (original?.type !== 'file' || published?.type !== 'file' || original.version !== published.version) {
        throw new FsError('Source changed after destination publication.', 'FS_STALE_VERSION')
      }
      await (this.internals.unlinkFile ?? unlink)(source.targetKey)
    } catch (error) {
      throw new FsError(`Destination "${destination.displayPath}" was created but source "${source.displayPath}" removal did not complete. Inspect both paths before retrying.`, 'FS_PARTIAL_MUTATION', { cause: error })
    }
  }

  private fileMutationError(error: unknown): FsError {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    if (code === 'EEXIST') return new FsError('Destination already exists; choose an absent path.', 'FS_ALREADY_EXISTS', { cause: error })
    if (code === 'ENOENT') return new FsError('Source or destination parent is missing.', 'FS_NOT_FOUND', { cause: error })
    if (code === 'EACCES' || code === 'EPERM') return new FsError('File mutation was denied by the operating system.', 'FS_PERMISSION_DENIED', { cause: error })
    return new FsError('File mutation failed; cross-filesystem renames are not supported.', 'FS_IO_ERROR', { cause: error })
  }

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    if (opts?.signal?.aborted) throw new FsError('resolve aborted', 'FS_ABORTED')
    const local = await resolveLocalTarget(opts?.cwd ?? this.config.cwd, path)
    if (opts?.signal?.aborted) throw new FsError('resolve aborted', 'FS_ABORTED')
    return { targetKey: local.targetKey, displayPath: local.displayPath }
  }

  override processPath(target: FsTarget): string {
    return String(target.targetKey)
  }

  override processPathFromHostPath(hostPath: string): string | undefined {
    return isAbsolute(hostPath) ? resolve(hostPath) : undefined
  }

  override fileUrl(target: FsTarget): string {
    return pathToFileURL(this.processPath(target)).href
  }

  override contains(parent: FsTarget, child: FsTarget): boolean {
    const path = relative(this.processPath(parent), this.processPath(child))
    return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    if (signal?.aborted) throw new FsError('stat aborted', 'FS_ABORTED')
    const info = await probe(target.targetKey)
    if (signal?.aborted) throw new FsError('stat aborted', 'FS_ABORTED')
    if (!info) return undefined
    return { version: info.version, type: info.type, size: info.size }
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    if (signal?.aborted) throw new FsError('lstat aborted', 'FS_ABORTED')
    if (path.trim().length === 0) throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND')
    const cwd = opts?.cwd ?? this.config.cwd
    const info = await probeNoFollow(localDisplayPath(cwd, path))
    if (signal?.aborted) throw new FsError('lstat aborted', 'FS_ABORTED')
    if (!info) return undefined
    return { version: info.version, type: info.type, size: info.size }
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    return readWholeText({ displayPath: target.displayPath, targetKey: target.targetKey }, signal)
  }

  override streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    return Promise.resolve(streamWholeText({ displayPath: target.displayPath, targetKey: target.targetKey }, signal))
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    return readWholeBytes({ displayPath: target.displayPath, targetKey: target.targetKey }, signal, maxBytes, this.internals)
  }

  override async readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array> {
    return readByteWindow({ displayPath: target.displayPath, targetKey: target.targetKey }, range, signal)
  }

  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    const entries = await listDirectory({ displayPath: target.displayPath, targetKey: target.targetKey }, signal)
    return entries.map(entry => ({
      name: entry.name,
      type: entry.type,
      target: { targetKey: entry.target.targetKey, displayPath: entry.target.displayPath },
      ...(entry.version !== undefined ? { version: entry.version } : {}),
      ...(entry.size !== undefined ? { size: entry.size } : {}),
    }))
  }

  override async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
  ): Promise<FsWriteOutcome> {
    return this.withLock(target.targetKey, async () => {
      await this.authorizeMutation(target, signal)
      const existing = await probe(target.targetKey)
      if (existing && existing.type !== 'file') {
        throw new FsError(`cannot write "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      }

      if (expected?.kind === 'replaceIfVersion') {
        // Stale guard: the file must still exist at the version the owner observed.
        if (!existing) throw new FsError(`cannot write "${target.displayPath}": file no longer exists`, 'FS_STALE_VERSION')
        if (existing.version !== expected.version) {
          throw new FsError(`cannot write "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
        }
      } else if (expected?.kind === 'createIfAbsent' && existing) {
        // createIfAbsent onto an existing file: a blind overwrite — require a read first.
        throw new FsError(`cannot overwrite existing "${target.displayPath}" without reading it first`, 'FS_NOT_OBSERVED')
      }
      // No expectation means an unconditional but still atomic write.

      // Capture an optional contextual-diff basis before the write. The bounded
      // reader checks the opened file itself, so an external replacement after
      // `probe()` cannot turn this best-effort presentation read into an
      // unbounded allocation. Either side at/above the configured limit yields
      // `before: null`; consumers retain their whole-file fallback.
      const diffable = existing !== null
        && Buffer.byteLength(content, 'utf8') < this.config.diffBasisMaxBytes
      const before = diffable
        ? await readTextForDiff(target.targetKey, this.config.diffBasisMaxBytes, signal)
        : null
      await writeFileAtomic(
        target.targetKey,
        content,
        existing?.mode,
        signal,
        this.internals,
        expected?.kind === 'createIfAbsent' ? { displayPath: target.displayPath } : undefined,
        () => this.authorizeMutation(target, signal),
      )
      const after = await probe(target.targetKey)
      return {
        operation: existing ? 'update' : 'create',
        version: this.versionAfterWrite(after, target),
        before,
        // LF-normalized to share the diff basis with `before` (also LF): a CRLF
        // overwrite must not read as every line changed. Line-ending restoration
        // is a storage detail the applied-hunk diff ignores.
        after: normalizeLineEndings(content),
      }
    })
  }

  override async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
  ): Promise<FsEditOutcome> {
    return this.withLock(target.targetKey, async () => {
      await this.authorizeMutation(target, signal)
      const existing = await probe(target.targetKey)
      // Stale guard before literal matching: an edit based on an old read reports
      // FS_STALE_VERSION, not FS_EDIT_NOT_FOUND/FS_AMBIGUOUS_EDIT against newer content.
      // Missing targets use the same stale code on guarded and unconditional edit paths.
      if (!existing) throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
      if (existing.type !== 'file') throw new FsError(`cannot edit "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      // expected === undefined: unconditional edit of the current content — no
      // version guard. Still inside the per-target lock, so the read→match→write
      // window is serialized and atomic.
      if (expected && existing.version !== expected.version) {
        throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
      }

      const original = await readForEdit(target.targetKey, target.displayPath, signal)
      const edited = applyLiteralEdit(original.content, edit.oldString, edit.newString, edit.replaceAll, target.displayPath)
      const content = restoreLineEndings(edited.content, original.lineEndings)
      await writeFileAtomic(target.targetKey, content, existing.mode, signal, this.internals, undefined,
        () => this.authorizeMutation(target, signal))

      const after = await probe(target.targetKey)
      return {
        version: this.versionAfterWrite(after, target),
        // The LF-normalized before/after text (the applied-hunk diff basis);
        // line-ending restoration is a storage detail the diff ignores.
        before: original.content,
        after: edited.content,
      }
    })
  }

  /* v8 ignore next 5 -- the post-write probe finding the file absent requires a
   * concurrent unlink between rename and stat; fall back to a sentinel version. */
  private versionAfterWrite(after: { version: FsVersion } | null, target: FsTarget): FsVersion {
    if (after) return after.version
    return FsVersion(`missing:${target.targetKey}`)
  }
}

export default LocalFileSystem
