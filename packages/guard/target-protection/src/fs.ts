/** Local file executor with mandatory target rules and the existing file sandbox. @module */
import { Context } from '@deepseek-ai/cordis'
import { FsTargetKey } from '@deepseek-ai/dsh-fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { FsTarget, FsInfo, FsPathInfo, FsDirEntry, FsWriteIntent, FsWriteOutcome, FsEditRequest, FsEditOutcome, FsVersion } from '@deepseek-ai/dsh-fs'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import type { Config } from '@deepseek-ai/dsh-fs-sandbox'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type TargetProtection from '@deepseek-ai/dsh-target-protection'
import type { LocalTargetOperation } from './file-rules.ts'

export type { Config } from '@deepseek-ai/dsh-fs-sandbox'

/** Replaces fs-sandbox; ordinary permission escalation cannot bypass target admission. */
export default class TargetFileSystem extends SandboxedFileSystem {
  static override inject = ['sandboxPolicy', 'targetProtection']
  private readonly protection: TargetProtection
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly streams = new Map<AsyncIterator<string>, () => Promise<void>>()

  /**
   * @param ctx - Composition requiring the sandbox and durable target owner.
   * @param config - Existing local filesystem options.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.protection = ctx.targetProtection
    ctx.effect(() => async () => {
      this.lifetime.abort()
      const closed = await Promise.allSettled([...this.streams.values()].map(close => close()))
      await Promise.allSettled(this.pending)
      const failures: unknown[] = []
      for (const result of closed) if (result.status === 'rejected') failures.push(result.reason)
      if (failures.length > 0) throw new AggregateError(failures, 'Guarded file streams could not be closed.')
    }, 'target-protected-fs.lifetime')
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

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    const signal = this.signal(opts?.signal)
    const target = await this.run(() => super.resolve(path, { ...opts, signal }))
    return this.admitted(target, 'metadata', signal)
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    const bounded = this.signal(signal)
    return this.run(async () => super.stat(await this.admitted(target, 'metadata', bounded), bounded))
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    const bounded = this.signal(signal)
    const target = await this.run(() => super.resolve(path, { ...opts, signal: bounded }))
    await this.admitted(target, 'metadata', bounded)
    return this.run(() => super.lstat(path, opts, bounded))
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    const bounded = this.signal(signal)
    return this.run(async () => super.readText(await this.admitted(target, 'read', bounded), bounded))
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    const bounded = this.signal(signal)
    return this.run(async () => super.readBytes(await this.admitted(target, 'read', bounded), bounded, maxBytes))
  }

  override async readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array> {
    const bounded = this.signal(signal)
    return this.run(async () => super.readByteRange(await this.admitted(target, 'read', bounded), range, bounded))
  }

  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    const bounded = this.signal(signal)
    const checked = await this.admitted(target, 'read', bounded)
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
    if (bounded.aborted) { await close(); bounded.throwIfAborted() }
    return this.readStream(source, checked, bounded, close)
  }

  private async* readStream(
    source: AsyncIterator<string>, checked: FsTarget, signal: AbortSignal, close: () => Promise<void>,
  ): AsyncIterable<string> {
    try {
      while (true) {
        signal.throwIfAborted()
        const next = await this.run(() => Promise.resolve(source.next()))
        signal.throwIfAborted()
        if (next.done) return
        await this.admitted(checked, 'read', signal)
        yield next.value
      }
    } finally { await close() }
  }

  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    const bounded = this.signal(signal)
    const entries = await this.run(async () => super.listDir(await this.admitted(target, 'list', bounded), bounded))
    for (const entry of entries) await this.admitted(entry.target, 'metadata', bounded)
    return entries
  }

  override async watch(target: FsTarget, changed: (error?: Error) => void, signal: AbortSignal): Promise<() => Promise<void>> {
    const bounded = this.signal(signal)
    await this.admitted(target, 'watch', bounded)
    // Existing watchers cannot yet revoke callbacks when protection rules change.
    void changed
    throw new HarnessError('File watching is unavailable under target protection.', 'TARGET_EXECUTION_UNCONFINED')
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
}
