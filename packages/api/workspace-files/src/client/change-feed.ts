/**
 * One Host `changes` subscription per Session and requested path, shared by
 * that target's open resources.
 *
 * The Host reports invalidations from filesystem watches and instrumented writes.
 * The feed opens the target stream when the first follower
 * arrives and disposes it when the last follower leaves. Followers coalesce
 * notices and select the path returned by `stat`, with `\\` normalized to `/`.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileChange, WorkspaceFileWatchFrame } from '../types.ts'
import type { SupervisedStream, WorkspaceFilesRemote } from './remote.ts'
import type { WorkspaceFileEdit, WorkspaceFileNotice } from './types.ts'

/**
 * The follower key of one absolute path.
 * @param path - an absolute path from a Host stat or change frame.
 * @returns the path with `\\` normalized to `/`.
 */
function keyOf(path: string): string {
  return path.replace(/\\/g, '/')
}

/** A bounded set of pending notices for the current path and a possible replacement. */
class Follower implements AsyncIterable<WorkspaceFileNotice> {
  private readonly pending = new Map<string, WorkspaceFileEdit>()
  private readonly started = Promise.withResolvers<boolean>()
  private wake: (() => void) | undefined
  private ended = false
  private hostKey: string | undefined
  private needsRefresh = false
  private pathWasEvicted = false

  /**
   * Resolves true after the Host acknowledges its subscription, or false if
   * this follower ends before acknowledgement.
   */
  readonly ready = this.started.promise

  /**
   * @param leave - unregisters this follower and its abort listener.
   */
  constructor(private readonly leave: () => void) {}

  /**
   * Select the Host path for queued and future changes.
   * @param absolutePath - the successful stat's absolute path.
   */
  bind(absolutePath: string): void {
    const key = keyOf(absolutePath)
    if (key !== this.hostKey && this.pathWasEvicted && !this.pending.has(key)) {
      this.needsRefresh = true
    }
    this.hostKey = key
    this.pathWasEvicted = false
    for (const path of this.pending.keys()) if (path !== key) this.pending.delete(path)
    if (this.needsRefresh) this.wake?.()
  }

  /** The Host acknowledged an active subscription and resolved workspace root. */
  start(): void {
    this.started.resolve(true)
  }

  /**
   * Keep the newest notice per retained path. A refresh supersedes pending notices.
   * @param notice - what the consumer receives next.
   * @param key - normalized Host path for the change.
   */
  push(notice: WorkspaceFileNotice, key: string): void {
    if (this.ended || this.needsRefresh) return
    if (notice.kind === 'refresh') {
      this.needsRefresh = true
      this.pending.clear()
      this.pathWasEvicted = false
    } else {
      this.pending.set(key, notice)
      if (this.pending.size > 2) {
        for (const path of this.pending.keys()) {
          if (path === this.hostKey || path === key) continue
          this.pending.delete(path)
          this.pathWasEvicted = true
          break
        }
      }
    }
    this.wake?.()
  }

  /** Deliver the pending refresh or matching notice, then finish. */
  end(): void {
    this.ended = true
    this.started.resolve(false)
    this.wake?.()
  }

  /** Unregister even when the consumer has not started pulling notices. */
  dispose(): void {
    this.leave()
  }

  /** @inheritdoc */
  async *[Symbol.asyncIterator](): AsyncIterator<WorkspaceFileNotice> {
    try {
      while (true) {
        const next = this.take()
        if (next !== undefined) {
          yield next
          continue
        }
        if (this.ended) return
        await new Promise<void>((resolve) => { this.wake = resolve })
        this.wake = undefined
      }
    } finally {
      this.dispose()
    }
  }

  private take(): WorkspaceFileNotice | undefined {
    const refresh = this.needsRefresh || (this.hostKey === undefined && (this.pathWasEvicted || this.pending.size > 1))
    const current = this.hostKey === undefined ? this.pending.values().next().value : this.pending.get(this.hostKey)
    this.pending.clear()
    this.needsRefresh = false
    this.pathWasEvicted = false
    return refresh ? { kind: 'refresh' } : current
  }
}

/** The stream and followers of one Session and requested path. */
class SessionFeed {
  private readonly followers = new Set<Follower>()
  private readonly stream: SupervisedStream<WorkspaceFileWatchFrame>
  private closed = false
  private started = false
  private acknowledged = false

  /**
   * @param remote - the Remote face carrying `workspaceFiles.changes`.
   * @param sessionId - the Session whose filesystem this feed observes.
   * @param path - target path submitted to the Host.
   * @param after - the previous feed of this target still closing, if any; the stream opens once it has settled.
   * @param onClose - called once when the stream is gone, whatever the cause, with the dispose that is closing it.
   */
  constructor(
    remote: WorkspaceFilesRemote,
    sessionId: SessionId,
    path: string,
    after: Promise<void> | undefined,
    private readonly onClose: (closed: Promise<void>) => void,
  ) {
    this.stream = remote.$stream<WorkspaceFileWatchFrame>({
      name: `workspace file changes of ${sessionId}`,
      // A predecessor still closing finishes first, so one target never has
      // two Host streams open at once.
      open: (signal) => {
        this.started = false
        return openAfter(after, () => remote.workspaceFiles.changes(sessionId, path, signal))
      },
      // A normal end means the Host closed the target's feed.
      ended: () => new Error(`workspace file changes of ${sessionId} ended`),
    })
    void this.pump()
  }

