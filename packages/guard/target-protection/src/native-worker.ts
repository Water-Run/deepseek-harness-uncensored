/** Private command transport backed by a strict inner range, separate from the confined bootstrap. @module */
import { PassThrough, type Readable, type Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { SUBPROCESS_CONTROL_ENV } from '@deepseek-ai/dsh-subprocess/control'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { launchWindowsJob, type ManagedProcessLaunch } from '@deepseek-ai/dsh-subprocess-local/managed'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { NATIVE_FRAME, NATIVE_FRAME_MAX_BYTES, NativeProtocolError, readNativeFrames, writeNativeFrame, writeNativeBytes } from './native-protocol.ts'

const text = z.string().refine(value => !value.includes('\0'))
const launchSchema = z.object({
  argv: z.tuple([text]).rest(text), cwd: text.min(1), env: z.record(text, text),
  stdin: z.enum(['pipe', 'ignore']), control: z.boolean(), graceMs: z.number().int().min(0).max(MAX_TIMER_DELAY_MS),
}).strict()

/** Fully resolved target input; the worker never inherits its bootstrap environment into the target. */
export type NativeWorkerLaunch = z.infer<typeof launchSchema>

/**
 * Start an independently observable command range; the default launcher never selects a weaker fallback.
 * @param spec - Fully specified command and raw transport dispositions.
 * @param environment - Complete target environment, independent of the worker's own bootstrap settings.
 * @returns Raw streams, direct outcome, and managed-range ownership.
 */
export type NativeWorkerLauncher = (spec: SubprocessSpawnSpec, environment: Record<string, string>) => ManagedProcessLaunch

/**
 * Run one command and keep its descendants owned after direct exit; return after its range and streams close.
 * The caller owns the outer confined Job and must confirm its closure independently before releasing protection.
 * @param input - Owned host transport; premature EOF terminates the inner command range.
 * @param output - Owned host transport; lifecycle frames and target streams are separate.
 * @param launch - Strict inner range launcher; injectable for portable transport and failure tests.
 * @returns On confirmed inner-range completion; failure sends a bounded code, stops work, and rejects.
 */
export async function runNativeWorker(
  input: Readable, output: Writable, launch: NativeWorkerLauncher = launchWindowsJob,
): Promise<void> {
  let execution: ManagedProcessLaunch | undefined, failure: unknown
  const range = { closed: false }
  const background: Promise<void>[] = []
  const stop = (signal: 'SIGTERM' | 'SIGKILL', reason?: unknown): void => {
    try { execution?.owner.signal(signal, reason) }
    catch (error) {
      failure = failure === undefined ? error : new AggregateError([failure, error], 'Native termination failed')
      input.destroy()
      try { execution?.owner.terminateForHostExit() }
      catch (forceError) { failure = new AggregateError([failure, forceError], 'Native forced termination failed') }
    }
  }
  const fail = (error: unknown): void => {
    failure ??= error
    input.destroy()
    stop('SIGKILL', error)
  }
  const observe = (pending: Promise<void>): void => { background.push(pending); void pending.catch(fail) }
  const outputClosed = (): void => { fail(new NativeProtocolError('Native output transport closed.')) }
  output.on('error', fail); output.once('close', outputClosed)
  try {
    const messages = readNativeFrames(input), first = await messages.next()
    if (first.done || first.value.tag !== NATIVE_FRAME.launch) throw new NativeProtocolError('The worker requires one launch frame.')
    const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(first.value.data))
    const parsed = launchSchema.safeParse(decoded)
    if (!parsed.success) throw new NativeProtocolError('The native launch request is invalid.')
    const request = parsed.data, env = { ...request.env }
    for (const key of Object.keys(env)) if (key.toUpperCase() === SUBPROCESS_CONTROL_ENV) Reflect.deleteProperty(env, key)
    if (request.control) env[SUBPROCESS_CONTROL_ENV] = 'pipe'
    execution = launch({
      argv: request.argv, cwd: request.cwd, env,
      stdio: { stdin: request.stdin, stdout: 'pipe', stderr: 'pipe', ...request.control ? { control: 'pipe' } : {} },
      graceMs: request.graceMs,
    }, env)
    const target = execution
    const pump = async (stream: Readable, tag: number): Promise<void> => {
      const relay = new PassThrough(), transfer = pipeline(stream, relay)
      const forwarding = (async () => {
        for await (const chunk of relay as AsyncIterable<Buffer>) {
          for (let offset = 0; offset < chunk.byteLength; offset += NATIVE_FRAME_MAX_BYTES) {
            await writeNativeFrame(output, { tag, data: chunk.subarray(offset, offset + NATIVE_FRAME_MAX_BYTES) })
          }
        }
        await writeNativeFrame(output, { tag: NATIVE_FRAME.streamClosed, data: Uint8Array.of(tag) })
      })()
      try { await Promise.all([transfer, forwarding]) }
      finally { relay.destroy(); await Promise.allSettled([transfer, forwarding]) }
    }
    target.stdin?.on('error', fail)
    if (target.stdout === null || target.stderr === null) throw new NativeProtocolError('Native launch omitted a requested output pipe.')
    observe(pump(target.stdout, NATIVE_FRAME.stdout)); observe(pump(target.stderr, NATIVE_FRAME.stderr))
    if (target.control !== undefined) observe(pump(target.control, NATIVE_FRAME.controlOutput))
    // Acceptance exposes the launch pipes; it is not evidence that the target has executed.
    const accepted = writeNativeFrame(output, { tag: NATIVE_FRAME.accepted, data: Buffer.alloc(0) })
    observe(accepted)
    observe(target.direct.then(async (result) => {
      await accepted
      await writeNativeFrame(output, { tag: NATIVE_FRAME.exited, data: Buffer.from(JSON.stringify(result)) })
    }))
    observe(target.owner.waitForExit().then(() => { range.closed = true; input.destroy() }))
    await accepted
    let stdinOpen = request.stdin === 'pipe', controlOpen = request.control
    try {
      for await (const frame of messages) {
        switch (frame.tag) {
          case NATIVE_FRAME.stdin:
            if (!stdinOpen || target.stdin === null) throw new NativeProtocolError('Native stdin is not open.')
            await writeNativeBytes(target.stdin, frame.data)
            break
          case NATIVE_FRAME.stdinEnd:
            if (!stdinOpen || frame.data.byteLength !== 0) throw new NativeProtocolError('Invalid native stdin EOF.')
            stdinOpen = false; target.stdin?.end()
            break
          case NATIVE_FRAME.control:
            if (!controlOpen || target.control === undefined) throw new NativeProtocolError('Native control is not open.')
            await writeNativeBytes(target.control, frame.data)
            break
          case NATIVE_FRAME.controlEnd:
            if (!controlOpen || target.control === undefined || frame.data.byteLength !== 0) throw new NativeProtocolError('Invalid native control EOF.')
            controlOpen = false; target.control.end()
            break
          case NATIVE_FRAME.terminate:
            if (frame.data.byteLength !== 0) throw new NativeProtocolError('Invalid native termination frame.')
            stop('SIGTERM')
            break
          default: throw new NativeProtocolError('Unexpected frame after native launch.')
        }
      }
    } catch (error) { if (!range.closed || failure !== undefined) throw error }
    if (!range.closed) throw new NativeProtocolError('Native host transport ended before its command range.')
    await Promise.all(background)
    if (failure !== undefined) throw new Error('Native worker transport failed.', { cause: failure })
    await writeNativeFrame(output, { tag: NATIVE_FRAME.rangeExited, data: Buffer.alloc(0) })
  } catch (error) {
    failure ??= error
    stop('SIGKILL', error)
    const code = failure instanceof NativeProtocolError ? 'NATIVE_PROTOCOL_FAILED'
      : typeof failure === 'object' && failure !== null && 'code' in failure && typeof failure.code === 'string'
        ? failure.code.slice(0, 80) : 'NATIVE_WORKER_FAILED'
    try { await writeNativeFrame(output, { tag: NATIVE_FRAME.failed, data: Buffer.from(JSON.stringify({ code })) }) }
    catch (reportError) { throw new AggregateError([failure, reportError], 'Native worker and error reporting failed') }
    throw new Error('Native worker failed.', { cause: failure })
  } finally {
    try {
      input.destroy()
      if (execution !== undefined) {
        if (!range.closed) stop('SIGKILL')
        for (const stream of [execution.stdin, execution.stdout, execution.stderr, execution.control]) stream?.destroy()
        const settled = await Promise.allSettled([execution.direct, execution.owner.waitForExit()])
        if (settled[1].status === 'rejected') {
          try { execution.owner.terminateForHostExit() }
          catch (error) { throw new AggregateError([settled[1].reason, error], 'Native range observation and forced termination failed') }
          throw new Error('Native command range could not be confirmed closed.', { cause: settled[1].reason })
        }
        execution.owner.cleanup?.()
      }
    } finally {
      await Promise.allSettled(background)
      output.off('error', fail); output.off('close', outputClosed)
    }
  }
}
