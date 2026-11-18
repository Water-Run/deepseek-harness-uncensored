/** Local file executor with mandatory target rules and the existing file sandbox. @module */
import { Context } from '@deepseek-ai/cordis'
import { FsTargetKey } from '@deepseek-ai/dsh-fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { FsTarget, FsInfo, FsPathInfo, FsDirEntry, FsWriteIntent, FsWriteOutcome, FsEditRequest, FsEditOutcome, FsVersion, FsDeleteOutcome, FsMoveOutcome } from '@deepseek-ai/dsh-fs'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import type { Config } from '@deepseek-ai/dsh-fs-sandbox'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type TargetProtection from '@deepseek-ai/dsh-target-protection'
import type {} from './settings.ts'
import type { LocalTargetOperation } from './file-rules.ts'
import { TargetProtectionError } from './errors.ts'

export type { Config } from '@deepseek-ai/dsh-fs-sandbox'

/** Replaces fs-sandbox; ordinary permission escalation cannot bypass target admission. */
export default class TargetFileSystem extends SandboxedFileSystem {
  static override inject = ['sandboxPolicy', 'targetProtection']
  private readonly protection: TargetProtection
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly streams = new Map<AsyncIterator<string>, () => Promise<void>>()
  private readonly watches = new Set<() => Promise<void>>()
  private watchFailure: Error | undefined

