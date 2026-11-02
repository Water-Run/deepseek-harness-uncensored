/** Private broker tests isolate platform startup from byte transport and refusal semantics. @module */
import { PassThrough } from 'node:stream'
import { join } from 'node:path'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { attachObservedWindowsJob, type ObservedWindowsJob } from '@deepseek-ai/dsh-win32-process'
import { startNativeIngress, type NativeIngressLease } from '../src/native-ingress.ts'
import { nativeContainerRequest, runNativeBroker, type NativeBrokerChild, type NativeBrokerSdk } from '../src/native-broker.ts'
import { nativeBrokerConfigSchema, type NativeBrokerConfig } from '../src/native-broker-config.ts'
import { encodeNativeFrame, NATIVE_FRAME, readNativeFrames, writeNativeFrame } from '../src/native-protocol.ts'
import type { NativeFrame } from '../src/native-protocol.ts'
import type { ContainerRequest } from '@microsoft/mxc-sdk/v1'

vi.mock('@deepseek-ai/dsh-win32-process', async original => ({
  ...await original<typeof import('@deepseek-ai/dsh-win32-process')>(), attachObservedWindowsJob: vi.fn(),
}))
vi.mock('../src/native-ingress.ts', async original => ({
  ...await original<typeof import('../src/native-ingress.ts')>(), startNativeIngress: vi.fn(),
}))
afterEach(() => { vi.mocked(attachObservedWindowsJob).mockReset(); vi.mocked(startNativeIngress).mockReset() })

function config(): NativeBrokerConfig {
  return { cwd: process.cwd(), temporaryRoot: join(process.cwd(), 'temporary'),
    files: { readonlyPaths: [process.cwd()], readwritePaths: [], deniedPaths: [], enumeratePaths: [] },
    proxyUrl: null, startupTimeoutMs: 1000, timeoutMs: 0 }
}

