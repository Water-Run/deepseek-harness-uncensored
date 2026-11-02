/** Bounded terminal RPC with whole-native-range termination below the public terminal handle. @module */
import { addAbortListener } from 'node:events'
import { PassThrough, type Duplex } from 'node:stream'
import { extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { SubprocessHandle, SubprocessSpawnSpec, SubprocessTerminalHandle, SubprocessTerminalSpawnSpec,
  SubprocessOutcome, SubprocessTerminalSignal, SubprocessTerminalActivity, SubprocessTerminalForeground } from '@deepseek-ai/dsh-subprocess'
import { targetEnvironment } from '@deepseek-ai/dsh-subprocess-local/managed'
import { NATIVE_FRAME, NATIVE_FRAME_MAX_BYTES, NativeProtocolError, readNativeFrames, writeNativeFrame, writeNativeBytes } from './native-protocol.ts'
import { nativeTerminalSpec, nativeTerminalRequest, nativeTerminalReply, nativeTerminalOutcome } from './native-terminal-protocol.ts'
import type { NativeTerminalRequest, NativeTerminalLaunch } from './native-terminal-protocol.ts'

/** Deployment bounds for allocation, acknowledged operations and concurrent requests. */
export interface NativeTerminalLimits {
  startupTimeoutMs: number
  requestTimeoutMs: number
  maxRequests: number
  diagnosticMaxBytes: number
}

type Request = NativeTerminalRequest extends infer T ? T extends NativeTerminalRequest ? Omit<T, 'sequence'> : never : never
const pid = z.number().int().min(1).max(0xffffffff)
const started = z.object({ pid }).strict()
const foreground = z.object({ processGroupId: pid, inputWaiting: z.boolean() }).strict().nullable()
const activity = z.object({ state: z.enum(['idle', 'busy', 'unknown']), revision: z.number().int().nonnegative() }).strict()

function helperSpec(spec: SubprocessTerminalSpawnSpec, signal: AbortSignal, limit: number): SubprocessSpawnSpec {
  const source = extname(fileURLToPath(import.meta.url)) === '.ts'
  /* v8 ignore next -- The compiled terminal smoke exercises the JavaScript entry. */
  const entry = fileURLToPath(new URL(source ? './native-terminal-entry.ts' : './native-terminal-entry.js', import.meta.url))
  const env: NodeJS.ProcessEnv = {}
  for (const key of Object.keys(process.env)) {
    if (!/^(SystemRoot|WINDIR|SystemDrive|ComSpec|ELECTRON_RUN_AS_NODE)$/iu.test(key)) env[key] = undefined
  }
  /* v8 ignore next -- Compiled helpers do not require a source tsconfig. */
  if (source) env.TSX_TSCONFIG_PATH = fileURLToPath(new URL('../../../../tsconfig.base.json', import.meta.url))
  return {
    /* v8 ignore next -- Compiled helpers do not load TypeScript. */
    argv: [process.execPath, ...source ? ['--import', import.meta.resolve('tsx/esm')] : [], entry],
    cwd: dirname(entry), env, signal, graceMs: spec.graceMs,
    stdio: { stdin: 'ignore', stdout: { maxBytes: limit }, stderr: { maxBytes: limit }, control: 'pipe' },
  }
}

/** A terminal whose PID is learned only from a validated startup acknowledgement. */
class NativeTerminalHandle {
  readonly output = new PassThrough()
  private readonly outcome = Promise.withResolvers<SubprocessOutcome>()
  readonly done = this.outcome.promise
  private rootPid: number | undefined
  private sequence = 0
  private closing = false
  private quiescent = false
  private exited = false
  private disposal: Promise<void> | undefined
  private readonly pending = new Map<number, {
    operation: Request['operation']
    resolve(value: unknown): void
    reject(reason: unknown): void
    timer: ReturnType<typeof setTimeout>
  }>()
  private readonly operations = new Set<Promise<unknown>>()
  private readonly reading: Promise<void>

  constructor(private readonly native: SubprocessHandle, private readonly channel: Duplex,
    private readonly graceMs: number, private readonly limits: NativeTerminalLimits) {
    void this.done.catch(() => {})
    this.output.on('error', this.transportFailed)
    channel.on('error', this.transportFailed)
    channel.once('close', this.transportClosed)
    this.reading = this.read().catch((error: unknown) => { if (!this.closing) this.fail(error) })
    void native.done.then((value) => {
      if (!this.closing) this.fail(new NativeProtocolError(`Native terminal helper exited unexpectedly (${value.exitCode}).`))
    }, (error: unknown) => { if (!this.closing) this.fail(error) })
  }

  async initialize(spec: NativeTerminalLaunch): Promise<number> {
    return started.parse(await this.request({ operation: 'start', spec })).pid
  }

  private readonly transportFailed = (error: Error): void => { if (!this.closing) this.fail(error) }
  private readonly transportClosed = (): void => {
    if (!this.closing) this.fail(new NativeProtocolError('Native terminal control transport closed.'))
  }

  private rejectPending(reason: unknown): void {
    for (const operation of this.pending.values()) { clearTimeout(operation.timer); operation.reject(reason) }
    this.pending.clear()
  }

  private fail(reason: unknown): void {
    this.outcome.reject(reason)
    this.output.destroy()
    this.rejectPending(reason)
    void this.terminate().catch(() => { /* The native provider also retains and reports an unconfirmed range. */ })
  }

  private async read(): Promise<void> {
    for await (const frame of readNativeFrames(this.channel)) {
      if (frame.tag === NATIVE_FRAME.terminalOutput) {
        if (this.exited || this.rootPid === undefined) throw new NativeProtocolError('Terminal output arrived outside its active lifetime.')
        if (!this.output.destroyed) await writeNativeBytes(this.output, frame.data)
      } else if (frame.tag === NATIVE_FRAME.terminalReply) {
        const reply = nativeTerminalReply.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame.data)))
        const operation = this.pending.get(reply.sequence)
        if (operation === undefined) {
          if (this.closing) continue
          throw new NativeProtocolError('Unexpected terminal acknowledgement.')
        }
        if (reply.ok && operation.operation === 'start') this.rootPid = started.parse(reply.value).pid
        this.pending.delete(reply.sequence); clearTimeout(operation.timer)
        if (reply.ok) operation.resolve(reply.value)
        else operation.reject(new Error(reply.message))
      } else if (frame.tag === NATIVE_FRAME.terminalExit) {
        if (this.exited || this.rootPid === undefined) throw new NativeProtocolError('Unexpected terminal exit record.')
        const value = nativeTerminalOutcome.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame.data)))
        this.exited = true; this.output.end(); this.outcome.resolve(value)
        void Promise.allSettled(this.operations).then(() => this.terminate()).catch(() => {
          /* The native provider independently retains failed range cleanup. */
        })
      } else throw new NativeProtocolError('Unexpected native terminal response frame.')
    }
    throw new NativeProtocolError('Native terminal transport ended before closure.')
  }

  private request(request: Request, internal = false): Promise<unknown> {
    if (!internal && (this.closing || this.exited)) return Promise.reject(new Error('The terminal session has closed.'))
    if (this.pending.size >= this.limits.maxRequests) return Promise.reject(new Error('Too many pending terminal operations.'))
    const sequence = ++this.sequence
    const bytes = Buffer.from(JSON.stringify(nativeTerminalRequest.parse({ ...request, sequence })))
    if (bytes.byteLength > NATIVE_FRAME_MAX_BYTES) {
      return Promise.reject(new NativeProtocolError('Terminal request exceeds its protocol bound.'))
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error('Terminal operation timed out; the session was stopped. Do not replay the operation automatically.'))
      }, internal ? this.graceMs
        : request.operation === 'start' ? this.limits.startupTimeoutMs : this.limits.requestTimeoutMs)
      this.pending.set(sequence, { operation: request.operation, resolve, reject, timer })
      void writeNativeFrame(this.channel, { tag: NATIVE_FRAME.terminalRequest, data: bytes })
        .catch((error: unknown) => { this.fail(error) })
    })
  }

  private operate<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing || this.exited) return Promise.reject(new Error('The terminal session has closed.'))
    const running = operation().finally(() => { this.operations.delete(running) })
    this.operations.add(running)
    return running
  }

  private response<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      const error = new NativeProtocolError('Invalid terminal operation result.')
      this.fail(error); throw error
    }
    return parsed.data
  }

  write(text: string): Promise<void> {
    return this.operate(async () => {
      // JSON can encode one UTF-16 unit as six bytes; preserve pairs while leaving room for the request envelope.
      const size = Math.floor(NATIVE_FRAME_MAX_BYTES / 6) - 128
      for (let start = 0; start < text.length;) {
        let end = Math.min(text.length, start + size)
        const last = text.charCodeAt(end - 1)
        if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--
        this.response(z.null(), await this.request({ operation: 'write', text: text.slice(start, end) }))
        start = end
      }
    })
  }

  resize(cols: number, rows: number): Promise<void> {
    return this.operate(async () => { this.response(z.null(), await this.request({ operation: 'resize', cols, rows })) })
  }

  inspectForeground(): Promise<SubprocessTerminalForeground | undefined> {
    if (this.closing || this.exited) return Promise.resolve(undefined)
    return this.operate(async () => this.response(foreground, await this.request({ operation: 'foreground' })) ?? undefined)
  }

  inspectActivity(): Promise<SubprocessTerminalActivity> {
    if (this.quiescent) return Promise.resolve({ state: 'idle', revision: this.sequence })
    if (this.closing || this.exited) return Promise.resolve({ state: 'unknown', revision: this.sequence })
    return this.operate(async () => this.response(activity, await this.request({ operation: 'activity' })))
  }

  signalForeground(signal: SubprocessTerminalSignal): Promise<number> {
    return this.operate(async () => this.response(pid, await this.request({ operation: 'signal', signal })))
  }

  terminate(): Promise<void> {
    this.disposal ??= this.close()
    return this.disposal
  }

  private async close(): Promise<void> {
    this.closing = true
    if (!this.exited) this.output.destroy()
    this.rejectPending(new Error('The terminal session was closed.'))
    try { if (!this.channel.destroyed) await this.request({ operation: 'close' }, true) }
    catch (_gracefulCloseFailed) { /* The independent native Job below remains the authoritative termination path. */ }
    this.native.terminate()
    this.channel.destroy()
    this.rejectPending(new Error('The terminal session was closed.'))
    try {
      if (!await this.native.waitForExit()) throw new NativeProtocolError('Native terminal range did not confirm closure.')
      await Promise.allSettled([this.reading, ...this.operations])
      this.quiescent = true
    } catch (error) { this.outcome.reject(error); throw error }
    finally {
      this.channel.off('error', this.transportFailed); this.channel.off('close', this.transportClosed)
      if (!this.exited) this.outcome.reject(new Error('Terminal stopped before its exit status was reported.'))
    }
  }
}

