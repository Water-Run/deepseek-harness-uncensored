/** Host handles retain rule release until the independent broker range closes. @module */
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { bindManagedProcess, type ManagedProcessLaunch } from '@deepseek-ai/dsh-subprocess-local/managed'
import type { SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { createNativeHostExecution } from '../src/native-host.ts'
import type { NativeBrokerConfig } from '../src/native-broker-config.ts'
import { encodeNativeFrame, NATIVE_FRAME, readNativeFrames, writeNativeFrame } from '../src/native-protocol.ts'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function spec(): SubprocessSpawnSpec {
  return { argv: [process.execPath, '-e', ''], cwd: process.cwd(), stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 1000 }
}

function fixture(request: SubprocessSpawnSpec = spec()) {
  const input = new PassThrough(), output = new PassThrough(), diagnostics = new PassThrough()
  const direct = Promise.withResolvers<SubprocessOutcome>(), closed = Promise.withResolvers<undefined>()
  const released = vi.fn(async () => { expect(physicalExit).toBe(true) }), report = vi.fn<(error: Error) => void>()
  let physicalExit = false
  const close = (exitCode = 0): void => {
    if (physicalExit) return
    physicalExit = true; input.destroy(); output.end(); diagnostics.end()
    direct.resolve({ exitCode, signal: null }); closed.resolve(undefined)
  }
  const carrier: ManagedProcessLaunch = { stdin: input, stdout: output, stderr: diagnostics, direct: direct.promise,
    owner: { signal() { close(1) }, waitForExit: () => closed.promise, terminateForHostExit() { close(1) } } }
  const config: NativeBrokerConfig = { cwd: process.cwd(), temporaryRoot: tmpdir(),
    files: { readonlyPaths: [], readwritePaths: [], deniedPaths: [], enumeratePaths: [] },
    proxyUrl: null, startupTimeoutMs: 1000, timeoutMs: 0 }
  const prepare = vi.fn(async () => ({ carrier, config, release: released }))
  const host = createNativeHostExecution(request, { TARGET: 'explicit' }, prepare, 256, report)
  const incoming = readNativeFrames(input)
  onTestFinished(async () => { close(1); await Promise.allSettled([host.dispose(), incoming.return(undefined)]) })
  return { host, input, output, diagnostics, carrier, prepare, released, report, incoming, close, brokerDirect: direct,
    async send(tag: number, data: Uint8Array = Buffer.alloc(0)) { await writeNativeFrame(output, { tag, data }) },
    async started() {
      expect((await incoming.next()).value?.tag).toBe(NATIVE_FRAME.configure)
      const launch = (await incoming.next()).value
      expect(launch?.tag).toBe(NATIVE_FRAME.launch)
      expect(JSON.parse(Buffer.from(launch?.data ?? []).toString())).toMatchObject({ env: { TARGET: 'explicit' } })
      await writeNativeFrame(output, { tag: NATIVE_FRAME.accepted, data: Buffer.alloc(0) })
    },
    async finish(exitCode = 23) {
      await writeNativeFrame(output, { tag: NATIVE_FRAME.streamClosed, data: Uint8Array.of(NATIVE_FRAME.stdout) })
      await writeNativeFrame(output, { tag: NATIVE_FRAME.streamClosed, data: Uint8Array.of(NATIVE_FRAME.stderr) })
      if (request.stdio.control === 'pipe') await writeNativeFrame(output, { tag: NATIVE_FRAME.streamClosed, data: Uint8Array.of(NATIVE_FRAME.controlOutput) })
      await writeNativeFrame(output, { tag: NATIVE_FRAME.exited, data: Buffer.from(JSON.stringify({ exitCode, signal: null })) })
      await writeNativeFrame(output, { tag: NATIVE_FRAME.rangeExited, data: Buffer.alloc(0) })
    },
  }
}

it('reports direct exit separately and retains policy until the outer range closes', async () => {
  const h = fixture()
  h.host.launch.stdout?.resume(); h.host.launch.stderr?.resume()
  await h.started(); await h.finish()
  expect(await h.host.launch.direct).toEqual({ exitCode: 23, signal: null })
  expect(h.released).not.toHaveBeenCalled()
  h.close()
  await h.host.launch.owner.waitForExit(); await h.host.settled
  expect(h.released).toHaveBeenCalledOnce()
  expect(h.report).not.toHaveBeenCalled()
})

it('reuses bounded collection and spill without forwarding the trusted broker environment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-native-collection-'))
  const request = { ...spec(), stdio: { stdin: 'ignore' as const, stdout: { maxBytes: 8, spill: { maxBytes: 1024 } }, stderr: { maxBytes: 8 } } }
  const h = fixture(request)
  onTestFinished(async () => { await rm(directory, { recursive: true, force: true }) })
  const handle = bindManagedProcess(request, h.host.launch, { spillDir: directory, onSpillFailure: () => { throw new Error('Unexpected spill failure') } })
  await h.started()
  await h.send(NATIVE_FRAME.stdout, Buffer.from('abcdefghijklmnop'))
  await h.send(NATIVE_FRAME.stderr, Buffer.from('error'))
  await h.finish(); h.close()
  expect(await handle.done).toEqual({ exitCode: 23, signal: null })
  expect(await handle.waitForExit()).toBe(true)
  const result = handle.collected.stdout?.readFrom(0)
  expect(result).toMatchObject({ text: 'ijklmnop', lossy: true })
  if (result?.spillPath === undefined) throw new Error('Expected retained spill')
  expect(await readFile(result.spillPath, 'utf8')).toBe('abcdefghijklmnop')
  await h.host.settled
})