function fixture(mode: 'normal' | 'failed' | 'early' = 'normal') {
  const input = new PassThrough(), output = new PassThrough(), diagnostics = new PassThrough()
  const nativeInput = new PassThrough(), nativeOutput = new PassThrough(), nativeError = new PassThrough()
  const exited = Promise.withResolvers<{ exitCode: number; timedOut: boolean }>()
  let simulated: Promise<void> | undefined
  const frames: NativeFrame[] = []
  const dispose = vi.fn()
  const child: NativeBrokerChild = {
    id: 42, standardInput: nativeInput, standardOutput: nativeOutput, standardError: nativeError,
    wait: () => exited.promise,
    kill: vi.fn(() => { nativeInput.destroy(); nativeOutput.end(); nativeError.end(); exited.resolve({ exitCode: 1, timedOut: false }) }),
    dispose,
  }
  const sdk: NativeBrokerSdk = {
    probe: vi.fn(() => ({ tier: 'base-container', needsDaclAugmentation: false, probes: {
      baseContainerSupportsDenyPaths: true, baseContainerSupportsEnumeratePaths: true, baseContainerSupportsIdentitylessLoopbackProxy: true,
    } })),
    spawn: vi.fn(async (request: ContainerRequest, options: { telemetry: { enabled: false } }) => {
      expect(options).toEqual({ telemetry: { enabled: false } })
      if (mode === 'early') { nativeOutput.end(); nativeError.end(); exited.resolve({ exitCode: 127, timedOut: false }); return child }
      const nonce = request.command.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/)?.[0]
      nativeOutput.write(`${JSON.stringify({ nonce, pid: child.id, creationTime: '1' })}\n`)
      const admitted = new Promise<void>((resolve, reject) => {
        const closed = () => { reject(new Error('Closed before simulated admission')) }
        nativeInput.once('close', closed)
        nativeInput.once('data', (bytes: Buffer) => {
          nativeInput.off('close', closed); nativeInput.pause()
          try { expect(bytes).toEqual(Buffer.from([1])); resolve() }
          catch (error) { reject(new Error('Invalid simulated admission', { cause: error })) }
        })
      })
      simulated = (async () => {
        await admitted
        for await (const frame of readNativeFrames(nativeInput)) {
          frames.push(frame)
          if (frame.tag === NATIVE_FRAME.launch) {
            await writeNativeFrame(nativeOutput, { tag: NATIVE_FRAME.accepted, data: Buffer.alloc(0) })
          } else if (frame.tag === NATIVE_FRAME.stdin) {
            await writeNativeFrame(nativeOutput, { tag: NATIVE_FRAME.stdout, data: frame.data })
          } else if (frame.tag === NATIVE_FRAME.stdinEnd || frame.tag === NATIVE_FRAME.terminate) {
            if (mode === 'failed') {
              await writeNativeFrame(nativeOutput, { tag: NATIVE_FRAME.failed, data: Buffer.from('{"code":"TARGET_START_FAILED"}') })
              exited.resolve({ exitCode: 127, timedOut: false })
            } else {
              await writeNativeFrame(nativeOutput, { tag: NATIVE_FRAME.exited, data: Buffer.from('{"exitCode":23,"signal":null}') })
              await writeNativeFrame(nativeOutput, { tag: NATIVE_FRAME.rangeExited, data: Buffer.alloc(0) })
              exited.resolve({ exitCode: 0, timedOut: false })
            }
            nativeOutput.end(); nativeError.end(); nativeInput.end()
          }
        }
      })()
      void simulated.catch(() => {}) // Teardown awaits the simulated worker after closing its transport.
      return child
    }),
  }
  const received: NativeFrame[] = [], errors: Buffer[] = []
  diagnostics.on('data', (chunk: Buffer) => { errors.push(chunk) })
  const reader = (async () => { for await (const frame of readNativeFrames(output)) received.push(frame) })()
  void reader.catch(() => {})
  let running: Promise<void> | undefined
  onTestFinished(async () => {
    input.destroy(); output.destroy(); diagnostics.destroy()
    nativeInput.destroy(); nativeOutput.destroy(); nativeError.destroy(); exited.resolve({ exitCode: 1, timedOut: false })
    await Promise.allSettled([running, reader, simulated])
  })
  return { input, output, diagnostics, child, dispose, sdk, frames, received, errors, nativeInput, nativeOutput, nativeError,
    run() {
      running = runNativeBroker(input, output, diagnostics, async () => sdk).finally(() => { output.end() })
      void running.catch(() => {})
      return running
    },
    async send(tag: number, value: Uint8Array = Buffer.alloc(0)) { await writeNativeFrame(input, { tag, data: value }) },
    reader,
  }
}

it('constructs fixed containment without inheriting secrets or preload hooks', () => {
  const request = nativeContainerRequest(config(), '01234567-0123-0123-0123-0123456789ab', {
    SystemRoot: 'system', NODE_OPTIONS: '--require=untrusted', TSX_TSCONFIG_PATH: 'untrusted', API_KEY: 'secret', ELECTRON_RUN_AS_NODE: '1',
  })
  expect(request.environment).toEqual({ SystemRoot: 'system', WINDIR: undefined, SystemDrive: undefined,
    TEMP: config().temporaryRoot, TMP: config().temporaryRoot, LOCALAPPDATA: config().temporaryRoot,
    USERPROFILE: config().temporaryRoot, ELECTRON_RUN_AS_NODE: '1' })
  expect(request.network).toEqual({ egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } })
  expect(request.command).toContain('native-bootstrap.mjs')
})

it.each(['https://127.0.0.1:1234', 'http://example.com:1234', 'http://127.0.0.1:1234/path', 'http://user:pass@127.0.0.1:1234'])('refuses an unowned proxy route %s', (proxyUrl) => {
  expect(nativeBrokerConfigSchema.safeParse({ ...config(), proxyUrl }).success).toBe(false)
})

it('constructs proxy-only routing for the protected loopback gateway', () => {
  const value = nativeBrokerConfigSchema.parse({ ...config(), proxyUrl: 'http://127.0.0.1:1234' })
  expect(nativeContainerRequest(value, 'nonce', {}).network).toEqual({
    egress: { default: 'deny' }, ingress: { default: 'allow', hostLoopback: 'allow' }, runtimeConfig: { networkProxy: value.proxyUrl },
  })
})