/**
 * Allocate the fixed helper through the existing protected spawn path, then publish its acknowledged terminal.
 * @param spec - Complete terminal request; cancellation affects allocation only.
 * @param spawn - Native provider's owned process launch.
 * @param limits - Startup and acknowledged-operation bounds.
 * @returns A terminal whose termination awaits the independent native range.
 */
export async function createNativeTerminal(
  spec: SubprocessTerminalSpawnSpec, spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle, limits: NativeTerminalLimits,
): Promise<SubprocessTerminalHandle> {
  spec.signal?.throwIfAborted()
  const target = nativeTerminalSpec.parse({ argv: spec.argv, cwd: spec.cwd, env: targetEnvironment(spec),
    cols: spec.cols, rows: spec.rows, terminalType: spec.terminalType, graceMs: spec.graceMs, shellActivity: spec.shellActivity ?? false })
  const startup = new AbortController()
  const subscription = spec.signal === undefined ? undefined : addAbortListener(spec.signal, () => { startup.abort(spec.signal?.reason) })
  const timer = setTimeout(() => { startup.abort(new Error('Native terminal startup timed out.')) }, limits.startupTimeoutMs)
  let native: SubprocessHandle | undefined, terminal: NativeTerminalHandle | undefined
  try {
    native = spawn(helperSpec(spec, startup.signal, limits.diagnosticMaxBytes))
    if (native.control === undefined) throw new NativeProtocolError('Native terminal control pipe was not allocated.')
    terminal = new NativeTerminalHandle(native, native.control, spec.graceMs, limits)
    const pid = await terminal.initialize(target)
    startup.signal.throwIfAborted()
    return Object.assign(terminal, { pid })
  } catch (error) {
    try {
      if (terminal !== undefined) await terminal.terminate()
      else if (native !== undefined) {
        native.terminate()
        if (!await native.waitForExit()) throw new NativeProtocolError('Native terminal startup range did not close.')
      }
    } catch (cleanup) { throw new AggregateError([error, cleanup], 'Native terminal startup and cleanup failed.') }
    startup.signal.throwIfAborted()
    throw error
  } finally { clearTimeout(timer); subscription?.[Symbol.dispose]() }
}
