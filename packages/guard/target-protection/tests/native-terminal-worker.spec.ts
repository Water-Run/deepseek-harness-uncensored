/** Worker validation rejects malformed or replayed requests before native terminal effects. @module */
import { Duplex, PassThrough } from 'node:stream'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import type { SubprocessOutcome, SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import { runNativeTerminalWorker } from '../src/native-terminal-worker.ts'
import { NATIVE_FRAME, readNativeFrames, writeNativeFrame } from '../src/native-protocol.ts'
import type { NativeFrame } from '../src/native-protocol.ts'
import type { NativeTerminalLaunch } from '../src/native-terminal-protocol.ts'

afterEach(() => { vi.unstubAllEnvs() })

function worker(ambient = false) {
  const input = new PassThrough(), output = new PassThrough(), channel = Duplex.from({ readable: input, writable: output })
  channel.on('error', () => {})
  const bytes = new PassThrough(), result = Promise.withResolvers<SubprocessOutcome>(), frames: NativeFrame[] = []
  const finish = () => { bytes.end(); result.resolve({ exitCode: 0, signal: null }) }
  const terminal = { pid: 12, output: bytes, done: result.promise,
    write: vi.fn(async (_text: string) => {}), resize: vi.fn(async (_cols: number, _rows: number) => {}),
    inspectForeground: vi.fn(async () => undefined), inspectActivity: vi.fn(async () => ({ state: 'unknown' as const, revision: 1 })),
    signalForeground: vi.fn(async () => 12), terminate: vi.fn(async () => { finish() }),
  } satisfies SubprocessTerminalHandle
  const allocate = vi.fn(async (_spec: NativeTerminalLaunch) => terminal)
  const running = runNativeTerminalWorker(channel, allocate, ambient ? undefined
    : { HOME: '/private', UNUSED: 'ignored', HTTP_PROXY: undefined })
  const reading = (async () => { for await (const frame of readNativeFrames(output)) frames.push(frame) })()
  void running.catch(() => {}); void reading.catch(() => {})
  onTestFinished(async () => {
    finish(); input.destroy(); output.destroy(); channel.destroy()
    await Promise.allSettled([running, reading])
  })
  const send = (value: unknown, tag: number = NATIVE_FRAME.terminalRequest) =>
    writeNativeFrame(input, { tag, data: Buffer.from(JSON.stringify(value)) })
  const spec = { argv: ['owned'], cwd: process.cwd(), env: {}, cols: 80, rows: 24, terminalType: 'xterm', graceMs: 10, shellActivity: false }
  const start = async () => {
    await send({ sequence: 1, operation: 'start', spec })
    await vi.waitFor(() => { expect(allocate).toHaveBeenCalledOnce(); expect(frames).toHaveLength(1) })
  }
  return { input, channel, terminal, result, finish, allocate, running, reading, frames, send, start, spec }
}

it.each([
  { sequence: 1, operation: 'unknown' },
  { sequence: 1, operation: 'write', text: 'before start' },
  { sequence: 0, operation: 'start' },
])('refuses invalid startup %# without allocating a terminal', async (request) => {
  const h = worker()
  await h.send(request)
  await expect(h.running).rejects.toBeDefined()
  expect(h.allocate).not.toHaveBeenCalled()
})

it('refuses a frame from another protocol direction', async () => {
  const h = worker()
  await h.send({}, NATIVE_FRAME.stdout)
  await expect(h.running).rejects.toThrow('Unexpected terminal request frame')
})

it.each([0, -1, 0x100000000])('refuses unpublished process identity %s and closes the allocated terminal', async (pid) => {
  const h = worker()
  h.terminal.pid = pid
  await h.send({ sequence: 1, operation: 'start', spec: h.spec })
  await expect(h.running).rejects.toThrow('valid process identity')
  expect(h.frames).toHaveLength(0)
  expect(h.terminal.terminate).toHaveBeenCalledOnce()
})

it.each(['sequence', 'start'] as const)('refuses a repeated %s before another target is created', async (repeat) => {
  const h = worker()
  await h.start()
  await h.send(repeat === 'sequence' ? { sequence: 1, operation: 'write', text: 'replayed' }
    : { sequence: 2, operation: 'start', spec: h.spec })
  await expect(h.running).rejects.toBeDefined()
  expect(h.terminal.write).not.toHaveBeenCalled()
  expect(h.allocate).toHaveBeenCalledOnce()
  expect(h.terminal.terminate).toHaveBeenCalled()
})

it('reports operations after terminal exit and then acknowledges a real close', async () => {
  const h = worker()
  await h.start(); h.finish()
  await vi.waitFor(() => { expect(h.frames.some(frame => frame.tag === NATIVE_FRAME.terminalExit)).toBe(true) })
  await h.send({ sequence: 2, operation: 'write', text: 'late' })
  await vi.waitFor(() => { expect(h.frames).toHaveLength(3) })
  expect(JSON.parse(Buffer.from(h.frames[2]!.data).toString())).toMatchObject({ sequence: 2, ok: false, message: 'The terminal process has exited.' })
  await h.send({ sequence: 3, operation: 'close' })
  await h.running
  expect(h.terminal.write).not.toHaveBeenCalled()
})

it('sanitizes non-Error operation failures without automatically replaying a write', async () => {
  const h = worker()
  h.terminal.write.mockRejectedValueOnce('native failure')
  await h.start(); await h.send({ sequence: 2, operation: 'write', text: 'once' })
  await vi.waitFor(() => { expect(h.frames).toHaveLength(2) })
  expect(JSON.parse(Buffer.from(h.frames[1]!.data).toString())).toMatchObject({ ok: false, message: 'Native terminal operation failed.' })
  await h.send({ sequence: 3, operation: 'close' }); await h.running
  expect(h.terminal.write).toHaveBeenCalledOnce()
})

it('does not report success for a clean input EOF without shutdown acknowledgement', async () => {
  const h = worker()
  await h.start(); h.input.end()
  await expect(h.running).rejects.toThrow('without shutdown acknowledgement')
  expect(h.terminal.terminate).toHaveBeenCalled()
})

it('normalizes a non-Error native outcome failure and stops the helper', async () => {
  const h = worker()
  await h.start(); h.result.reject('native outcome failed')
  await expect(h.running).rejects.toBeInstanceOf(Error)
  expect(h.terminal.terminate).toHaveBeenCalled()
})

it('uses the inherited private directory when no environment projection is supplied', async () => {
  vi.stubEnv('HOME', '/owned-private')
  const h = worker(true)
  await h.start()
  expect(h.allocate.mock.calls[0]?.[0].env.HOME).toBe('/owned-private')
  await h.send({ sequence: 2, operation: 'close' }); await h.running
})
