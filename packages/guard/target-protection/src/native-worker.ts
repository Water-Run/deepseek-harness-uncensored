/** Private worker loaded only after the confined bootstrap has joined its independently observed Job. @module */
import { spawn, type ChildProcess, type ChildProcessByStdio } from 'node:child_process'
import { PassThrough, type Duplex, type Readable, type Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { SUBPROCESS_CONTROL_ENV, SUBPROCESS_CONTROL_FD } from '@deepseek-ai/dsh-subprocess/control'
import { NATIVE_FRAME, NATIVE_FRAME_MAX_BYTES, NativeProtocolError, readNativeFrames, writeNativeFrame, writeNativeBytes } from './native-protocol.ts'

const text = z.string().refine(value => !value.includes('\0'))
const launchSchema = z.object({
  argv: z.tuple([text]).rest(text), cwd: text.min(1), env: z.record(text, text),
  stdin: z.enum(['pipe', 'ignore']), control: z.boolean(),
}).strict()

/** Fully resolved target input; the worker never inherits the bootstrap environment into the target. */
export type NativeWorkerLaunch = z.infer<typeof launchSchema>

/**
 * Run one command over a framed private transport, retaining the bootstrap after the direct command exits.
 * The caller must already own this process tree and terminate it on transport failure or cancellation.
 * @param input - Owned host transport; EOF closes the worker, not just the target's stdin.
 * @param output - Owned host transport; lifecycle frames and target streams are separate.
 * @returns After transport EOF and direct-child cleanup; failures send a bounded error code and reject.
 */
export async function runNativeWorker(input: Readable, output: Writable): Promise<void> {
  let child: ChildProcess | undefined, childClosed: Promise<void> | undefined, failure: unknown
  const background: Promise<void>[] = []
  const fail = (error: unknown): void => { failure ??= error; input.destroy(); child?.kill() }
  const observe = (pending: Promise<void>): void => { background.push(pending); void pending.catch(fail) }
  const outputClosed = (): void => { fail(new NativeProtocolError('Native output transport closed.')) }
  output.on('error', fail)
  output.once('close', outputClosed)
  try {
    const messages = readNativeFrames(input), first = await messages.next()
    if (first.done || first.value.tag !== NATIVE_FRAME.launch) throw new NativeProtocolError('The worker requires one launch frame.')
    const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(first.value.data))
    const parsed = launchSchema.safeParse(decoded)
    if (!parsed.success) throw new NativeProtocolError('The native launch request is invalid.')
    const request = parsed.data
    const stdio: Array<'ignore' | 'pipe' | 'overlapped'> = [request.stdin, 'pipe', 'pipe']
    while (request.control && stdio.length < SUBPROCESS_CONTROL_FD) stdio.push('ignore')
    if (request.control) stdio.push('overlapped')
    const env = { ...request.env }
    for (const key of Object.keys(env)) {
      if (key.toUpperCase() === SUBPROCESS_CONTROL_ENV) Reflect.deleteProperty(env, key)
    }
    if (request.control) env[SUBPROCESS_CONTROL_ENV] = 'pipe'
    const target = spawn(request.argv[0], request.argv.slice(1), {
      cwd: request.cwd, env, stdio, windowsHide: true,
    }) as ChildProcessByStdio<Writable | null, Readable, Readable>
    child = target
    childClosed = new Promise((resolve) => { target.once('close', () => { resolve() }) })
    const spawned = new Promise<void>((resolve, reject) => {
      target.once('spawn', resolve); target.once('error', reject)
    })
    const exited = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      target.once('exit', (exitCode, signal) => { resolve({ exitCode, signal }) }); target.once('error', reject)
    })
    void exited.catch(fail)
    const pump = async (stream: Readable, tag: number): Promise<void> => {
      // Node resumes child stdio on exit; the attached pipe retains bytes while downstream framing is waiting.
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
    observe(pump(target.stdout, NATIVE_FRAME.stdout)); observe(pump(target.stderr, NATIVE_FRAME.stderr))
    const control = request.control ? target.stdio.at(SUBPROCESS_CONTROL_FD) as Duplex : undefined
    if (control !== undefined) observe(pump(control, NATIVE_FRAME.controlOutput))
    await spawned
    await writeNativeFrame(output, { tag: NATIVE_FRAME.started, data: Buffer.alloc(0) })
    observe(exited.then(async (result) => {
      await writeNativeFrame(output, { tag: NATIVE_FRAME.exited, data: Buffer.from(JSON.stringify(result)) })
    }))
    let stdinOpen = request.stdin === 'pipe', controlOpen = request.control
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
          if (!controlOpen || control === undefined) throw new NativeProtocolError('Native control is not open.')
          await writeNativeBytes(control, frame.data)
          break
        case NATIVE_FRAME.controlEnd:
          if (!controlOpen || control === undefined || frame.data.byteLength !== 0) throw new NativeProtocolError('Invalid native control EOF.')
          controlOpen = false; control.end()
          break
        default: throw new NativeProtocolError('Unexpected frame after native launch.')
      }
    }
    if (failure !== undefined) throw new Error('Native worker transport failed.', { cause: failure })
  } catch (error) {
    failure ??= error
    child?.kill()
    for (const stream of child?.stdio ?? []) stream?.destroy()
    const code = failure instanceof NativeProtocolError ? 'NATIVE_PROTOCOL_FAILED'
      : typeof failure === 'object' && failure !== null && 'code' in failure && typeof failure.code === 'string'
        ? failure.code.slice(0, 80) : 'NATIVE_WORKER_FAILED'
    try { await writeNativeFrame(output, { tag: NATIVE_FRAME.failed, data: Buffer.from(JSON.stringify({ code })) }) }
    catch (reportError) { throw new AggregateError([failure, reportError], 'Native worker and error reporting failed') }
    throw new Error('Native worker failed.', { cause: failure })
  } finally {
    child?.kill()
    for (const stream of child?.stdio ?? []) stream?.destroy()
    await childClosed
    await Promise.allSettled(background)
    output.off('error', fail)
    output.off('close', outputClosed)
  }
}