it('passes binary input and worker lifecycle through the configured native transport', async () => {
  const h = fixture(), done = h.run(), data = Buffer.from([0, 255, 128, 10, 13])
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}'))
  await h.send(NATIVE_FRAME.stdin, data); await h.send(NATIVE_FRAME.stdinEnd)
  await done; await h.reader
  expect(h.frames.map(frame => frame.tag)).toEqual([NATIVE_FRAME.launch, NATIVE_FRAME.stdin, NATIVE_FRAME.stdinEnd])
  expect(h.received.find(frame => frame.tag === NATIVE_FRAME.stdout)?.data).toEqual(data)
  expect(h.received.at(-1)?.tag).toBe(NATIVE_FRAME.rangeExited)
  expect(h.dispose).toHaveBeenCalledOnce()
})

function ingressFixture() {
  const h = fixture(), failed = Promise.withResolvers<never>()
  const job = { borrowHandle: () => 99n, isEmpty: () => false, terminate: vi.fn(), close: vi.fn(),
    waitForExit: vi.fn(async () => { await h.child.wait(); return true }) } satisfies ObservedWindowsJob
  const lease = { id: 'scope', failed: failed.promise, release: vi.fn(async () => {}), stop: vi.fn(async () => {}) } satisfies NativeIngressLease
  vi.mocked(attachObservedWindowsJob).mockReturnValue(job)
  vi.mocked(startNativeIngress).mockResolvedValue(lease)
  const options = { executable: join(process.cwd(), 'guard.exe'), requestTimeoutMs: 1000,
    shutdownTimeoutMs: 1000, pollIntervalMs: 1, diagnosticMaxBytes: 1024 }
  return { ...h, job, lease, failed, options,
    async configure() { await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify({ ...config(), ingress: options }))) } }
}

it('does not dispatch buffered target frames until inbound protection is acknowledged', async () => {
  const h = ingressFixture(), installing = Promise.withResolvers<NativeIngressLease>(), reached = Promise.withResolvers<undefined>()
  vi.mocked(startNativeIngress).mockImplementation(async () => { reached.resolve(undefined); return installing.promise })
  const done = h.run()
  await h.configure(); await reached.promise
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}')); await h.send(NATIVE_FRAME.stdinEnd)
  expect(h.frames).toEqual([])
  expect(attachObservedWindowsJob).toHaveBeenCalledWith({ pid: 42, creationTime: 1n })
  installing.resolve(h.lease)
  await done
  expect(h.frames.map(frame => frame.tag)).toEqual([NATIVE_FRAME.launch, NATIVE_FRAME.stdinEnd])
  expect(h.job.waitForExit).toHaveBeenCalledOnce()
  expect(h.lease.release).toHaveBeenCalledOnce()
  expect(h.job.close).toHaveBeenCalledOnce()
})

it('refuses helper admission without forwarding the target launch', async () => {
  const h = ingressFixture()
  vi.mocked(startNativeIngress).mockRejectedValue(new Error('permission required'))
  const done = h.run()
  await h.configure(); await h.send(NATIVE_FRAME.launch, Buffer.from('{}'))
  await expect(done).rejects.toThrow('Native broker failed')
  expect(h.frames).toEqual([])
  expect(h.job.terminate).toHaveBeenCalled()
  expect(h.job.close).toHaveBeenCalledOnce()
})

it('stops the worker if its established inbound guard fails', async () => {
  const h = ingressFixture(), kill = vi.spyOn(h.child, 'kill'), done = h.run()
  await h.configure(); await h.send(NATIVE_FRAME.launch, Buffer.from('{}'))
  await expect.poll(() => h.frames.length).toBe(1)
  h.failed.reject(new Error('guard lost'))
  await expect(done).rejects.toThrow('Native broker failed')
  expect(kill).toHaveBeenCalled()
  expect(h.lease.release).toHaveBeenCalledOnce()
})

