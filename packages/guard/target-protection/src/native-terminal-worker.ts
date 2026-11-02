/** Terminal interaction stays inside the contained worker; whole-range closure belongs to the outer native owner. @module */
import type { Duplex } from 'node:stream'
import { createRequire } from 'node:module'
import type * as NodePty from 'node-pty'
import { LocalTerminalHandle, createProcessInspector } from '@deepseek-ai/dsh-subprocess-local/managed'
import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { NATIVE_FRAME, NATIVE_FRAME_MAX_BYTES, NativeProtocolError, readNativeFrames, writeNativeFrame } from './native-protocol.ts'
import { nativeTerminalRequest, nativeTerminalOutcome, NATIVE_TERMINAL_FIXED_ENV } from './native-terminal-protocol.ts'
import type { NativeTerminalRequest, NativeTerminalLaunch } from './native-terminal-protocol.ts'

/** Injectable terminal allocation; production uses the existing Windows terminal driver. */
export type NativeTerminalLauncher = (spec: NativeTerminalLaunch) => Promise<SubprocessTerminalHandle>

const require = createRequire(import.meta.url)
/* v8 ignore start -- Real contained source and compiled terminal tests exercise the platform allocator. */
const launch: NativeTerminalLauncher = (spec) => {
  if (process.platform !== 'win32') return Promise.reject(new NativeProtocolError('Native terminal requires Windows.'))
  const pty = require('node-pty') as typeof NodePty
  const terminal = pty.spawn(spec.argv[0], [...spec.argv.slice(1)], {
    cwd: spec.cwd, env: spec.env, cols: spec.cols, rows: spec.rows, name: spec.terminalType, useConptyDll: true,
  })
  return Promise.resolve(new LocalTerminalHandle(terminal, createProcessInspector(), spec.graceMs, 'win32'))
}
/* v8 ignore stop */

/**
 * Dispatch terminal operations over one bounded control stream, separate from all target output.
 * @param channel - Inherited descriptor owned by the trusted helper.
 * @param allocate - Native allocator; tests substitute only the OS terminal.
 * @param environment - Enclosing provider's private paths and gateway, preserved over target overrides.
 * @returns When close is acknowledged; the entry then exits and the Host independently joins its Job.
 */
export async function runNativeTerminalWorker(
  channel: Duplex, allocate: NativeTerminalLauncher = launch, environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  let terminal: SubprocessTerminalHandle | undefined
  const state = { exited: false, closed: false }
  let completion: Promise<void> | undefined
  let sequence = 0
  const fail = (error: unknown): void => {
    channel.destroy(error instanceof Error ? error : new Error('Native terminal transport failed.', { cause: error }))
  }
  channel.on('error', fail)
  const send = (tag: number, value: unknown) => writeNativeFrame(channel, { tag, data: Buffer.from(JSON.stringify(value)) })
  const dispatch = async (request: NativeTerminalRequest): Promise<unknown> => {
    if (request.operation === 'start') {
      if (terminal !== undefined) throw new NativeProtocolError('The terminal was already started.')
      const env = { ...request.spec.env }
      for (const key of Object.keys(env)) {
        if (NATIVE_TERMINAL_FIXED_ENV.test(key)) Reflect.deleteProperty(env, key)
      }
      for (const [key, value] of Object.entries(environment)) {
        if (!NATIVE_TERMINAL_FIXED_ENV.test(key) || key.toUpperCase() === 'DSH_SUBPROCESS_CONTROL') continue
        if (value !== undefined) env[key] = value
      }
      env.TERM = request.spec.terminalType
      terminal = await allocate({ ...request.spec, env })
      return { pid: terminal.pid }
    }
    if (terminal === undefined) throw new NativeProtocolError('Terminal operation preceded startup.')
    if (request.operation === 'close') { await terminal.terminate(); await completion; state.closed = true; return null }
    if (state.exited) throw new Error('The terminal process has exited.')
    switch (request.operation) {
      case 'write': await terminal.write(request.text); return null
      case 'resize': await terminal.resize(request.cols, request.rows); return null
      case 'foreground': return await terminal.inspectForeground() ?? null
      case 'activity': return terminal.inspectActivity()
      case 'signal': return terminal.signalForeground(request.signal)
      /* v8 ignore next -- Wire parsing rejects unknown operations; this guards the closed TypeScript union. */
      default: return assertNever(request)
    }
  }
  try {
    for await (const frame of readNativeFrames(channel)) {
      if (frame.tag !== NATIVE_FRAME.terminalRequest) throw new NativeProtocolError('Unexpected terminal request frame.')
      const parsed = nativeTerminalRequest.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame.data)))
      if (!parsed.success) throw new NativeProtocolError('Invalid terminal request.')
      const request = parsed.data
      if (request.sequence <= sequence) throw new NativeProtocolError('Terminal request sequence was reused.')
      sequence = request.sequence
      try {
        const value = await dispatch(request)
        await send(NATIVE_FRAME.terminalReply, { sequence: request.sequence, ok: true, value })
      } catch (error) {
        if (error instanceof NativeProtocolError) throw error
        await send(NATIVE_FRAME.terminalReply, { sequence: request.sequence, ok: false,
          message: error instanceof Error ? error.message.slice(0, 4096) : 'Native terminal operation failed.' })
        if (request.operation === 'start' || request.operation === 'close') throw error
      }
      if (request.operation === 'start' && terminal !== undefined) {
        const active = terminal
        completion = (async () => {
          const outcome = active.done.then(value => nativeTerminalOutcome.parse(value))
          void outcome.catch(fail)
          for await (const chunk of active.output as AsyncIterable<Uint8Array>) {
            for (let offset = 0; offset < chunk.byteLength; offset += NATIVE_FRAME_MAX_BYTES) {
              await writeNativeFrame(channel, { tag: NATIVE_FRAME.terminalOutput,
                data: chunk.subarray(offset, offset + NATIVE_FRAME_MAX_BYTES) })
            }
          }
          const value = await outcome
          state.exited = true
          await send(NATIVE_FRAME.terminalExit, value)
        })()
        void completion.catch(fail)
      }
      if (state.closed) break
    }
    if (!state.closed) throw new NativeProtocolError('Terminal control closed without shutdown acknowledgement.')
    await completion
  } finally {
    channel.off('error', fail)
    // The entry's exit and outer Job own emergency closure; never publish a successful range result here.
    if (terminal !== undefined && !state.closed) {
      terminal.output.destroy()
      await terminal.terminate()
    }
  }
}
