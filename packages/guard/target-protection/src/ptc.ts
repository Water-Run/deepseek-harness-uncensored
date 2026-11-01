/** Target-aware PTC over a capability-only WebAssembly interpreter. @module */
import { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { Worker } from 'node:worker_threads'
import { isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { PtcRuntime, validatePtcBindings } from '@deepseek-ai/dsh-ptc-runtime'
import type { PtcBindingFunction, PtcJsonValue, PtcRunRequest, PtcRunResult, PtcRunSpec } from '@deepseek-ai/dsh-ptc-runtime'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { snapshotJsonValue } from '@deepseek-ai/dsh-util-values'
import { clampTimeout, MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { ptcEmission } from './ptc-protocol.ts'
import type { PtcBoot } from './ptc-protocol.ts'
import type TargetProtection from './index.ts'

/** Deployment limits for one private interpreter Worker. */
export interface PtcConfig {
  /** Default wall deadline, including host-binding waits. */
  timeoutMs?: number
  /** Largest numeric deadline; individual requests may explicitly disable it with timeoutMs: null. */
  maxTimeoutMs?: number
  /** QuickJS allocation bound; WebAssembly and V8 overhead are additional. */
  memoryBytes?: number
  /** QuickJS execution stack bound in bytes. */
  stackBytes?: number
  /** Native Worker V8 old-generation bound, excluding WebAssembly memory. */
  workerHeapMb?: number
  /** Maximum program source size in UTF-8 bytes. */
  maxProgramBytes?: number
  /** Maximum binding argument/reply size in UTF-8 bytes. */
  maxMessageBytes?: number
  /** Combined result/log JSON-byte bound. */
  maxOutputBytes?: number
  /** Maximum simultaneous host callbacks from one program. */
  maxPendingCalls?: number
  /** Maximum admitted programs; excess requests fail before allocation. */
  maxWorkers?: number
  /** Maximum wait for native termination before reporting an unconfirmed shutdown. */
  shutdownTimeoutMs?: number
}

interface LiveRun { controller: AbortController; finished: Promise<void> }
function json(text: string): PtcJsonValue {
  const input: unknown = JSON.parse(text)
  const value = snapshotJsonValue(input)
  if (value === undefined) throw new Error('Interpreter message must be lossless JSON')
  return value as PtcJsonValue
}
function failure(kind: NonNullable<PtcRunResult['error']>['kind'], message: string, logs: string[] = []): PtcRunResult {
  return { logs, error: { kind, message } }
}

/**
 * Resolve the private Worker entry for a source or compiled provider module.
 * @param moduleUrl - URL of the owning provider, retaining its source or artifact extension.
 * @returns Native Worker URL; source runs install the repository's ESM-only TypeScript hook.
 */
export function ptcWorkerEntry(moduleUrl: string): URL {
  if (!moduleUrl.endsWith('.ts')) return new URL('./worker.js', moduleUrl)
  const source = 'import { register } from ' + JSON.stringify(import.meta.resolve('tsx/esm/api'))
    + '; register(); await import(' + JSON.stringify(new URL('./worker.ts', moduleUrl).href) + ')'
  return new URL('data:text/javascript,' + encodeURIComponent(source))
}

/** Programs have no native APIs; declared Host bindings retain their own policy and cancellation ownership. */
export default class TargetPtcRuntime extends PtcRuntime {
  static inject = ['targetProtection', 'sandboxPolicy']
  static Config: schema<PtcConfig, Required<PtcConfig>> = schema.object({
    timeoutMs: schema.natural().min(1).max(MAX_TIMER_DELAY_MS).default(120000),
    maxTimeoutMs: schema.natural().min(1).max(MAX_TIMER_DELAY_MS).default(600000),
    memoryBytes: schema.natural().min(1048576).max(1073741824).default(67108864),
    stackBytes: schema.natural().min(16384).max(16777216).default(1048576),
    workerHeapMb: schema.natural().min(16).max(4096).default(128),
    maxProgramBytes: schema.natural().min(1024).max(67108864).default(1048576),
    maxMessageBytes: schema.natural().min(1024).max(67108864).default(4194304),
    maxOutputBytes: schema.natural().min(1024).max(67108864).default(1048576),
    maxPendingCalls: schema.natural().min(1).max(4096).default(128),
    maxWorkers: schema.natural().min(1).max(128).default(4),
    shutdownTimeoutMs: schema.natural().min(1).max(MAX_TIMER_DELAY_MS).default(10000),
  })
  readonly language = 'typescript'
  readonly isolation = 'worker-thread'
  private readonly config: Required<PtcConfig>
  private readonly protection: TargetProtection
  private readonly live = new Set<LiveRun>()
  private disposed = false
  private shutdownFailure: HarnessError | undefined

  /**
   * @param ctx - Owner with target protection and file-policy resolution.
   * @param config - Explicit interpreter budgets.
   */
  constructor(ctx: Context, config: PtcConfig) {
    super(ctx)
    this.config = TargetPtcRuntime.Config(config)
    this.protection = ctx.targetProtection
    ctx.effect(() => async () => {
      this.disposed = true
      const runs = [...this.live]
      for (const run of runs) run.controller.abort(new Error('PTC runtime is closing'))
      await Promise.all(runs.map(run => run.finished))
    }, 'target-ptc.workers')
  }

  override get executionInstructions(): string {
    return 'The program is an async TypeScript function body with top-level await and return. Only erasable syntax is supported, without enum or namespaces. Each call has fresh memory. Use only the declared async bindings and console.log. Node, process, require, module loading, native filesystem, network, timers and child processes are unavailable. Return a lossless JSON value or print output. Host bindings enforce their own policies.'
  }
  override get sandboxMode() { return this.ctx.sandboxPolicy.defaultMode }
  override get timeout() {
    return { defaultMs: Math.min(this.config.timeoutMs, this.config.maxTimeoutMs), maxMs: this.config.maxTimeoutMs }
  }

  override resolve(request: PtcRunRequest): PtcRunSpec {
    if (this.shutdownFailure !== undefined) throw this.shutdownFailure
    if (this.disposed) throw new Error('Target PTC resolve after disposal')
    validatePtcBindings(request, 'target-ptc')
    if (Buffer.byteLength(request.program) > this.config.maxProgramBytes) throw new Error('Target PTC program size exceeded')
    const sandboxPolicy = request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    const cwd = request.cwd ?? sandboxPolicy.workspaceRoot
    if (!isAbsolute(cwd)) throw new Error('Target PTC cwd must be absolute')
    return { ...request, cwd, sandboxPolicy,
      timeoutMs: request.timeoutMs === null ? null : clampTimeout(request.timeoutMs, this.config.timeoutMs, this.config.maxTimeoutMs, 'target-ptc: timeoutMs') }
  }

  override async run(spec: PtcRunSpec): Promise<PtcRunResult> {
    if (this.shutdownFailure !== undefined) throw this.shutdownFailure
    if (this.disposed) throw new Error('Target PTC run after disposal')
    if (this.live.size >= this.config.maxWorkers) return failure('worker-exit', 'Target PTC program capacity exceeded')
    const policy = this.protection.executionSignal()
    const controller = new AbortController(), completion = Promise.withResolvers<void>()
    const signal = AbortSignal.any([policy, controller.signal, ...spec.signal === undefined ? [] : [spec.signal]])
    if (signal.aborted) return failure('abort', 'Target PTC program cancelled')
    const release = this.protection.retainExecution()
    const run = { controller, finished: completion.promise }
    this.live.add(run)
    let timedOut = false
    const timer = spec.timeoutMs === null ? undefined : setTimeout(() => { timedOut = true; controller.abort() }, spec.timeoutMs)
    let worker: Worker | undefined
    const lifecycle = { exited: false, stopping: false }
    const exitReceipt = Promise.withResolvers<void>()
    try {
      const functions: PtcBindingFunction[] = []
      const namespaces = [...validatePtcBindings(spec, 'target-ptc').values()].map((namespace) => {
        const entries = Object.entries(namespace.functions), members = entries.map(([member]) => member)
        for (const [, binding] of entries) functions.push(binding)
        return { global: namespace.global, members, ...namespace.errorClass === undefined ? {} : { errorClass: namespace.errorClass } }
      })
      const data: PtcBoot = { program: spec.program, namespaces, limits: this.config }
      const environment: NodeJS.ProcessEnv = { TEMP: tmpdir(), TMP: tmpdir(), TMPDIR: tmpdir() }
      if (process.env.TSX_TSCONFIG_PATH !== undefined) environment.TSX_TSCONFIG_PATH = process.env.TSX_TSCONFIG_PATH
      const options = { workerData: data, execArgv: ['--disable-warning=ExperimentalWarning'], env: environment,
        resourceLimits: { maxOldGenerationSizeMb: this.config.workerHeapMb } }
      worker = new Worker(ptcWorkerEntry(import.meta.url), options)
      const native = worker
      const result = Promise.withResolvers<PtcRunResult>()
      const logs: string[] = []
      let outputBytes = 2, pending = 0, pendingBytes = 0, replyBytes = 0, expectedId = 1, expectedLogId = 1, settled = false
      const queuedReplies = new Map<number, number>()
      const settle = (value: PtcRunResult): void => {
        if (settled) return
        settled = true
        lifecycle.stopping = true
        result.resolve(Buffer.byteLength(JSON.stringify(value)) <= this.config.maxOutputBytes
          ? value : failure('output-limit', 'Target PTC output limit exceeded'))
      }
      native.once('exit', () => { lifecycle.exited = true; exitReceipt.resolve() })
      native.once('exit', (code) => { settle(failure('worker-exit', 'QuickJS Worker exited (' + String(code) + ')', logs)) })
      native.once('error', (error) => { settle(failure('worker-exit', error.message.slice(0, this.config.maxOutputBytes / 4), logs)) })
      const abort = (): void => { settle(failure(timedOut ? 'timeout' : 'abort', timedOut ? 'Target PTC deadline exceeded' : 'Target PTC program cancelled', logs)) }
      signal.addEventListener('abort', abort, { once: true })
      native.on('message', (input: unknown) => {
        if (lifecycle.stopping) return
        try {
          const message = ptcEmission.parse(input)
          if (message.kind === 'received') {
            const bytes = queuedReplies.get(message.id)
            if (bytes === undefined) throw new Error('Unknown binding acknowledgement')
            replyBytes -= bytes
            queuedReplies.delete(message.id)
          } else if (message.kind === 'log') {
            if (message.id !== expectedLogId++) throw new Error('Out-of-order console message')
            outputBytes += Buffer.byteLength(JSON.stringify(message.text)) + 1
            if (outputBytes > this.config.maxOutputBytes) settle(failure('output-limit', 'Target PTC output limit exceeded', logs))
            else { logs.push(message.text); native.postMessage({ kind: 'log-received', id: message.id }) }
          } else if (message.kind === 'done') {
            if (message.error !== undefined) {
              settle(failure(message.error.kind, message.error.message.slice(0, this.config.maxOutputBytes / 4), logs))
            } else if (message.value === undefined || Buffer.byteLength(message.value) + outputBytes > this.config.maxOutputBytes) {
              settle(failure('output-limit', 'Target PTC output limit exceeded', logs))
            } else {
              const envelope = json(message.value)
              if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('Invalid completion envelope')
              settle({ logs, ...Object.hasOwn(envelope, 'value') ? { value: envelope.value } : {} })
            }
          } else {
            const argumentBytes = Buffer.byteLength(message.args)
            const binding = functions[message.index]
            if (message.id !== expectedId++ || binding === undefined || pending >= this.config.maxPendingCalls
              || pendingBytes + argumentBytes > this.config.maxMessageBytes) throw new Error('Binding protocol limit exceeded')
            const args = json(message.args)
            pending++
            pendingBytes += argumentBytes
            void (async () => {
              let reply: { kind: 'reply'; id: number; ok: boolean; text: string }
              try {
                const value = snapshotJsonValue(await binding(args))
                if (value === undefined) throw new Error('Binding resolution must be lossless JSON')
                const text = JSON.stringify(value)
                if (Buffer.byteLength(text) > this.config.maxMessageBytes) throw new Error('Binding reply limit exceeded')
                reply = { kind: 'reply', id: message.id, ok: true, text }
              } catch (error) {
                reply = { kind: 'reply', id: message.id, ok: false, text: (error instanceof Error ? error.message : String(error)).slice(0, this.config.maxMessageBytes / 4) }
              } finally { pending--; pendingBytes -= argumentBytes }
              if (!lifecycle.stopping) {
                const bytes = Buffer.byteLength(reply.text)
                if (replyBytes + bytes > this.config.maxMessageBytes) { settle(failure('protocol', 'Queued binding replies exceeded the message budget', logs)); return }
                replyBytes += bytes
                queuedReplies.set(reply.id, bytes)
                native.postMessage(reply)
              }
            })().catch(() => { if (!lifecycle.stopping) settle(failure('protocol', 'Binding reply could not be delivered', logs)) })
          }
        } catch (error) {
          settle(failure('protocol', error instanceof Error ? error.message.slice(0, this.config.maxOutputBytes / 4) : 'Invalid interpreter message', logs))
        }
      })
      try { return await result.promise }
      finally { signal.removeEventListener('abort', abort) }
    } catch (error) {
      return failure('worker-exit', error instanceof Error ? error.message.slice(0, this.config.maxOutputBytes / 4) : 'QuickJS Worker could not start')
    } finally {
      lifecycle.stopping = true
      clearTimeout(timer)
      try {
        if (worker !== undefined) {
          const expired = Promise.withResolvers<never>()
          const shutdownTimer = setTimeout(() => { expired.reject(new Error('Native PTC shutdown deadline exceeded')) }, this.config.shutdownTimeoutMs)
          try { await Promise.race([worker.terminate(), expired.promise]) }
          finally { clearTimeout(shutdownTimer) }
        }
      } catch (error) {
        this.shutdownFailure = new HarnessError('QuickJS Worker closure could not be confirmed. Restart the Host before reuse.',
          'PTC_SHUTDOWN_UNCONFIRMED', { cause: error })
        throw this.shutdownFailure
      } finally {
        const complete = (): void => { release(); this.live.delete(run); completion.resolve() }
        if (worker === undefined || lifecycle.exited) complete()
        else void exitReceipt.promise.then(complete)
      }
    }
  }
}
