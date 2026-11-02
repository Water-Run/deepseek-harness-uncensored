/** Host-side process handle backed by a separately owned broker range and validated worker frames. @module */
import { Duplex, PassThrough, Writable } from 'node:stream'
import { z } from 'zod'
import type { SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { validateSubprocessSpec, type ManagedProcessLaunch } from '@deepseek-ai/dsh-subprocess-local/managed'
import { OutputCollector } from '@deepseek-ai/dsh-subprocess-local/output'
import type { NativeBrokerConfig } from './native-broker-config.ts'
import { NATIVE_FRAME, NATIVE_FRAME_MAX_BYTES, NativeProtocolError, readNativeFrames, writeNativeFrame, writeNativeBytes } from './native-protocol.ts'

/** Prepared strict outer range. A failed prepare must retain no unowned process or rule lease. */
export interface NativeHostStart {
  carrier: ManagedProcessLaunch
  config: NativeBrokerConfig
  /** Release rules, proxy and private resources only after the outer range is confirmed empty. */
  release(): Promise<void>
}

/** Process facts and transport ownership returned to the mounting service. */
export interface NativeHostExecution {
  launch: ManagedProcessLaunch
  /** Output transport and range completion; services retain this record until settlement. */
  settled: Promise<void>
  /** Stop the range, close caller transports and join all retained work. */
  dispose(): Promise<void>
}

const outcomeSchema = z.object({ exitCode: z.number().int().min(0).max(0xffff_ffff).nullable(), signal: z.null() }).strict()
const failureSchema = z.object({ code: z.string().min(1).max(80) }).strict()

/**
 * Allocate immediate subprocess streams while policy preparation and strict broker startup run asynchronously.
 * @param spec - Validated caller command, I/O dispositions and cancellation timing.
 * @param environment - Complete scrubbed target environment; never used to start the trusted broker.
 * @param prepare - Own configuration and create the strict broker range; rejection must leave no live execution.
 * @param diagnosticMaxBytes - Retained broker-diagnostic byte budget supplied by the mounting configuration.
 * @param report - Owner's visible failure reporter; receives protocol and post-exit transport failures.
 * @returns A managed launch plus independently retained transport cleanup.
 */
export function createNativeHostExecution(
  spec: SubprocessSpawnSpec, environment: Record<string, string>,
  prepare: (signal: AbortSignal) => Promise<NativeHostStart>, diagnosticMaxBytes: number, report: (error: Error) => void,
): NativeHostExecution {
  validateSubprocessSpec(spec)
  const abort = new AbortController(), direct = Promise.withResolvers<SubprocessOutcome>(), range = Promise.withResolvers<undefined>()
  const ready = Promise.withResolvers<Writable>()
  const stdout = new PassThrough(), stderr = new PassThrough(), controlOutput = new PassThrough()
  const diagnostics = new OutputCollector(diagnosticMaxBytes, 'native-broker', undefined)
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  const clearStartup = (): void => { if (startupTimer !== undefined) clearTimeout(startupTimer); startupTimer = undefined }
  const state: {
    start?: NativeHostStart
    failed?: Error
    cancelled: boolean
    reason?: unknown
    physicalExit: boolean
    disposed: boolean
  } = {
    cancelled: false, physicalExit: false, disposed: false,
  }
  const streams = [stdout, stderr, controlOutput]
  const tasks: Promise<unknown>[] = []
  const send = async (tag: number, data: Uint8Array): Promise<void> => {
    const destination = await ready.promise
    if (state.physicalExit) throw new NativeProtocolError('Native command range has closed.')
    for (let offset = 0; offset < data.byteLength; offset += NATIVE_FRAME_MAX_BYTES) {
      await writeNativeFrame(destination, { tag, data: data.subarray(offset, offset + NATIVE_FRAME_MAX_BYTES) })
    }
    if (data.byteLength === 0) await writeNativeFrame(destination, { tag, data })
  }
  const inputPipe = (tag: number, endTag: number): Writable => new Writable({
    write(chunk: Buffer, _encoding, callback) { void send(tag, chunk).then(() => { callback() }, callback) },
    final(callback) { void send(endTag, Buffer.alloc(0)).then(() => { callback() }, callback) },
  })
  const stdin = spec.stdio.stdin === 'ignore' ? null : inputPipe(NATIVE_FRAME.stdin, NATIVE_FRAME.stdinEnd)
  const controlInput = inputPipe(NATIVE_FRAME.control, NATIVE_FRAME.controlEnd)
  const control = spec.stdio.control === 'pipe' ? Duplex.from({ readable: controlOutput, writable: controlInput }) : undefined
  const notify = (error: Error): void => {
    try { report(error) }
    catch (reportError) {
      try { process.stderr.write(`Native failure reporter failed: ${String(reportError)}\n`) }
      catch (_stderrUnavailable) { /* Result promises still expose failure when both diagnostic channels are unavailable. */ }
    }
  }
  const stop = (signal: 'SIGTERM' | 'SIGKILL', reason?: unknown): void => {
    clearStartup()
    if (state.physicalExit) return
    if (!state.cancelled) { state.cancelled = true; state.reason = reason === undefined ? new Error('Native command was terminated.') : reason }
    ready.reject(new Error('Native command input was cancelled.', { cause: state.reason }))
    abort.abort(state.reason)
    try { state.start?.carrier.owner.signal(signal, state.reason) }
    catch (error) {
      notify(new Error('Native broker termination failed.', { cause: error }))
      try { state.start?.carrier.owner.terminateForHostExit() }
      catch (forceError) { notify(new Error('Native broker forced termination failed.', { cause: forceError })) }
    }
  }
  const fail = (reason: unknown): void => {
    if (state.cancelled && reason === state.reason) { direct.reject(reason); return }
    const error = reason instanceof Error ? reason : new Error('Native transport failed.', { cause: reason })
    if (state.failed === undefined) { state.failed = error; notify(error) }
    direct.reject(state.cancelled ? state.reason : error)
    ready.reject(error)
    stop('SIGKILL', error)
  }
  for (const stream of [stdin, controlInput, control]) stream?.on('error', () => { /* The caller receives write failures; process outcome remains separate. */ })
  void ready.promise.catch(() => {}); void direct.promise.catch(() => {}); void range.promise.catch(() => {})
  const forward = async (destination: Writable, bytes: Uint8Array): Promise<void> => {
    if (destination.destroyed) return
    try { await writeNativeBytes(destination, bytes) }
    catch (error) {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Writable can close while its asynchronous write is pending.
      if (!destination.destroyed) throw error
    }
  }
  const read = async (carrier: ManagedProcessLaunch): Promise<void> => {
    if (carrier.stdout === null) throw new NativeProtocolError('Native broker has no response pipe.')
    let accepted = false, exited = false, confirmed = false
    const closed = new Set<number>()
    for await (const frame of readNativeFrames(carrier.stdout)) {
      if (state.disposed) break
      const data = Buffer.from(frame.data)
      switch (frame.tag) {
        case NATIVE_FRAME.accepted:
          if (accepted || data.length !== 0) throw new NativeProtocolError('Invalid native acceptance response.')
          accepted = true; clearStartup(); break
        case NATIVE_FRAME.stdout:
        case NATIVE_FRAME.stderr:
        case NATIVE_FRAME.controlOutput: {
          if (!accepted || closed.has(frame.tag) || confirmed) throw new NativeProtocolError('Native output arrived outside its stream lifetime.')
          if (frame.tag === NATIVE_FRAME.controlOutput && control === undefined) throw new NativeProtocolError('Unrequested native control output.')
          const destination = frame.tag === NATIVE_FRAME.stdout
            ? spec.stdio.stdout === 'inherit' ? process.stdout : stdout
            : frame.tag === NATIVE_FRAME.stderr ? spec.stdio.stderr === 'inherit' ? process.stderr : stderr : controlOutput
          await forward(destination, data)
          break
        }
        case NATIVE_FRAME.streamClosed: {
          if (!accepted || data.length !== 1 || confirmed) throw new NativeProtocolError('Invalid native stream closure.')
          const tag = data.readUInt8(0)
          if (closed.has(tag)) throw new NativeProtocolError('Duplicate native stream closure.')
          if (tag === NATIVE_FRAME.stdout) stdout.end()
          else if (tag === NATIVE_FRAME.stderr) stderr.end()
          else if (tag === NATIVE_FRAME.controlOutput && control !== undefined) controlOutput.end()
          else throw new NativeProtocolError('Unknown native output stream.')
          closed.add(tag); break
        }
        case NATIVE_FRAME.exited: {
          if (!accepted || exited || confirmed) throw new NativeProtocolError('Invalid native direct-result sequence.')
          const parsed = outcomeSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)))
          if (!parsed.success) throw new NativeProtocolError('Invalid native direct result.')
          exited = true; direct.resolve(parsed.data); break
        }
        case NATIVE_FRAME.rangeExited:
          if (!exited || confirmed || data.length !== 0 || !closed.has(NATIVE_FRAME.stdout) || !closed.has(NATIVE_FRAME.stderr)
            || control !== undefined && !closed.has(NATIVE_FRAME.controlOutput)) throw new NativeProtocolError('Incomplete native range completion.')
          confirmed = true; break
        case NATIVE_FRAME.failed: {
          const parsed = failureSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)))
          if (!parsed.success) throw new NativeProtocolError('Invalid native failure response.')
          throw new NativeProtocolError(`Native execution failed (${parsed.data.code}); execution may have begun.`)
        }
        default: throw new NativeProtocolError('Unexpected native broker frame.')
      }
    }
    if (!state.disposed && !state.cancelled && !confirmed) throw new NativeProtocolError('Native broker ended without complete execution records.')
  }
  const finish = async (start: NativeHostStart): Promise<void> => {
    await start.carrier.owner.waitForExit()
    clearStartup()
    state.physicalExit = true
    await start.release()
    range.resolve(undefined)
  }
  const running = Promise.resolve().then(async () => {
    let start: NativeHostStart | undefined
    try {
      abort.signal.throwIfAborted()
      start = await prepare(abort.signal); state.start = start
      const carrier = start.carrier
      if (!state.cancelled) startupTimer = setTimeout(() => { fail(new NativeProtocolError('Native broker startup timed out.')) }, start.config.startupTimeoutMs)
      const responses = read(carrier).catch((error: unknown) => { if (!state.disposed) fail(error) })
      tasks.push(responses)
      if (carrier.stderr !== null) {
        const errors = (async () => {
          for await (const chunk of carrier.stderr as AsyncIterable<Uint8Array>) diagnostics.push(Buffer.from(chunk))
        })()
        tasks.push(errors); void errors.catch((error: unknown) => { if (!state.disposed) fail(error) })
      }
      const brokerExit = carrier.direct.then((result) => {
        if (!state.cancelled && (result.exitCode !== 0 || result.signal !== null)) fail(new Error('Native broker exited abnormally.'))
        // The broker only exits after inner completion or failure; no legitimate target may outlive it.
        carrier.owner.signal('SIGKILL')
      }, fail)
      tasks.push(brokerExit); void brokerExit.catch(fail)
      if (state.cancelled) stop('SIGKILL', state.reason)
      else {
        if (carrier.stdin === null) throw new NativeProtocolError('Native broker has no request pipe.')
        await writeNativeFrame(carrier.stdin, { tag: NATIVE_FRAME.configure, data: Buffer.from(JSON.stringify(start.config)) })
        await writeNativeFrame(carrier.stdin, { tag: NATIVE_FRAME.launch, data: Buffer.from(JSON.stringify({
          argv: spec.argv, cwd: spec.cwd, env: environment, stdin: stdin === null ? 'ignore' : 'pipe',
          control: control !== undefined, graceMs: spec.graceMs,
        })) })
        ready.resolve(carrier.stdin)
      }
      await finish(start)
    } catch (error) {
      fail(error)
      if (start === undefined) { state.physicalExit = true; range.resolve(undefined) }
      else if (!state.physicalExit) {
        try { await finish(start) } catch (closeError) { range.reject(closeError); notify(new Error('Native closure could not be confirmed; keep protection retained.', { cause: closeError })) }
      } else range.reject(error)
    }
    await Promise.allSettled(tasks)
    for (const stream of streams) stream.end()
    if (state.cancelled) direct.reject(state.reason)
    if (state.failed !== undefined) {
      const tail = diagnostics.readFrom(0).text
      if (tail !== '') notify(new Error(`Native broker diagnostics: ${tail}`))
      throw state.failed
    }
  })
  void running.catch(() => {})
  return {
    launch: { stdin, stdout, stderr, ...control === undefined ? {} : { control }, direct: direct.promise,
      owner: { signal: stop, waitForExit: () => range.promise, terminateForHostExit() {
        stop('SIGKILL')
        try { state.start?.carrier.owner.terminateForHostExit() }
        catch (error) { notify(new Error('Native synchronous shutdown failed.', { cause: error })) }
      } } },
    settled: running,
    async dispose() {
      state.disposed = true; stop('SIGKILL')
      for (const stream of [stdin, control, controlInput, ...streams]) stream?.destroy()
      const carrier = state.start?.carrier
      for (const stream of [carrier?.stdin, carrier?.stdout, carrier?.stderr, carrier?.control]) stream?.destroy()
      await Promise.allSettled([running])
      await range.promise
    },
  }
}
