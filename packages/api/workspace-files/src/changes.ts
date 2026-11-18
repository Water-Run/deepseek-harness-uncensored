/**
 * Target-scoped filesystem watches and `fs/observed` invalidations for `changes`.
 * Each generation sends `ready` after watcher initialization, then reads current
 * target metadata for coalesced invalidations of that target.
 */

import type { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { FsTargetKey } from '@deepseek-ai/dsh-fs'
import type { WorkspaceFileWatchFrame } from './types.ts'

/** Owns target watches, instrumented observations, and every open `changes` generation. */
export class WorkspaceChangeFeed {
  private readonly followers = new Set<ChangeFollower>()

  /** @param ctx - Host context carrying the filesystem the observations come from. */
  constructor(private readonly ctx: Context) {
    ctx.on('fs/observed', ({ targetKey }) => {
      for (const follower of this.followers) follower.invalidate(targetKey)
    })
    ctx.effect(() => async () => {
      const followers = [...this.followers]
      await Promise.all(followers.map(follower => follower.close()))
      this.followers.clear()
    }, 'workspace-files.changes')
  }

  /**
   * Open one target watch; directory targets remain inside `workspaceRoot`.
   * @param workspaceRoot - the session's workspace root path.
   * @param path - target path, resolved relative to the workspace root; Host metadata determines its type.
   * @param signal - generation cancellation.
   * @returns `ready` after watching starts, then current metadata for coalesced target invalidations.
   */
  async *follow(workspaceRoot: string, path: string, signal: AbortSignal): AsyncIterable<WorkspaceFileWatchFrame> {
    signal.throwIfAborted()
    const follower = new ChangeFollower(() => {
      signal.removeEventListener('abort', cancel)
      this.followers.delete(follower)
    })
    signal = AbortSignal.any([signal, follower.controller.signal])
    const aborted = (): boolean => signal.aborted
    const cancel = (): void => {
      void follower.close().catch((error: unknown) => { this.ctx.logger.error(error) })
    }
    signal.addEventListener('abort', cancel, { once: true })
    this.followers.add(follower)
    let unwatch: (() => Promise<void>) | undefined
    try {
      // Setup shares cancellation, so a late resolution cannot acquire a watcher.
      const root = await this.ctx.fs.resolve(workspaceRoot, { signal }).catch((error: unknown) => {
        if (aborted()) return undefined
        throw error
      })
      if (root === undefined || aborted()) return
      const target = await this.ctx.fs.resolve(path, { cwd: workspaceRoot, signal }).catch((error: unknown) => {
        if (aborted()) return undefined
        throw error
      })
      if (target === undefined || aborted()) return
      follower.targetKey = target.targetKey
      const stat = async () => {
        const info = await this.ctx.fs.stat(target, signal).catch((error: unknown) => {
          if (aborted()) return undefined
          throw error
        })
        if (info?.type === 'directory' && !this.ctx.fs.contains(root, target)) {
          throw new RemoteError('workspace-file/outside-workspace', 'Directory is outside the workspace', { path })
        }
        return info
      }
      await stat()
      if (aborted()) return
      try {
        unwatch = await this.ctx.fs.watch(target, (error) => {
          if (error !== undefined) follower.fail(error)
          else follower.invalidate(target.targetKey)
        }, signal)
        if (follower.error !== undefined) throw follower.error
      } catch (error) {
        if (aborted() && follower.error === undefined) return
        const failure = follower.error ?? error
        throw new RemoteError('workspace-file/watch-unsupported',
          failure instanceof Error ? failure.message : String(failure), { path })
      }
      follower.initialized.resolve(unwatch)
      if (aborted()) return
      yield { kind: 'ready' }
      while (await follower.waitForChange()) {
        if (aborted()) return
        const info = await stat()
        if (aborted()) return
        const absolutePath = this.ctx.fs.processPath(target)
        yield {
          kind: 'change',
          change: info !== undefined
            ? { absolutePath, version: info.version }
            : { absolutePath, absent: true },
        }
      }
    } finally {
      follower.initialized.resolve(unwatch)
      await follower.close()
    }
  }
}

/** One pending refresh for a resolved target, owned by its watch generation. */
class ChangeFollower {
  readonly controller = new AbortController()
  readonly initialized = Promise.withResolvers<(() => Promise<void>) | undefined>()
  error: Error | undefined
  targetKey: FsTargetKey | undefined
  private pending = false
  private wake: (() => void) | undefined
  private closed = false
  private closing: Promise<void> | undefined

  constructor(private readonly release: () => void) {}

  invalidate(key: FsTargetKey): void {
    if (this.closed || key !== this.targetKey || this.pending) return
    this.pending = true
    this.wake?.()
  }

  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.closed = true
    this.pending = false
    this.closing = this.initialized.promise.then(unwatch => unwatch?.()).finally(this.release)
    this.controller.abort()
    this.wake?.()
    return this.closing
  }

  fail(error: Error): void {
    this.error = error
    this.controller.abort()
  }

  /** Consume a pending refresh or wait until the generation closes. */
  async waitForChange(): Promise<boolean> {
    while (!this.closed && !this.pending) {
      await new Promise<void>((resolve) => { this.wake = resolve })
      this.wake = undefined
    }
    if (this.error !== undefined) throw this.error
    if (this.closed) return false
    this.pending = false
    return true
  }
}