it('cancels before preparation and settles queued input writes', async () => {
  const prepare = vi.fn(async () => { throw new Error('must not prepare') })
  const host = createNativeHostExecution({ ...spec(), stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' } }, {}, prepare, 32, vi.fn())
  const cancellation = new Error('owner cancelled')
  const write = new Promise((resolve) => { host.launch.stdin?.write('pending', (error) => { resolve(error) }) })
  host.launch.owner.signal('SIGTERM', cancellation)
  await expect(host.launch.direct).rejects.toBe(cancellation)
  expect(await write).toBeInstanceOf(Error)
  await host.dispose()
  expect(prepare).not.toHaveBeenCalled()
})

it('retains the scope until cancellation physically closes the broker', async () => {
  const h = fixture()
  h.host.launch.stdout?.resume(); h.host.launch.stderr?.resume()
  await h.started()
  const cancellation = new Error('cancelled after launch')
  h.host.launch.owner.signal('SIGTERM', cancellation)
  await expect(h.host.launch.direct).rejects.toBe(cancellation)
  await h.host.launch.owner.waitForExit()
  expect(h.released).toHaveBeenCalledOnce()
  await h.host.dispose()
})

it.each([NATIVE_FRAME.launch, NATIVE_FRAME.rangeExited, NATIVE_FRAME.stdout])('rejects frame %s outside its response phase', async (tag) => {
  const h = fixture()
  await h.incoming.next(); await h.incoming.next()
  await h.send(tag)
  await expect(h.host.launch.direct).rejects.toBeInstanceOf(Error)
  await expect(h.host.settled).rejects.toBeInstanceOf(Error)
  expect(h.report).toHaveBeenCalled()
  expect(h.released).toHaveBeenCalledOnce()
})

it('does not release protection when outer-range observation is unknown', async () => {
  const h = fixture()
  const failure = new Error('range observation failed')
  h.carrier.owner.waitForExit = async () => { throw failure }
  await h.started()
  await expect(h.host.launch.owner.waitForExit()).rejects.toBe(failure)
  await expect(h.host.settled).rejects.toBeDefined()
  expect(h.released).not.toHaveBeenCalled()
})

it('forwards binary stdin and control independently', async () => {
  const h = fixture({ ...spec(), stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', control: 'pipe' } })
  h.host.launch.stdout?.resume(); h.host.launch.stderr?.resume()
  const received: Buffer[] = []
  h.host.launch.control?.on('data', (chunk: Buffer) => { received.push(chunk) })
  await h.started()
  const first = new Promise<void>((resolve, reject) => {
    h.host.launch.stdin?.write(Buffer.from([0, 255]), (error) => { if (error) reject(error); else resolve() })
  })
  const frame = (await h.incoming.next()).value
  expect(frame).toMatchObject({ tag: NATIVE_FRAME.stdin, data: Buffer.from([0, 255]) })
  await first
  const second = new Promise<void>((resolve, reject) => {
    h.host.launch.control?.write('control', (error) => { if (error) reject(error); else resolve() })
  })
  expect((await h.incoming.next()).value).toMatchObject({ tag: NATIVE_FRAME.control, data: Buffer.from('control') })
  await second
  await h.send(NATIVE_FRAME.controlOutput, Buffer.from('reply'))
  await h.finish(); h.close()
  await h.host.settled
  expect(Buffer.concat(received).toString()).toBe('reply')
})

it('stops a broker returned after preparation was cancelled', async () => {
  const h = fixture(), gate = Promise.withResolvers<undefined>()
  const original = h.prepare.getMockImplementation()
  if (original === undefined) throw new Error('Missing preparation fixture')
  h.prepare.mockImplementationOnce(async () => { await gate.promise; return original() })
  await new Promise(resolve => setImmediate(resolve))
  const cancelled = new Error('cancel during preparation')
  h.host.launch.owner.signal('SIGTERM', cancelled)
  gate.resolve(undefined)
  await expect(h.host.launch.direct).rejects.toBe(cancelled)
  await h.host.launch.owner.waitForExit()
  expect(h.released).toHaveBeenCalledOnce()
  expect(h.input.readableLength).toBe(0)
})

it('does not retry an unsuccessful release after confirmed physical exit', async () => {
  const h = fixture(), failure = new Error('gateway shutdown could not be confirmed')
  h.released.mockRejectedValueOnce(failure)
  h.host.launch.stdout?.resume(); h.host.launch.stderr?.resume()
  await h.started(); await h.finish(); h.close()
  await expect(h.host.launch.owner.waitForExit()).rejects.toBe(failure)
  await expect(h.host.settled).rejects.toBe(failure)
  expect(h.released).toHaveBeenCalledOnce()
})

it('joins disposal while a raw output consumer is paused', async () => {
  const h = fixture()
  await h.started()
  const pending = h.send(NATIVE_FRAME.stdout, Buffer.alloc(128 * 1024, 97))
  await expect.poll(() => h.host.launch.stdout?.readableLength).toBeGreaterThan(0)
  await h.host.dispose(); await pending
  expect(h.released).toHaveBeenCalledOnce()
})

it('bounds startup even when the SDK has not published a child handle', async () => {
  vi.useFakeTimers()
  const h = fixture()
  await h.incoming.next(); await h.incoming.next()
  await vi.advanceTimersByTimeAsync(1000)
  await expect(h.host.launch.direct).rejects.toThrow('startup timed out')
  await expect(h.host.settled).rejects.toThrow('startup timed out')
  expect(h.released).toHaveBeenCalledOnce()
})

it('does not apply the startup deadline to an accepted long-running command', async () => {
  vi.useFakeTimers()
  const h = fixture()
  h.host.launch.stdout?.resume(); h.host.launch.stderr?.resume()
  await h.started()
  await vi.advanceTimersByTimeAsync(10_000)
  expect(h.report).not.toHaveBeenCalled()
  expect(h.released).not.toHaveBeenCalled()
  await h.finish(); h.close(); await h.host.settled
})

const response = (tag: number, data = Buffer.alloc(0)) => ({ tag, data })
const accepted = response(NATIVE_FRAME.accepted)
const exited = response(NATIVE_FRAME.exited, Buffer.from('{"exitCode":0,"signal":null}'))
const stdoutClosed = response(NATIVE_FRAME.streamClosed, Buffer.from([NATIVE_FRAME.stdout]))
const stderrClosed = response(NATIVE_FRAME.streamClosed, Buffer.from([NATIVE_FRAME.stderr]))

it.each([
  [accepted, accepted], [response(NATIVE_FRAME.accepted, Buffer.from('extra'))],
  [accepted, stdoutClosed, response(NATIVE_FRAME.stdout, Buffer.from('late'))],
  [accepted, response(NATIVE_FRAME.controlOutput)],
  [accepted, response(NATIVE_FRAME.streamClosed)],
  [accepted, stdoutClosed, stdoutClosed],
  [accepted, response(NATIVE_FRAME.streamClosed, Buffer.from([99]))],
  [exited], [accepted, response(NATIVE_FRAME.exited, Buffer.from('{}'))],
  [accepted, exited, exited], [accepted, response(NATIVE_FRAME.failed, Buffer.from('{}'))],
  [accepted, response(NATIVE_FRAME.failed, Buffer.from('{"code":"TARGET_FAILED"}'))],
  [accepted, exited, stdoutClosed, stderrClosed, response(NATIVE_FRAME.rangeExited), response(NATIVE_FRAME.stdout)],
].map(frames => ({ frames })))('refuses malformed response ordering or fields %#', async ({ frames }) => {
  const h = fixture()
  h.host.launch.stdout?.resume(); h.host.launch.stderr?.resume()
  await h.incoming.next(); await h.incoming.next()
  h.output.write(Buffer.concat(frames.map(encodeNativeFrame)))
  await expect(h.host.settled).rejects.toBeInstanceOf(Error)
  expect(h.report).toHaveBeenCalled()
  expect(h.released).toHaveBeenCalledOnce()
})

it('rejects an incomplete response log even after a clean broker exit', async () => {
  const h = fixture()
  await h.started(); h.close()
  await expect(h.host.launch.direct).rejects.toThrow('without complete execution records')
  await expect(h.host.settled).rejects.toBeDefined()
})

it.each(['stdin', 'stdout'] as const)('rejects missing broker %s pipes', async (field) => {
  const h = fixture()
  h.carrier[field] = null
  await expect(h.host.launch.direct).rejects.toBeInstanceOf(Error)
  await expect(h.host.settled).rejects.toBeDefined()
  expect(h.released).toHaveBeenCalledOnce()
})

it('preserves explicit null cancellation and has a synchronous host-exit path', async () => {
  const h = fixture()
  await h.started()
  const force = vi.spyOn(h.carrier.owner, 'terminateForHostExit')
  h.host.launch.owner.signal('SIGTERM', null)
  h.host.launch.owner.terminateForHostExit()
  await expect(h.host.launch.direct).rejects.toBeNull()
  await h.host.dispose()
  expect(force).toHaveBeenCalledOnce()
})

it.each([false, true])('keeps shutdown running when reporters fail; stderr failure %s', async (stderrFails) => {
  const h = fixture()
  h.report.mockImplementation(() => { throw new Error('reporter unavailable') })
  vi.spyOn(process.stderr, 'write').mockImplementation(() => { if (stderrFails) throw new Error('stderr unavailable'); return true })
  const original = h.carrier.owner.terminateForHostExit.bind(h.carrier.owner)
  h.carrier.owner.signal = () => { throw new Error('signal unavailable') }
  h.carrier.owner.terminateForHostExit = () => { original(); throw new Error('force outcome unknown') }
  await h.started()
  h.host.launch.owner.terminateForHostExit()
  await h.host.dispose()
  expect(h.released).toHaveBeenCalledOnce()
})

it('forwards stream EOF and rejects writes after physical exit', async () => {
  const h = fixture({ ...spec(), stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', control: 'pipe' } })
  h.host.launch.stdout?.resume(); h.host.launch.stderr?.resume(); h.host.launch.control?.resume()
  await h.started()
  h.host.launch.control?.end()
  expect((await h.incoming.next()).value?.tag).toBe(NATIVE_FRAME.controlEnd)
  await h.finish(); h.close(); await h.host.settled
  const error = await new Promise(resolve => h.host.launch.stdin?.write('', resolve))
  expect(error).toBeInstanceOf(Error)
})

it('supports inherited output and an absent optional diagnostics pipe', async () => {
  const h = fixture({ ...spec(), stdio: { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' } })
  h.carrier.stderr = null
  await h.started()
  await h.send(NATIVE_FRAME.stdout); await h.send(NATIVE_FRAME.stderr)
  await h.finish(); h.close(); await h.host.settled
  expect(h.report).not.toHaveBeenCalled()
})

it('drains discarded raw output without retaining unread data', async () => {
  const h = fixture()
  h.host.launch.stdout?.destroy(); h.host.launch.stderr?.resume()
  await h.started(); await h.send(NATIVE_FRAME.stdout, Buffer.from('discarded'))
  await h.finish(); h.close(); await h.host.settled
  expect(h.released).toHaveBeenCalledOnce()
})

it('reports a failed output write that did not close the consumer stream', async () => {
  const h = fixture()
  if (h.host.launch.stdout === null) throw new Error('Expected output')
  vi.spyOn(h.host.launch.stdout as PassThrough, 'write').mockImplementationOnce(() => { throw new Error('consumer write failed') })
  await h.started(); await h.send(NATIVE_FRAME.stdout, Buffer.from('data'))
  await expect(h.host.settled).rejects.toBeDefined()
  expect(h.report).toHaveBeenCalled()
})

it('normalizes a non-Error preparation failure without creating or releasing a range', async () => {
  const h = fixture()
  h.prepare.mockRejectedValueOnce('failed preparation')
  await expect(h.host.launch.direct).rejects.toMatchObject({ cause: 'failed preparation' })
  await expect(h.host.settled).rejects.toBeDefined()
  expect(h.released).not.toHaveBeenCalled()
})

it('keeps bounded broker diagnostics with a failed execution', async () => {
  const h = fixture()
  await h.started()
  h.diagnostics.write('prefix'.repeat(100) + 'diagnostic end')
  h.close(1)
  await expect(h.host.settled).rejects.toBeDefined()
  const report = h.report.mock.calls.map(([error]) => error.message).find(message => message.startsWith('Native broker diagnostics:'))
  expect(report).toContain('diagnostic end')
  expect(report?.length).toBeLessThan(300)
})

it('observes diagnostics transport failure separately from target stderr', async () => {
  const h = fixture()
  await h.started()
  h.diagnostics.destroy(new Error('diagnostics transport failed'))
  await expect(h.host.settled).rejects.toThrow('diagnostics transport failed')
})

it('contains an outer broker failure without a direct process result', async () => {
  const h = fixture(), failure = new Error('broker could not start')
  await h.started(); h.brokerDirect.reject(failure)
  await expect(h.host.launch.direct).rejects.toBe(failure)
  await expect(h.host.settled).rejects.toBe(failure)
  expect(h.released).toHaveBeenCalledOnce()
})

it('discards response work already queued when the owner disposes', async () => {
  const h = fixture()
  await h.started()
  h.output.write(encodeNativeFrame(response(NATIVE_FRAME.stdout, Buffer.from('queued'))))
  await h.host.dispose()
  expect(h.released).toHaveBeenCalledOnce()
})

it('joins response and diagnostic read failures caused by its own disposal', async () => {
  const h = fixture()
  await h.started()
  if (h.host.launch.stdout === null) throw new Error('Expected output')
  const delivered = once(h.host.launch.stdout, 'data')
  await h.send(NATIVE_FRAME.stdout, Buffer.from('before disposal'))
  await delivered
  const original = h.carrier.owner.signal.bind(h.carrier.owner)
  h.carrier.owner.signal = (signal, reason) => {
    h.diagnostics.destroy(new Error('diagnostic transport disposed'))
    h.output.destroy(new Error('response transport disposed'))
    original(signal, reason)
  }
  await h.host.dispose()
  expect(h.report).not.toHaveBeenCalled()
})
