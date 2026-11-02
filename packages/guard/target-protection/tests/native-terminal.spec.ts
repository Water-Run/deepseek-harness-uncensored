/** Terminal RPC exercises real framing and ownership while substituting the native console only. @module */
import { Duplex, PassThrough } from 'node:stream'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec, SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { createNativeTerminal } from '../src/native-terminal-host.ts'
import { runNativeTerminalWorker } from '../src/native-terminal-worker.ts'
import type { NativeTerminalLaunch } from '../src/native-terminal-protocol.ts'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

function fixture(options: { pauseClose?: boolean; failStart?: Error; failWrite?: boolean } = {}) {
  const input = new PassThrough(), response = new PassThrough()
  const control = Duplex.from({ readable: response, writable: input }), worker = Duplex.from({ readable: input, writable: response })
  control.on('error', () => {}); worker.on('error', () => {})
  const output = new PassThrough(), outcome = Promise.withResolvers<SubprocessOutcome>()
  const nativeOutcome = Promise.withResolvers<SubprocessOutcome>(), range = Promise.withResolvers<boolean>()
  const finish = (exitCode = 0) => { output.end(); outcome.resolve({ exitCode, signal: null }) }
  const writes: string[] = [], resizes: [number, number][] = []
  const target = {
    pid: 123, output, done: outcome.promise,
    write: vi.fn(async (data: string) => { if (options.failWrite) throw new Error('write rejected'); writes.push(data) }),
    resize: vi.fn(async (cols: number, rows: number) => { resizes.push([cols, rows]) }),
    inspectForeground: vi.fn<SubprocessTerminalHandle['inspectForeground']>(async () => ({ processGroupId: 123, inputWaiting: false })),
    inspectActivity: vi.fn(async () => ({ state: 'unknown' as const, revision: 1 })),
    signalForeground: vi.fn(async () => 123),
    terminate: vi.fn(async () => { finish() }),
  } satisfies SubprocessTerminalHandle
  const allocated = Promise.withResolvers<NativeTerminalLaunch>()
  const running = runNativeTerminalWorker(worker, async (request) => {
    allocated.resolve(request)
    if (options.failStart !== undefined) throw options.failStart
    return target
  }, { HOME: '/private', HTTP_PROXY: 'http://127.0.0.1:1234', DSH_SUBPROCESS_CONTROL: 'pipe' })
  void running.then(() => { nativeOutcome.resolve({ exitCode: 0, signal: null }) }, () => {
    nativeOutcome.resolve({ exitCode: 127, signal: null })
  })
  const native = {
    stdin: undefined, stdout: undefined, stderr: undefined, control, collected: {}, done: nativeOutcome.promise,
    terminate: vi.fn(() => {
      finish(); control.destroy(); worker.destroy()
      nativeOutcome.resolve({ exitCode: 1, signal: null })
      if (!options.pauseClose) range.resolve(true)
    }),
    waitForExit: () => range.promise,
  } satisfies SubprocessHandle
  let launchSpec: SubprocessSpawnSpec | undefined
  const spawn = vi.fn((spec: SubprocessSpawnSpec) => {
    launchSpec = spec
    spec.signal?.addEventListener('abort', () => { native.terminate() }, { once: true })
    return native
  })
  onTestFinished(async () => {
    range.resolve(true); native.terminate()
    await running.catch(() => {})
    output.destroy()
  })
  const spec: SubprocessTerminalSpawnSpec = { argv: ['owned-shell'], cwd: process.cwd(), cols: 80, rows: 24,
    terminalType: 'xterm', graceMs: 50, env: { EXPLICIT_SECRET: 'target-only', HOME: '/untrusted' } }
  const limits = { startupTimeoutMs: 1000, requestTimeoutMs: 500, maxRequests: 8, diagnosticMaxBytes: 1024 }
  return { open: (value = spec) => createNativeTerminal(value, spawn, limits), spec, limits, spawn, allocated,
    target, native, output, outcome, finish, writes, resizes, range, control, worker, running, launchSpec: () => launchSpec }
}

it('keeps target environment out of helper startup and preserves the private paths and proxy', async () => {
  vi.stubEnv('NODE_OPTIONS', '--require=untrusted-preload')
  vi.stubEnv('SystemRoot', 'owned-system')
  const h = fixture(), terminal = await h.open()
  const request = await h.allocated.promise
  expect(h.launchSpec()?.env?.NODE_OPTIONS).toBeUndefined()
  expect(h.launchSpec()?.env?.EXPLICIT_SECRET).toBeUndefined()
  expect(Object.hasOwn(h.launchSpec()?.env ?? {}, 'SystemRoot')).toBe(false)
  expect(h.launchSpec()?.cwd).not.toBe(h.spec.cwd)
  expect(request.env).toMatchObject({ EXPLICIT_SECRET: 'target-only', HOME: '/private', HTTP_PROXY: 'http://127.0.0.1:1234', TERM: 'xterm' })
  expect(request.env.DSH_SUBPROCESS_CONTROL).toBeUndefined()
  expect(terminal.pid).toBe(123)
  await terminal.terminate()
})