it('does not release inbound rules if independent Job closure is unknown', async () => {
  const h = ingressFixture(), done = h.run()
  vi.mocked(h.job.waitForExit).mockResolvedValue(false)
  await h.configure(); await h.send(NATIVE_FRAME.launch, Buffer.from('{}')); await h.send(NATIVE_FRAME.stdinEnd)
  await expect(done).rejects.toThrow('shutdown remains unconfirmed')
  expect(h.lease.release).not.toHaveBeenCalled()
  expect(h.job.close).not.toHaveBeenCalled()
})

it('contains independent Job termination failures and leaves its rules retained', async () => {
  const h = ingressFixture(), done = h.run()
  vi.mocked(h.job.terminate).mockImplementation(() => { throw new Error('independent stop failed') })
  vi.mocked(startNativeIngress).mockRejectedValue(new Error('helper failed'))
  await h.configure()
  await expect(done).rejects.toThrow('independent stop failed')
  expect(h.lease.release).not.toHaveBeenCalled()
  expect(h.dispose).toHaveBeenCalledOnce()
})

it.each(['invalid', 'missing', 'capability', 'early'] as const)('refuses %s startup without ordinary-process fallback', async (mode) => {
  const h = fixture(mode === 'early' ? 'early' : 'normal')
  if (mode === 'capability') vi.mocked(h.sdk.probe).mockReturnValue({ tier: 'app-container', probes: {
    baseContainerSupportsDenyPaths: false, baseContainerSupportsEnumeratePaths: false,
    baseContainerSupportsIdentitylessLoopbackProxy: false,
  } })
  const done = h.run()
  await h.send(mode === 'missing' ? NATIVE_FRAME.launch : NATIVE_FRAME.configure,
    Buffer.from(JSON.stringify(mode === 'invalid' ? {} : config())))
  await expect(done).rejects.toThrow('Native broker failed')
  await h.reader
  expect(h.received.map(frame => frame.tag)).toEqual([NATIVE_FRAME.failed])
  if (mode !== 'early') expect(h.sdk.spawn).not.toHaveBeenCalled()
})

it('preserves one worker failure without emitting a duplicate failure frame', async () => {
  const h = fixture('failed'), done = h.run()
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}')); await h.send(NATIVE_FRAME.stdinEnd)
  await expect(done).rejects.toThrow('Native broker failed'); await h.reader
  expect(h.received.filter(frame => frame.tag === NATIVE_FRAME.failed)).toHaveLength(1)
  expect(h.received.find(frame => frame.tag === NATIVE_FRAME.failed)?.data).toEqual(Buffer.from('{"code":"TARGET_START_FAILED"}'))
})

it.each(['standardInput', 'standardOutput', 'standardError'] as const)('refuses a missing native %s transport', async (field) => {
  const h = fixture()
  vi.mocked(h.sdk.spawn).mockResolvedValue({ ...h.child, [field]: null })
  const done = h.run()
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await expect(done).rejects.toThrow('Native broker failed')
  await h.reader
  expect(h.dispose).toHaveBeenCalledOnce()
})

it('refuses proxy routing when the selected native tier cannot enforce it', async () => {
  const h = fixture()
  vi.mocked(h.sdk.probe).mockReturnValue({ tier: 'base-container', needsDaclAugmentation: false, probes: {
    baseContainerSupportsDenyPaths: true, baseContainerSupportsEnumeratePaths: true, baseContainerSupportsIdentitylessLoopbackProxy: false,
  } })
  const done = h.run()
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify({ ...config(), proxyUrl: 'http://127.0.0.1:1234' })))
  await expect(done).rejects.toThrow('Native broker failed')
  expect(h.sdk.spawn).not.toHaveBeenCalled()
})

it('keeps native diagnostics outside target response frames', async () => {
  const h = fixture(), done = h.run()
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}'))
  await expect.poll(() => h.frames.length).toBe(1)
  h.nativeError.write('bootstrap diagnostic')
  await h.send(NATIVE_FRAME.stdinEnd)
  await done; await h.reader
  expect(Buffer.concat(h.errors).toString()).toBe('bootstrap diagnostic')
  expect(h.received.some(frame => frame.tag === NATIVE_FRAME.stderr)).toBe(false)
})