  /**
   * @param ctx - Composition requiring the sandbox and durable target owner.
   * @param config - Existing local filesystem options.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.protection = ctx.targetProtection
    ctx.effect(() => async () => {
      this.lifetime.abort()
      const closed = await Promise.allSettled([...this.streams.values(), ...this.watches].map(close => close()))
      await Promise.allSettled(this.pending)
      const failures: unknown[] = []
      for (const result of closed) if (result.status === 'rejected') failures.push(result.reason)
      if (this.watchFailure !== undefined) failures.push(this.watchFailure)
      if (failures.length > 0) throw new AggregateError(failures, 'Guarded file resources could not be closed.')
    }, 'target-protected-fs.lifetime')
    ctx.provide('targetProtectedFiles', true)
  }

  private signal(signal?: AbortSignal): AbortSignal {
    return AbortSignal.any([this.lifetime.signal, this.protection.executionSignal(), ...signal === undefined ? [] : [signal]])
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const release = this.protection.retainExecution()
    const pending = Promise.resolve().then(operation).finally(release)
    this.pending.add(pending)
    return pending.finally(() => { this.pending.delete(pending) })
  }

  private readResult<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    return this.run(async () => {
      const { revision } = await this.protection.snapshot()
      signal.throwIfAborted()
      const value = await operation()
      this.assertReadRevision(revision, signal)
      return value
    })
  }

  private assertReadRevision(revision: number, signal: AbortSignal): void {
    signal.throwIfAborted()
    if (this.protection.currentSnapshot().revision !== revision) {
      throw new HarnessError('Target rules changed during the file read. Retry the request.', 'TARGET_SETTINGS_CHANGED')
    }
  }

  private async admitted(target: FsTarget, operation: LocalTargetOperation, signal: AbortSignal): Promise<FsTarget> {
    signal.throwIfAborted()
    if (target.displayPath !== this.processPath(target)) {
      const visible = await this.protection.checkLocalFile(target.displayPath, operation, signal)
      if (!visible.decision.allowed) throw new HarnessError('Target protection refused this file operation.', visible.decision.code)
    }
    const result = await this.protection.checkLocalFile(this.processPath(target), operation, signal)
    signal.throwIfAborted()
    if (!result.decision.allowed) throw new HarnessError('Target protection refused this file operation.', result.decision.code)
    return { displayPath: target.displayPath, targetKey: FsTargetKey(result.path) }
  }

  protected override async authorizeMutation(target: FsTarget, signal?: AbortSignal): Promise<void> {
    const checked = await this.admitted(target, 'mutate', this.signal(signal))
    if (checked.targetKey !== target.targetKey) throw new HarnessError('The file target changed during execution.', 'TARGET_IDENTITY_UNVERIFIED')
  }

  protected override async authorizeMove(source: FsTarget, destination: FsTarget, signal?: AbortSignal): Promise<void> {
    const before = await this.protection.snapshot()
    await super.authorizeMove(source, destination, signal)
    if ((await this.protection.snapshot()).revision !== before.revision) {
      throw new TargetProtectionError('conflict', 'Target rules changed while checking file endpoints; retry after changes settle.')
    }
  }

  protected override async authorizeFileMutation(
    targets: readonly FsTarget[], signal?: AbortSignal, policy?: SandboxExecutionPolicy,
  ): Promise<void> {
    const before = await this.protection.snapshot()
    await super.authorizeFileMutation(targets, signal, policy)
    if ((await this.protection.snapshot()).revision !== before.revision) {
      throw new TargetProtectionError('conflict', 'Target rules changed while checking file endpoints; retry after changes settle.')
    }
  }

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    const signal = this.signal(opts?.signal)
    return this.readResult(signal, async () => this.admitted(await super.resolve(path, { ...opts, signal }), 'metadata', signal))
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    const bounded = this.signal(signal)
    return this.readResult(bounded, async () => super.stat(await this.admitted(target, 'metadata', bounded), bounded))
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    const bounded = this.signal(signal)
    return this.readResult(bounded, async () => {
      const target = await super.resolve(path, { ...opts, signal: bounded })
      await this.admitted(target, 'metadata', bounded)
      return super.lstat(path, opts, bounded)
    })
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    const bounded = this.signal(signal)
    return this.readResult(bounded, async () => super.readText(await this.admitted(target, 'read', bounded), bounded))
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    const bounded = this.signal(signal)
    return this.readResult(bounded, async () => super.readBytes(await this.admitted(target, 'read', bounded), bounded, maxBytes))
  }

  override async readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array> {
    const bounded = this.signal(signal)
    return this.readResult(bounded, async () => super.readByteRange(await this.admitted(target, 'read', bounded), range, bounded))
  }

  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    const bounded = this.signal(signal)
    return this.run(async () => {
      const { revision } = await this.protection.snapshot()
      const checked = await this.admitted(target, 'read', bounded)
      this.assertReadRevision(revision, bounded)
      const release = this.protection.retainExecution()
      let source: AsyncIterator<string>
      try { source = (await super.streamText(checked, bounded))[Symbol.asyncIterator]() }
      catch (error) { release(); throw error }
      let closing: Promise<void> | undefined
      const close = (): Promise<void> => {
        closing ??= Promise.resolve().then(async () => { await source.return?.() })
          .finally(() => { this.streams.delete(source); release() })
        return closing
      }
      this.streams.set(source, close)
      try { this.assertReadRevision(revision, bounded) }
      catch (error) { await close(); throw error }
      const chunks = this.readStream(source, checked, revision, bounded, close)
      // Returning or throwing before the first read skips the generator's finally block.
      const finish = async (result: Promise<IteratorResult<string, void>>): Promise<IteratorResult<string, void>> => {
        try { return await result }
        finally { await close() }
      }
      return {
        [Symbol.asyncIterator]() { return this },
        next: () => chunks.next(),
        return: value => finish(chunks.return(value)),
        throw: error => finish(chunks.throw(error)),
      } satisfies AsyncIterableIterator<string, void, void>
    })
  }

  private async* readStream(
    source: AsyncIterator<string>, checked: FsTarget, revision: number, signal: AbortSignal, close: () => Promise<void>,
  ): AsyncGenerator<string, void, void> {
    try {
      while (true) {
        this.assertReadRevision(revision, signal)
        const next = await this.run(() => Promise.resolve(source.next()))
        if (!next.done) await this.admitted(checked, 'read', signal)
        this.assertReadRevision(revision, signal)
        if (next.done) return
        yield next.value
      }
    } finally { await close() }
  }

  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    const bounded = this.signal(signal)
    return this.readResult(bounded, async () => {
      const entries = await super.listDir(await this.admitted(target, 'list', bounded), bounded)
      for (const entry of entries) await this.admitted(entry.target, 'metadata', bounded)
      return entries
    })
  }

  /** Watch an admitted target and end the subscription when its policy changes. */
  override async watch(target: FsTarget, changed: (error?: Error) => void, signal: AbortSignal): Promise<() => Promise<void>> {
    if (this.watchFailure !== undefined) throw this.watchFailure
    const lifetime = new AbortController()
    const bounded = this.signal(AbortSignal.any([signal, lifetime.signal]))
    return this.run(async () => {
      const checked = await this.admitted(target, 'watch', bounded)
      const release = this.protection.retainExecution()
      const native = Promise.withResolvers<(() => Promise<void>) | undefined>()
      let initialized = false
      let pending: { path: string; error?: Error } | undefined
      let delivery: Promise<void> | undefined
      let closing: Promise<void> | undefined

      const close = (): Promise<void> => {
        if (closing !== undefined) return closing
        pending = undefined
        bounded.removeEventListener('abort', aborted)
        lifetime.abort()
        closing = native.promise.then(async (stop) => {
          try { await stop?.() }
          catch (error) {
            this.watchFailure ??= watchError(error)
            this.ctx.logger.warn('Protected file watch could not close. Restart the Host before opening another watch.', error)
            throw error
          } finally {
            try { await delivery }
            finally { this.watches.delete(close); release() }
          }
        })
        return closing
      }
      const retire = (): void => {
        void close().catch((_error: unknown) => { /* close reports and retains the failure */ })
      }
      const notify = (error?: Error): void => {
        try { if (error === undefined) changed(); else changed(error) }
        catch (failure) {
          this.ctx.logger.warn('Protected file watch callback failed.', failure)
          retire()
        }
      }
      const aborted = (): void => {
        retire()
        if (initialized && !signal.aborted && !this.lifetime.signal.aborted) {
          notify(new HarnessError('Target rules changed. Reopen this file watch.', 'TARGET_SETTINGS_CHANGED'))
        }
      }
      const recheck = async (): Promise<void> => {
        const current = await this.admitted(target, 'watch', bounded)
        if (current.targetKey !== checked.targetKey) {
          throw new HarnessError('The watched path changed. Reopen this file watch.', 'TARGET_IDENTITY_UNVERIFIED')
        }
      }
      const active = (): boolean => !bounded.aborted
      const drain = async (): Promise<void> => {
        while (active() && pending !== undefined) {
          const event = pending
          pending = undefined
          try {
            const revision = this.protection.currentSnapshot().revision
            await recheck()
            if (event.path !== checked.targetKey) {
              await this.admitted({ displayPath: event.path, targetKey: FsTargetKey(event.path) }, 'metadata', bounded)
            }
            if (revision !== this.protection.currentSnapshot().revision) {
              throw new HarnessError('Target rules changed. Reopen this file watch.', 'TARGET_SETTINGS_CHANGED')
            }
          } catch (error) {
            if (active()) { notify(watchError(error)); retire() }
            return
          }
          if (!active()) return
          notify(event.error)
          if (event.error !== undefined) { retire(); return }
        }
      }
      const flush = (): void => {
        if (!initialized || bounded.aborted || delivery !== undefined || pending === undefined) return
        delivery = drain().finally(() => { delivery = undefined; flush() })
      }
      this.watches.add(close)
      bounded.addEventListener('abort', aborted, { once: true })
      try {
        bounded.throwIfAborted()
        native.resolve(await super.watchLocal(checked, (path, error) => {
          if (bounded.aborted || pending?.error !== undefined) return
          pending = error === undefined ? { path } : { path, error }
          flush()
        }, bounded, false))
        await recheck()
        bounded.throwIfAborted()
        initialized = true
        flush()
        return close
      } catch (error) {
        native.resolve(undefined)
        await close()
        throw error
      }
    })
  }