it('preserves UTF-8 output and splits large input without splitting a surrogate pair', async () => {
  const h = fixture(), terminal = await h.open()
  let output = ''
  terminal.output.on('data', (bytes: Buffer) => { output += bytes.toString() })
  h.output.write(Buffer.from('中文\u001b[31m terminal'))
  const text = 'x' + '🙂'.repeat(100000)
  await terminal.write(text)
  await terminal.write('')
  expect(h.writes.join('')).toBe(text)
  expect(h.writes.length).toBeGreaterThan(1)
  expect(h.writes.every(value => !/[\uD800-\uDBFF]$/u.test(value))).toBe(true)
  await vi.waitFor(() => { expect(output).toBe('中文\u001b[31m terminal') })
  await terminal.terminate()
})

it('acknowledges resize, activity, foreground and signalling without changing the target API', async () => {
  const h = fixture(), terminal = await h.open()
  await terminal.resize(120, 40)
  expect(h.resizes).toEqual([[120, 40]])
  expect(await terminal.inspectForeground()).toEqual({ processGroupId: 123, inputWaiting: false })
  expect(await terminal.inspectActivity()).toEqual({ state: 'unknown', revision: 1 })
  expect(await terminal.signalForeground('SIGINT')).toBe(123)
  expect(h.target.signalForeground).toHaveBeenCalledWith('SIGINT')
  await terminal.terminate()
  expect(await terminal.inspectForeground()).toBeUndefined()
  expect((await terminal.inspectActivity()).state).toBe('idle')
  await expect(terminal.write('late')).rejects.toThrow('closed')
})

it('preserves tail output through natural exit and then joins the outer range', async () => {
  const h = fixture(), terminal = await h.open()
  h.output.write(Buffer.from('complete tail')); h.finish(23)
  expect(await terminal.done).toEqual({ exitCode: 23, signal: null })
  const chunks: Buffer[] = []
  for await (const bytes of terminal.output as AsyncIterable<Buffer>) chunks.push(bytes)
  expect(Buffer.concat(chunks).toString()).toBe('complete tail')
  await terminal.terminate()
  expect(h.native.terminate).toHaveBeenCalled()
})

it('does not let allocation cancellation stop an already published terminal', async () => {
  const h = fixture(), controller = new AbortController()
  const terminal = await h.open({ ...h.spec, signal: controller.signal })
  controller.abort()
  expect(h.launchSpec()?.signal?.aborted).toBe(false)
  await terminal.write('still active')
  expect(h.writes).toEqual(['still active'])
  await terminal.terminate()
})

it('does not acknowledge termination until the independent native range closes', async () => {
  const h = fixture({ pauseClose: true }), terminal = await h.open()
  let done = false
  const stop = terminal.terminate().then(() => { done = true })
  await vi.waitFor(() => { expect(h.native.terminate).toHaveBeenCalled() })
  expect(done).toBe(false)
  h.range.resolve(true); await stop
  expect((await terminal.inspectActivity()).state).toBe('idle')
})

it('reports a terminal operation failure without retrying it', async () => {
  const h = fixture({ failWrite: true }), terminal = await h.open()
  await expect(terminal.write('once')).rejects.toThrow('write rejected')
  expect(h.target.write).toHaveBeenCalledOnce()
  await terminal.resize(80, 24)
  await terminal.terminate()
})

it('rejects invalid dimensions before touching the native terminal', async () => {
  const h = fixture(), terminal = await h.open()
  await expect(terminal.resize(0, 24)).rejects.toBeDefined()
  expect(h.target.resize).not.toHaveBeenCalled()
  await terminal.write('usable')
  await terminal.terminate()
})

it('returns a startup error only after stopping the allocated native range', async () => {
  const h = fixture({ failStart: new Error('native allocation failed') })
  await expect(h.open()).rejects.toBeDefined()
  expect(h.native.terminate).toHaveBeenCalled()
})

it('stops pending calls when the helper control transport is lost', async () => {
  const h = fixture(), terminal = await h.open()
  h.control.destroy()
  await expect(terminal.done).rejects.toBeDefined()
  await terminal.terminate()
  expect(h.native.terminate).toHaveBeenCalled()
})

it('supports an unavailable foreground and discarding output without corrupting control replies', async () => {
  const h = fixture(), terminal = await h.open()
  vi.mocked(h.target.inspectForeground).mockResolvedValueOnce(undefined)
  expect(await terminal.inspectForeground()).toBeUndefined()
  terminal.output.destroy()
  h.output.write('discarded terminal output')
  await terminal.resize(90, 25)
  await terminal.terminate()
})

it('stops the native range when the output consumer reports a failure', async () => {
  const h = fixture(), terminal = await h.open(), failure = new Error('output consumer failed')
  terminal.output.destroy(failure)
  await expect(terminal.done).rejects.toBe(failure)
  await terminal.terminate()
})