  /**
   * Register one resource address before its Host path is known.
   * @param follower - receives changes and binds its path after stat.
   */
  add(follower: Follower): void {
    this.followers.add(follower)
    if (this.started) follower.start()
  }

  /**
   * Unregister one follower; the last one leaving disposes the stream.
   * @param follower - the follower to drop.
   */
  remove(follower: Follower): void {
    this.followers.delete(follower)
    if (this.followers.size === 0) this.close()
  }

  private async pump(): Promise<void> {
    try {
      for await (const item of this.stream) {
        const frame = item.value
        switch (frame.kind) {
          case 'ready':
            item.accept()
            this.started = true
            for (const follower of this.followers) {
              follower.start()
              if (this.acknowledged) follower.push({ kind: 'refresh' }, '')
            }
            this.acknowledged = true
            break
          case 'change': {
            const key = keyOf(frame.change.absolutePath)
            const notice = editOf(frame.change)
            for (const follower of this.followers) follower.push(notice, key)
            break
          }
          default:
            assertNever(frame)
        }
      }
    } catch {
      // A terminal stream failure or the Host's end: followers end quietly
      // below, and the metadata they hold stays the last known.
    } finally {
      this.close()
    }
  }

  private close(): void {
    if (this.closed) return
    this.closed = true
    const closed = this.stream.dispose()
    for (const follower of this.followers) follower.end()
    this.followers.clear()
    this.onClose(closed)
  }
}

/**
 * Open a Host stream once a predecessor has finished closing.
 * @param after - the predecessor's dispose, or nothing to wait for.
 * @param open - opens the stream.
 * @returns the stream's items.
 */
async function* openAfter<T>(after: Promise<void> | undefined, open: () => AsyncIterable<T>): AsyncIterable<T> {
  await after
  yield* open()
}

/**
 * The write one Host frame reports.
 * @param frame - the Host frame.
 * @returns the edit notice followers receive.
 */
function editOf(frame: WorkspaceFileChange): WorkspaceFileEdit {
  return 'absent' in frame ? { kind: 'absent' } : { kind: 'changed', version: frame.version }
}

function assertNever(frame: never): never {
  throw new Error(`Unexpected workspace file watch frame: ${JSON.stringify(frame)}`)
}

/**
 * Per-target sharing of the Host's workspace file change streams.
 *
 * Owned by the provider; one instance serves every session of the Client.
 */
export class ChangeFeed {
  /** Live feeds only: a feed removes itself when its stream closes. */
  private readonly sessions = new Map<string, SessionFeed>()
  /** Streams still closing, by Session and path; a successor waits for its predecessor. */
  private readonly closing = new Map<string, Promise<void>>()

  /**
   * @param remote - the Remote face carrying `$stream` and `workspaceFiles.changes`.
   */
  constructor(private readonly remote: WorkspaceFilesRemote) {}

  /**
   * Follow one resource in one session before its Host path is known.
   *
   * The follower is registered on call. Pending changes coalesce while stat
   * is in flight. The first follower starts
   * target's local `changes` call. The iterable ends
   * when `signal` aborts or when the target stream is gone; ending it early
   * (`break`, `return`) unregisters the follower as well, and the last follower
   * of a target disposes its stream. Await a true `ready` result before stat
   * so the Host subscription is active, then bind each stat's absolute path. Until binding,
   * a change can trigger a retry. Once bound, deliver the latest matching notice or a refresh
   * when the subscription restarts or a replacement path's notice may have been evicted.
   * @param sessionId - the Session providing the file's read authority.
   * @param path - requested file path; followers share a stream only for the same Session and path.
   * @param signal - ends the follow.
   * @returns a single-consumer subscription with Host-path binding and explicit disposal.
   */
  follow(sessionId: SessionId, path: string, signal: AbortSignal): Follower {
    const feed = signal.aborted ? undefined : this.feedOf(sessionId, path)
    const leave = (): void => {
      signal.removeEventListener('abort', leave)
      follower.end()
      feed?.remove(follower)
    }
    const follower = new Follower(leave)
    if (feed === undefined) {
      follower.end()
    } else {
      feed.add(follower)
      signal.addEventListener('abort', leave, { once: true })
    }
    return follower
  }

  /**
   * Wait for every stream that is still closing, so an owner tearing down
   * leaves no Host stream behind.
   * @returns resolves once no stream of this feed is closing.
   */
  async settle(): Promise<void> {
    await Promise.all(this.closing.values())
  }

  private feedOf(sessionId: SessionId, path: string): SessionFeed {
    const key = JSON.stringify([sessionId, path])
    const existing = this.sessions.get(key)
    if (existing !== undefined) return existing
    const feed = new SessionFeed(this.remote, sessionId, path, this.closing.get(key), (closed) => {
      this.sessions.delete(key)
      // A dispose that rejects is still a settled close: nothing remains to wait for.
      const tracked: Promise<void> = closed.then(() => undefined, () => undefined).then(() => {
        if (this.closing.get(key) === tracked) this.closing.delete(key)
      })
      this.closing.set(key, tracked)
    })
    this.sessions.set(key, feed)
    return feed
  }
}