  override async writeText(
    target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsWriteOutcome> {
    const bounded = this.signal(signal)
    return this.run(async () => super.writeText(await this.admitted(target, 'mutate', bounded), content, expected, bounded, sandboxPolicy))
  }

  override async editText(
    target: FsTarget, edit: FsEditRequest, expected?: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome> {
    const bounded = this.signal(signal)
    return this.run(async () => super.editText(await this.admitted(target, 'mutate', bounded), edit, expected, bounded, sandboxPolicy))
  }

  override async patchText(
    target: FsTarget, hunks: Parameters<SandboxedFileSystem['patchText']>[1], expected?: { version: FsVersion },
    signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome> {
    const bounded = this.signal(signal)
    return this.run(() => super.patchText(target, hunks, expected, bounded, sandboxPolicy))
  }

  override async deleteFile(
    target: FsTarget, expected?: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsDeleteOutcome> {
    const bounded = this.signal(signal)
    return this.run(() => super.deleteFile(target, expected, bounded, sandboxPolicy))
  }

  override async moveFile(
    source: FsTarget, destination: FsTarget, options: Parameters<SandboxedFileSystem['moveFile']>[2],
    signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsMoveOutcome> {
    const bounded = this.signal(signal)
    return this.run(() => super.moveFile(source, destination, options, bounded, sandboxPolicy))
  }

  override async removeFile(
    target: FsTarget, expected: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<void> {
    const bounded = this.signal(signal)
    return this.run(() => super.removeFile(target, expected, bounded, sandboxPolicy))
  }

  override async renameFile(
    source: FsTarget, destination: FsTarget, expected: { version: FsVersion },
    signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<void> {
    const bounded = this.signal(signal)
    return this.run(() => super.renameFile(source, destination, expected, bounded, sandboxPolicy))
  }
}

function watchError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