it.each(['host-frame', 'worker-frame', 'input-eof', 'output-close', 'report-close'] as const)('stops on %s protocol failure', async (failure) => {
  const h = fixture(), done = h.run()
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}'))
  await expect.poll(() => h.frames.length).toBe(1)
  if (failure === 'host-frame') await h.send(NATIVE_FRAME.configure)
  if (failure === 'worker-frame') h.nativeOutput.write(encodeNativeFrame({ tag: NATIVE_FRAME.launch, data: Buffer.alloc(0) }))
  if (failure === 'input-eof') h.input.end()
  if (failure === 'output-close') h.output.destroy()
  if (failure === 'report-close') { h.output.destroy(new Error('host response unavailable')) }
  await expect(done).rejects.toBeDefined()
  expect(h.dispose).toHaveBeenCalledOnce()
})

it('attempts disposal even if native termination reports a failure', async () => {
  const h = fixture(), original = h.child.kill.bind(h.child)
  h.child.kill = () => { original(); throw new Error('native kill failed') }
  const done = h.run()
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}'))
  await expect.poll(() => h.frames.length).toBe(1)
  h.input.end()
  await expect(done).rejects.toBeDefined()
  expect(h.dispose).toHaveBeenCalledOnce()
})

it('permits host transport closure after confirmed worker completion', async () => {
  const h = fixture(), done = h.run()
  h.input.once('close', () => { h.output.emit('close') })
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}')); await h.send(NATIVE_FRAME.stdinEnd)
  await done
  await expect(h.reader).rejects.toMatchObject({ code: 'ERR_STREAM_PREMATURE_CLOSE' })
  expect(h.received.at(-1)?.tag).toBe(NATIVE_FRAME.rangeExited)
  expect(h.dispose).toHaveBeenCalledOnce()
})

it('reports a diagnostic failure concurrent with confirmed worker completion', async () => {
  const h = fixture(), done = h.run(), failure = new Error('diagnostics closed during completion')
  h.input.once('close', () => { h.diagnostics.emit('error', failure) })
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}')); await h.send(NATIVE_FRAME.stdinEnd)
  await expect(done).rejects.toThrow('Native broker failed')
  await h.reader
  expect(h.dispose).toHaveBeenCalledOnce()
})

it.each([false, true])('discards buffered host input after completion; diagnostics fail=%s', async (diagnosticFailure) => {
  const h = fixture(), finished = Promise.withResolvers<undefined>()
  h.input.once('close', () => { finished.resolve(undefined) })
  const write = h.nativeInput._write.bind(h.nativeInput)
  h.nativeInput._write = (chunk: Buffer, encoding, callback) => {
    write(chunk, encoding, (error) => {
      if (chunk.length === 5 && chunk[0] === NATIVE_FRAME.stdinEnd) {
        void finished.promise.then(() => {
          if (diagnosticFailure) h.diagnostics.emit('error', new Error('late diagnostics failure'))
          callback(error)
        })
      } else callback(error)
    })
  }
  const done = h.run()
  await h.send(NATIVE_FRAME.configure, Buffer.from(JSON.stringify(config())))
  await h.send(NATIVE_FRAME.launch, Buffer.from('{}'))
  await expect.poll(() => h.frames.length).toBe(1)
  h.input.write(Buffer.concat([
    encodeNativeFrame({ tag: NATIVE_FRAME.stdinEnd, data: Buffer.alloc(0) }),
    encodeNativeFrame({ tag: NATIVE_FRAME.stdin, data: Buffer.from('late input') }),
  ]))
  if (diagnosticFailure) await expect(done).rejects.toThrow('Native broker failed')
  else await done
  await h.reader
  expect(h.frames.map(frame => frame.tag)).toEqual([NATIVE_FRAME.launch, NATIVE_FRAME.stdinEnd])
  expect(h.dispose).toHaveBeenCalledOnce()
})
