/** Malformed or stalled helper replies never authorize further terminal work or early range release. @module */
import { Duplex, PassThrough } from 'node:stream'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import type { SubprocessHandle, SubprocessOutcome, SubprocessTerminalSpawnSpec, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { createNativeTerminal } from '../src/native-terminal-host.ts'
import { nativeTerminalRequest } from '../src/native-terminal-protocol.ts'
import { NATIVE_FRAME, readNativeFrames, writeNativeFrame } from '../src/native-protocol.ts'

afterEach(() => { vi.useRealTimers() })

function peer(options: { noControl?: boolean; closure?: boolean; signal?: AbortSignal; env?: Record<string, string> } = {}) {
  const input = new PassThrough(), output = new PassThrough(), control = Duplex.from({ readable: output, writable: input })
  control.on('error', () => {})
  const direct = Promise.withResolvers<SubprocessOutcome>()
  void direct.promise.catch(() => {})
  const native = { stdin: undefined, stdout: undefined, stderr: undefined,
    control: options.noControl ? undefined : control, collected: {}, done: direct.promise,
    terminate: vi.fn(() => { input.destroy(); output.destroy(); control.destroy(); direct.resolve({ exitCode: 1, signal: null }) }),
    waitForExit: vi.fn(async () => options.closure ?? true),
  } satisfies SubprocessHandle
  const requests = readNativeFrames(input)
  const spec: SubprocessTerminalSpawnSpec = { argv: ['owned-shell'], cwd: process.cwd(), cols: 80, rows: 24,
    terminalType: 'xterm', graceMs: 20, ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.env === undefined ? {} : { env: options.env } }
  const spawn = (request: SubprocessSpawnSpec) => {
    request.signal?.addEventListener('abort', () => { native.terminate() }, { once: true })
    return native
  }
  const opening = createNativeTerminal(spec, spawn, {
    startupTimeoutMs: 100, requestTimeoutMs: 30, maxRequests: 2, diagnosticMaxBytes: 1024,
  })
  void opening.catch(() => {})
  onTestFinished(async () => {
    native.terminate()
    await opening.then(terminal => terminal.terminate().catch(() => {}), () => undefined)
    await requests.return(undefined).catch(() => {})
  })
  const next = async () => {
    const frame = await requests.next()
    if (frame.done) throw new Error('Expected request')
    return nativeTerminalRequest.parse(JSON.parse(Buffer.from(frame.value.data).toString()))
  }
  const send = async (tag: number, value: unknown) => writeNativeFrame(output, { tag, data: Buffer.from(JSON.stringify(value)) })
  const reply = (sequence: number, value: unknown = null) => send(NATIVE_FRAME.terminalReply, { sequence, ok: true, value })
  const start = async () => { const request = await next(); await reply(request.sequence, { pid: 321 }); return opening }
  return { native, input, output, control, opening, next, send, reply, start, direct }
}

it.each([
  [NATIVE_FRAME.stdin, null],
  [NATIVE_FRAME.terminalReply, { sequence: 999, ok: true, value: null }],
  [NATIVE_FRAME.terminalReply, { sequence: 1, ok: true, value: { pid: 0 } }],
  [NATIVE_FRAME.terminalReply, { sequence: 1, ok: 'invalid', value: null }],
  [NATIVE_FRAME.terminalOutput, 'before startup'],
  [NATIVE_FRAME.terminalExit, { exitCode: 0, signal: null }],
] as const)('stops startup for an invalid response %#', async (tag, value) => {
  const h = peer()
  await h.next(); await h.send(tag, value)
  await expect(h.opening).rejects.toBeDefined()
  expect(h.native.terminate).toHaveBeenCalled()
})

it('refuses a missing control pipe and joins the failed startup range', async () => {
  const h = peer({ noControl: true })
  await expect(h.opening).rejects.toThrow('control pipe')
  expect(h.native.waitForExit).toHaveBeenCalled()
})

it('reports startup cleanup that cannot confirm native closure', async () => {
  const h = peer({ noControl: true, closure: false })
  await expect(h.opening).rejects.toBeInstanceOf(AggregateError)
})

it('stops the helper after an operation timeout without replay', async () => {
  vi.useFakeTimers()
  const h = peer(), terminal = await h.start()
  const pending = terminal.write('only once')
  void pending.catch(() => {})
  expect((await h.next()).operation).toBe('write')
  await vi.advanceTimersByTimeAsync(30)
  await expect(pending).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(20)
  await terminal.terminate()
  expect(h.native.terminate).toHaveBeenCalled()
})

it('preserves allocation cancellation when transport closure races its reason', async () => {
  const controller = new AbortController(), reason = new Error('owned allocation cancelled'), h = peer({ signal: controller.signal })
  await h.next(); controller.abort(reason)
  await expect(h.opening).rejects.toBe(reason)
})

it('bounds startup when a helper never acknowledges its launch', async () => {
  vi.useFakeTimers()
  const h = peer()
  await h.next(); await vi.advanceTimersByTimeAsync(120)
  await expect(h.opening).rejects.toThrow('startup timed out')
})

it('rejects excess concurrent requests without changing existing requests', async () => {
  const h = peer(), terminal = await h.start()
  const first = terminal.resize(100, 30), one = await h.next()
  const second = terminal.inspectActivity(), two = await h.next()
  await expect(terminal.write('overflow')).rejects.toThrow('Too many')
  await h.reply(one.sequence)
  await h.reply(two.sequence, { state: 'busy', revision: 1 })
  await first; expect(await second).toEqual({ state: 'busy', revision: 1 })
})

it('rejects invalid operation results and stops the session', async () => {
  const h = peer(), terminal = await h.start()
  const operation = terminal.inspectForeground(), request = await h.next()
  await h.reply(request.sequence, { processGroupId: 'forged', inputWaiting: true })
  await expect(operation).rejects.toThrow('Invalid terminal operation result')
  await terminal.terminate()
})

it('rejects output after exit while another operation is still awaiting acknowledgement', async () => {
  const h = peer(), terminal = await h.start()
  const operation = terminal.resize(80, 24)
  void operation.catch(() => {})
  await h.next()
  await h.send(NATIVE_FRAME.terminalExit, { exitCode: 0, signal: null })
  await h.send(NATIVE_FRAME.terminalOutput, 'late output')
  await expect(operation).rejects.toBeDefined()
  await terminal.terminate()
})

it.each(['exit', 'reject'] as const)('contains an unexpected native helper %s', async (kind) => {
  const h = peer(), terminal = await h.start()
  if (kind === 'exit') h.direct.resolve({ exitCode: 127, signal: null })
  else h.direct.reject(new Error('native helper failed'))
  await expect(terminal.done).rejects.toBeDefined()
  await terminal.terminate()
})

it('does not report quiescence when the outer native range remains unknown', async () => {
  const h = peer({ closure: false }), terminal = await h.start()
  const closing = terminal.terminate(), request = await h.next()
  await h.reply(request.sequence)
  await expect(closing).rejects.toThrow('did not confirm closure')
  expect((await terminal.inspectActivity()).state).toBe('unknown')
})

it('refuses an oversized startup envelope and closes its allocated helper', async () => {
  const h = peer({ env: { LARGE: 'x'.repeat(1024 * 1024) } })
  await expect(h.opening).rejects.toThrow('protocol bound')
  expect(h.native.terminate).toHaveBeenCalled()
})

it('treats clean EOF before shutdown as a terminal transport failure', async () => {
  const h = peer(), terminal = await h.start()
  h.output.end()
  await expect(terminal.done).rejects.toThrow('transport ended')
  await terminal.terminate()
})

it('joins normal EOF and ignores native cancellation after an acknowledged close', async () => {
  const h = peer(), terminal = await h.start()
  vi.mocked(h.native.terminate).mockImplementationOnce(() => { h.output.end(); h.direct.reject(new Error('closed native helper')) })
  const stop = terminal.terminate(), request = await h.next()
  await h.reply(request.sequence)
  await stop
  expect((await terminal.inspectActivity()).state).toBe('idle')
})

it('accepts late acknowledgements only while the owner is already closing', async () => {
  const h = peer(), terminal = await h.start()
  const pending = terminal.resize(100, 30), resize = await h.next()
  void pending.catch(() => {})
  const stop = terminal.terminate(), close = await h.next()
  await h.reply(resize.sequence)
  await h.reply(close.sequence)
  await expect(pending).rejects.toThrow('closed')
  await stop
})

it('does not allocate native work for pre-aborted or invalid terminal requests', async () => {
  const spawn = vi.fn(() => { throw new Error('must not spawn') })
  const spec: SubprocessTerminalSpawnSpec = { argv: ['owned-shell'], cwd: process.cwd(), cols: 80, rows: 24,
    terminalType: 'xterm', graceMs: 20 }
  const limits = { startupTimeoutMs: 100, requestTimeoutMs: 30, maxRequests: 2, diagnosticMaxBytes: 1024 }
  await expect(createNativeTerminal({ ...spec, signal: AbortSignal.abort(null) }, spawn, limits)).rejects.toBeNull()
  await expect(createNativeTerminal({ ...spec, cols: 0 }, spawn, limits)).rejects.toBeDefined()
  expect(spawn).not.toHaveBeenCalled()
  await expect(createNativeTerminal(spec, spawn, limits)).rejects.toThrow('must not spawn')
})

it('handles a close notification while output is paused', async () => {
  const h = peer(), terminal = await h.start()
  await h.send(NATIVE_FRAME.terminalOutput, 'x'.repeat(128 * 1024))
  await vi.waitFor(() => { expect(terminal.output.readableLength).toBeGreaterThan(0) })
  h.control.emit('close')
  await expect(terminal.done).rejects.toThrow('control transport closed')
  await terminal.terminate()
})

it('contains a failed automatic cleanup after a native transport failure', async () => {
  const h = peer({ closure: false }), terminal = await h.start()
  h.control.destroy(new Error('owned pipe failed'))
  await expect(terminal.done).rejects.toBeDefined()
  await expect(terminal.terminate()).rejects.toThrow('did not confirm closure')
})

it('retains a known shell exit while automatic range cleanup remains unconfirmed', async () => {
  const h = peer({ closure: false }), terminal = await h.start()
  await h.send(NATIVE_FRAME.terminalExit, { exitCode: 23, signal: null })
  const close = await h.next()
  await h.reply(close.sequence)
  expect(await terminal.done).toEqual({ exitCode: 23, signal: null })
  await expect(terminal.terminate()).rejects.toThrow('did not confirm closure')
})

it('stops a multi-chunk write after shell exit without sending its remaining input', async () => {
  const h = peer(), terminal = await h.start(), write = terminal.write('x'.repeat(250000))
  void write.catch(() => {})
  const first = await h.next()
  expect(first.operation).toBe('write')
  await h.send(NATIVE_FRAME.terminalExit, { exitCode: 0, signal: null })
  await h.reply(first.sequence)
  await expect(write).rejects.toThrow('closed')
  const close = await h.next()
  expect(close.operation).toBe('close')
  await h.reply(close.sequence)
  await terminal.terminate()
})
