/** Real native execution consumes compiled rules and retains them through process-tree shutdown. @module */
import { Context } from '@deepseek-ai/cordis'
import { probe, spawn, type ContainerRequest, type MxcProcess } from '@microsoft/mxc-sdk/v1'
import { attachObservedWindowsJob, buildCommandLine, extendWin32ProcessBindings, isNullPtr, observedWindowsBootstrapPath, type CurrentTokenProcessBindings, type NativePtr, type ObservedWindowsJob } from '@deepseek-ai/dsh-win32-process'
import { brandString } from '@deepseek-ai/dsh-brand'
import { mkdtemp, mkdir, writeFile, readFile, link, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import type { Readable } from 'node:stream'
import { describe, expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'
import TargetProtection, { type TargetRuleId } from '../src/index.ts'
import { compileNativeFilePolicy } from '../src/native-file-policy.ts'
import { readNativeBootstrapIdentity } from '../src/native-bootstrap.ts'
import { NATIVE_FRAME, readNativeFrames, writeNativeFrame } from '../src/native-protocol.ts'
import { createNativeHostExecution } from '../src/native-host.ts'
import { launchNativeBroker } from '../src/native-launch.ts'
import { bindManagedProcess, launchWindowsJob } from '@deepseek-ai/dsh-subprocess-local/managed'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

const supported = process.platform === 'win32' && probe().tier === 'base-container'

interface ProcessObserver extends CurrentTokenProcessBindings {
  openProcess(access: number, inherit: number, pid: number): NativePtr | null
  terminateProcess(handle: NativePtr, code: number): number
}

async function capture(stream: Readable | null): Promise<string> {
  if (stream === null) throw new Error('Native stdout is missing')
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) throw new Error('Expected native output bytes')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function fixture(source: string, extraReadonlyPaths: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-runtime-')), ctx = new Context()
  const workspace = join(root, 'work'), production = join(workspace, 'production'), audit = join(workspace, 'audit')
  const temporary = join(root, 'temporary'), owner = join(root, 'owner.txt'), script = join(root, 'program.cjs')
  for (const path of [workspace, production, audit, temporary]) await mkdir(path)
  await writeFile(owner, 'owner-preserve')
  await writeFile(join(production, 'data.txt'), 'production-preserve')
  await writeFile(join(audit, 'data.txt'), 'audit-preserve')
  await link(join(production, 'data.txt'), join(workspace, 'production-link.txt'))
  await link(join(audit, 'data.txt'), join(workspace, 'audit-link.txt'))
  await writeFile(script, `const root=${JSON.stringify(root)};\n${source}\n`)
  const releases: (() => void)[] = []
  onTestFinished(async () => {
    for (const release of releases) release()
    await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true })
  })
  await ctx.plugin(TargetProtection, { path: join(root, 'rules.sqlite'), hostsFile: '', ownerPaths: [owner] })
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [
    { id: brandString<TargetRuleId>('63ac174b-3be7-4d04-bbc4-6c85f52cfe30'), name: 'production', enabled: true,
      kind: 'server', environment: 'production', protection: 'full', match: 'path', address: production },
    { id: brandString<TargetRuleId>('1f207c4b-08a4-4e89-ac0e-0a8080b4ecf0'), name: 'audit', enabled: true,
      kind: 'server', environment: 'production', protection: 'audit', match: 'path', address: audit },
  ] }, 1)
  const constraints = await ctx.targetProtection.nativeFileConstraints()
  const files = await compileNativeFilePolicy(constraints, { readonlyPaths: [root, dirname(process.execPath), ...extraReadonlyPaths],
    readwritePaths: [workspace, audit, temporary], maxEntries: 1000, maxPaths: 200 }, new AbortController().signal)
  const request: ContainerRequest = {
    command: buildCommandLine(process.execPath, [script]), workingDirectory: workspace,
    containment: { type: 'processcontainer', config: { filesystem: { enumeratePaths: files.enumeratePaths } } },
    filesystem: { readonlyPaths: files.readonlyPaths, readwritePaths: files.readwritePaths, deniedPaths: files.deniedPaths },
    network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
    ui: { disable: false, clipboard: 'none', allowInputInjection: false }, timeoutMs: 15000,
    environment: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive,
      LOCALAPPDATA: temporary, USERPROFILE: temporary, TEMP: temporary, TMP: temporary },
  }
  const check = probe(request)
  expect(check.tier).toBe('base-container')
  expect(check.needsDaclAugmentation).toBe(false)
  return { root, ctx, request, files, releases }
}

async function stopNativeRange(job: ObservedWindowsJob | undefined, release: (() => void) | undefined): Promise<void> {
  if (job === undefined) throw new Error('Native Job is not attached')
  job.terminate(1)
  expect(await job.waitForExit(10, AbortSignal.timeout(30_000))).toBe(true)
  release?.()
}

describe.skipIf(!supported)('Windows native target policy with MXC', () => {
  it.skipIf(process.env.DSH_NATIVE_INGRESS_HELPER === undefined || process.env.DSH_NATIVE_INGRESS_TEST_ELEVATED === '1')(
    'keeps the real broker bootstrap closed when its mandatory inbound helper cannot install rules', async () => {
      const helper = process.env.DSH_NATIVE_INGRESS_HELPER
      if (helper === undefined) throw new Error('Helper path required')
      const repository = fileURLToPath(new URL('../../../..', import.meta.url)), h = await fixture('', [repository])
      const marker = join(h.root, 'work', 'must-not-start.txt'), reports: Error[] = []
      const request: SubprocessSpawnSpec = { argv: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started')`],
        cwd: join(h.root, 'work'), stdio: { stdin: 'ignore', stdout: { maxBytes: 128 }, stderr: { maxBytes: 128 } }, graceMs: 1000 }
      const host = createNativeHostExecution(request, async (signal) => {
        const release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, async () => {
          host.launch.owner.signal('SIGKILL'); await host.launch.owner.waitForExit()
        })
        try {
          return { carrier: launchNativeBroker(request.graceMs, signal), environment: {},
            config: { cwd: request.cwd, temporaryRoot: join(h.root, 'temporary'), files: {
              readonlyPaths: h.files.readonlyPaths, readwritePaths: h.files.readwritePaths,
              deniedPaths: h.files.deniedPaths, enumeratePaths: h.files.enumeratePaths,
            }, proxyUrl: null, startupTimeoutMs: 10000, timeoutMs: 20000,
            ingress: { executable: helper, requestTimeoutMs: 5000, shutdownTimeoutMs: 5000,
              pollIntervalMs: 10, diagnosticMaxBytes: 4096 } },
            async release() { release() },
          }
        } catch (error) { release(); throw error }
      }, 16384, (error) => { reports.push(error) })
      try {
        await expect(host.launch.direct).rejects.toBeDefined()
        await host.launch.owner.waitForExit()
        await expect(host.settled).rejects.toBeDefined()
        await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
        expect(reports.some(error => error.message.includes('permission-required'))).toBe(true)
        expect((await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, h.files.revision)).revision)
          .toBe(h.files.revision + 1)
      } finally { await host.dispose() }
    },
  )

  it('closes an SDK-created process when cancellation precedes handle publication', async () => {
    const repository = fileURLToPath(new URL('../../../..', import.meta.url)), h = await fixture('', [repository])
    const marker = join(h.root, 'sdk-created.pid'), diagnostics: Error[] = []
    const request: SubprocessSpawnSpec = { argv: [process.execPath, '-e', 'throw Error("must not execute")'], cwd: join(h.root, 'work'),
      stdio: { stdin: 'ignore', stdout: { maxBytes: 128 }, stderr: { maxBytes: 128 } }, graceMs: 1000 }
    const host = createNativeHostExecution(request, async (signal) => {
      signal.throwIfAborted()
      const release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, async () => {
        host.launch.owner.signal('SIGKILL'); await host.launch.owner.waitForExit()
      })
      try {
        return { environment: {}, carrier: launchWindowsJob({
          argv: [process.execPath, '--import', import.meta.resolve('tsx/esm'),
            fileURLToPath(new URL('./fixtures/native-broker-publish-gap.ts', import.meta.url))],
          cwd: repository, stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: 1000,
        }, { SystemRoot: process.env.SystemRoot ?? '', WINDIR: process.env.WINDIR ?? '', SystemDrive: process.env.SystemDrive ?? '',
          TEMP: process.env.TEMP ?? '', TMP: process.env.TMP ?? '', DSHU_TEST_NATIVE_MARKER: marker,
          TSX_TSCONFIG_PATH: join(repository, 'tsconfig.base.json') }),
        config: { cwd: request.cwd, temporaryRoot: join(h.root, 'temporary'),
          files: { readonlyPaths: h.files.readonlyPaths, readwritePaths: h.files.readwritePaths,
            deniedPaths: h.files.deniedPaths, enumeratePaths: h.files.enumeratePaths },
          proxyUrl: null, startupTimeoutMs: 10_000, timeoutMs: 0 },
        async release() { release() },
        }
      } catch (error) { release(); throw error }
    }, 4096, (error) => { diagnostics.push(error) })
    const api = extendWin32ProcessBindings(({ kernel32, bind }) => ({
      openProcess: bind(kernel32, 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']),
      terminateProcess: bind(kernel32, 'TerminateProcess', 'int', ['void *', 'uint32']),
    })) as ProcessObserver
    let processHandle: NativePtr | null = null
    try {
      await expect.poll(async () => {
        try { return await readFile(marker, 'utf8') }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error }
      }).toMatch(/^\d+$/)
      processHandle = api.openProcess(0x00100001, 0, Number(await readFile(marker, 'utf8')))
      if (isNullPtr(processHandle)) throw new Error('The SDK bootstrap was not alive at the held startup point')
      expect(api.waitForSingleObject(processHandle, 0)).not.toBe(0)
      const cancellation = new Error('Cancelled during SDK handle publication')
      host.launch.owner.signal('SIGTERM', cancellation)
      await expect(host.launch.direct).rejects.toBe(cancellation)
      await host.launch.owner.waitForExit()
      expect(api.waitForSingleObject(processHandle, 0)).toBe(0)
      await host.dispose()
      const changed = await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, h.files.revision)
      expect(changed.revision).toBe(h.files.revision + 1)
    } finally {
      try { await host.dispose() }
      finally {
        if (!isNullPtr(processHandle)) {
          if (api.waitForSingleObject(processHandle, 0) !== 0) {
            api.terminateProcess(processHandle, 1); api.waitForSingleObject(processHandle, 5000)
          }
          expect(api.closeHandle(processHandle)).toBe(1)
        }
      }
    }
  })

  it('runs the complete host/broker/worker chain with retained policy and shared output collection', async () => {
    const repository = fileURLToPath(new URL('../../../..', import.meta.url))
    const h = await fixture('', [repository]), spill = join(h.root, 'spill')
    await mkdir(spill)
    const request: SubprocessSpawnSpec = {
      argv: [process.execPath, '-e', `const fs=require('node:fs'),root=${JSON.stringify(h.root)};
try{fs.writeFileSync(root+'/work/production/data.txt','wrong');process.exit(99)}catch(error){if(error.code!=='EPERM')throw error}
fs.writeFileSync(root+'/work/host-output.txt','allowed');process.stdout.write(Buffer.alloc(32768,97));process.exitCode=23;`],
      cwd: join(h.root, 'work'), stdio: { stdin: 'ignore', stdout: { maxBytes: 64, spill: { maxBytes: 65536 } }, stderr: { maxBytes: 256 } }, graceMs: 1000,
    }
    const reports: Error[] = []
    const host = createNativeHostExecution(request, async (signal) => {
      const release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, async () => {
        host.launch.owner.signal('SIGKILL')
        await host.launch.owner.waitForExit()
      })
      try {
        return { carrier: launchNativeBroker(request.graceMs, signal),
          environment: Object.fromEntries(Object.entries(h.request.environment ?? {})
            .filter((entry): entry is [string, string] => entry[1] !== undefined)),
          config: { cwd: request.cwd, temporaryRoot: join(h.root, 'temporary'),
            files: { readonlyPaths: h.files.readonlyPaths, readwritePaths: h.files.readwritePaths,
              deniedPaths: h.files.deniedPaths, enumeratePaths: h.files.enumeratePaths },
            proxyUrl: null, startupTimeoutMs: 10_000, timeoutMs: 20_000 },
          async release() { release() },
        }
      } catch (error) { release(); throw error }
    }, 4096, (error) => { reports.push(error) })
    const handle = bindManagedProcess(request, host.launch, { spillDir: spill, onSpillFailure: (error) => { throw error } })
    try {
      expect(await handle.done).toEqual({ exitCode: 23, signal: null })
      expect(await handle.waitForExit(AbortSignal.timeout(30_000))).toBe(true)
      await host.settled
      const output = handle.collected.stdout?.readFrom(0)
      expect(output).toMatchObject({ text: 'a'.repeat(64), lossy: true })
      if (output?.spillPath === undefined) throw new Error('Native collection omitted the complete spill')
      expect((await readFile(output.spillPath)).length).toBe(32768)
      expect(await readFile(join(h.root, 'work', 'production', 'data.txt'), 'utf8')).toBe('production-preserve')
      expect(await readFile(join(h.root, 'work', 'host-output.txt'), 'utf8')).toBe('allowed')
      expect(reports).toEqual([])
      const changed = await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, h.files.revision)
      expect(changed.revision).toBe(h.files.revision + 1)
    } finally { await host.dispose() }
  })

  it('rejects a redirected temporary directory outside the owned root before loading the worker', async () => {
    const repository = fileURLToPath(new URL('../../../..', import.meta.url))
    const h = await fixture('', [repository]), nonce = randomUUID()
    const command = buildCommandLine(process.execPath, [observedWindowsBootstrapPath(), nonce,
      new URL('./must-not-load.mjs', import.meta.url).href, '', '', join(h.root, 'work')])
    const native = await spawn({ ...h.request, command }), errors = capture(native.standardError)
    const input = native.standardInput, output = native.standardOutput
    let job: ObservedWindowsJob | undefined, remainder: Promise<string> | undefined
    try {
      if (input === null || output === null) throw new Error('Native transport is missing')
      job = attachObservedWindowsJob(await readNativeBootstrapIdentity(output, nonce, native.id, AbortSignal.timeout(10_000)))
      remainder = capture(output)
      input.write(Uint8Array.of(1))
      expect(await native.wait()).toEqual({ exitCode: 127, timedOut: false })
      expect(await remainder).toBe('')
      expect(await errors).toContain('temporary directory escaped its private root')
      expect(await job.waitForExit(10, AbortSignal.timeout(30_000))).toBe(true)
    } finally {
      try {
        native.kill(); await native.wait()
        if (job !== undefined) { await stopNativeRange(job, undefined); job.close() }
        await remainder
      } finally { native.dispose() }
    }
  })

  it.each(['natural', 'terminate'] as const)('retains a detached command descendant until %s completion', async (finish) => {
    const repository = fileURLToPath(new URL('../../../..', import.meta.url))
    const h = await fixture('', [repository]), nonce = randomUUID(), work = join(h.root, 'work')
    const command = buildCommandLine(process.execPath, [observedWindowsBootstrapPath(), nonce,
      new URL('../src/native-worker.ts', import.meta.url).href, import.meta.resolve('tsx/esm/api'),
      join(repository, 'tsconfig.base.json'), join(h.root, 'temporary')])
    const native = await spawn({ ...h.request, command }), errors = capture(native.standardError)
    const input = native.standardInput, output = native.standardOutput
    let job: ObservedWindowsJob | undefined, release: (() => void) | undefined, reading: Promise<void> | undefined
    const stop = () => stopNativeRange(job, release)
    try {
      if (input === null || output === null) throw new Error('Native transport is missing')
      job = attachObservedWindowsJob(await readNativeBootstrapIdentity(output, nonce, native.id, AbortSignal.timeout(10_000)))
      release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, stop)
      const direct = Promise.withResolvers<unknown>(), complete = Promise.withResolvers<undefined>()
      let rangeExited = false
      reading = (async () => {
        for await (const frame of readNativeFrames(output)) {
          if (frame.tag === NATIVE_FRAME.failed) throw new Error(Buffer.from(frame.data).toString())
          if (frame.tag === NATIVE_FRAME.exited) direct.resolve(JSON.parse(Buffer.from(frame.data).toString()))
          if (frame.tag === NATIVE_FRAME.rangeExited) { rangeExited = true; complete.resolve(undefined) }
        }
      })().catch((error: unknown) => { direct.reject(error); complete.reject(error); throw error })
      void reading.catch(() => {}); void complete.promise.catch(() => {})
      const descendant = `const fs=require('node:fs'),root=${JSON.stringify(work)};
try{fs.writeFileSync(root+'/production/data.txt','wrong');process.exit(99)}catch(error){fs.writeFileSync(root+'/denied.txt',error.code)}
let tick=0;const timer=setInterval(()=>{fs.writeFileSync(root+'/heartbeat.txt',String(++tick));if(fs.existsSync(root+'/release.txt')){clearInterval(timer);fs.writeFileSync(root+'/finished.txt','natural')}},25);`
      const parent = `const fs=require('node:fs');const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore',detached:true,windowsHide:true});c.unref();
const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(join(work, 'heartbeat.txt'))})){clearInterval(timer);process.exit(23)}},10);`
      input.write(Uint8Array.of(1))
      await writeNativeFrame(input, { tag: NATIVE_FRAME.launch, data: Buffer.from(JSON.stringify({
        argv: [process.execPath, '-e', parent], cwd: work, env: h.request.environment,
        stdin: 'ignore', control: false, graceMs: 1000,
      })) })
      expect(await direct.promise).toEqual({ exitCode: 23, signal: null })
      let firstTick: number | undefined
      await expect.poll(async () => {
        const value = await readFile(join(work, 'heartbeat.txt'), 'utf8')
        if (!/^[1-9]\d*$/.test(value)) return false
        const tick = Number(value)
        if (firstTick === undefined) { firstTick = tick; return false }
        return tick > firstTick
      }).toBe(true)
      expect(rangeExited).toBe(false)
      expect(await readFile(join(work, 'denied.txt'), 'utf8')).toBe('EPERM')
      if (finish === 'natural') await writeFile(join(work, 'release.txt'), 'finish')
      else await writeNativeFrame(input, { tag: NATIVE_FRAME.terminate, data: Buffer.alloc(0) })
      await complete.promise
      expect(await native.wait()).toEqual({ exitCode: 0, timedOut: false })
      await reading
      expect(await job.waitForExit(10, AbortSignal.timeout(30_000))).toBe(true)
      release()
      expect(await readFile(join(work, 'production', 'data.txt'), 'utf8')).toBe('production-preserve')
      if (finish === 'natural') expect(await readFile(join(work, 'finished.txt'), 'utf8')).toBe('natural')
      else await expect(readFile(join(work, 'finished.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await errors).toBe('')
    } finally {
      try {
        native.kill(); await native.wait()
        if (job !== undefined) { await stop(); job.close() }
        await reading
      } finally { native.dispose() }
    }
  })

  it('runs the production bootstrap and framed worker only after native attachment', async () => {
    const repository = fileURLToPath(new URL('../../../..', import.meta.url))
    const h = await fixture('', [repository]), nonce = randomUUID()
    const command = buildCommandLine(process.execPath, [observedWindowsBootstrapPath(), nonce,
      new URL('../src/native-worker.ts', import.meta.url).href, import.meta.resolve('tsx/esm/api'),
      join(repository, 'tsconfig.base.json'), join(h.root, 'temporary')])
    const native = await spawn({ ...h.request, command }), errors = capture(native.standardError)
    const input = native.standardInput, output = native.standardOutput
    let job: ObservedWindowsJob | undefined, release: (() => void) | undefined
    const stop = () => stopNativeRange(job, release)
    try {
      if (input === null || output === null) throw new Error('Native transport is missing')
      const identity = await readNativeBootstrapIdentity(output, nonce, native.id, AbortSignal.timeout(10_000))
      job = attachObservedWindowsJob(identity)
      release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, stop)
      input.write(Uint8Array.of(1))
      await writeNativeFrame(input, { tag: NATIVE_FRAME.launch, data: Buffer.from(JSON.stringify({
        argv: [process.execPath, '-e', `
const fs=require('node:fs'),root=${JSON.stringify(h.root)};
fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'native-target-'));
try { fs.writeFileSync(root+'/work/production/data.txt','wrong'); process.exit(99); } catch(error) { if(error.code!=='EPERM') throw error; }
fs.writeFileSync(root+'/work/native-output.txt','confined');
process.stdout.write(Buffer.alloc(192*1024,97),()=>{process.stderr.write('separate stderr');process.exitCode=23});`],
        cwd: join(h.root, 'work'), env: h.request.environment, stdin: 'ignore', control: false, graceMs: 1000,
      })) })
      let accepted = false, rangeExited = false, result: unknown
      const stdout: Buffer[] = [], stderr: Buffer[] = [], closed = new Set<number>()
      const frames = readNativeFrames(output)
      while (true) {
        const item = await frames.next()
        if (item.done) break
        const frame = item.value
        if (frame.tag === NATIVE_FRAME.accepted) accepted = true
        if (frame.tag === NATIVE_FRAME.rangeExited) rangeExited = true
        if (frame.tag === NATIVE_FRAME.stdout) stdout.push(Buffer.from(frame.data))
        if (frame.tag === NATIVE_FRAME.stderr) stderr.push(Buffer.from(frame.data))
        if (frame.tag === NATIVE_FRAME.streamClosed) closed.add(Buffer.from(frame.data).readUInt8(0))
        if (frame.tag === NATIVE_FRAME.exited) result = JSON.parse(Buffer.from(frame.data).toString())
        if (frame.tag === NATIVE_FRAME.failed) throw new Error(Buffer.from(frame.data).toString())
      }
      expect(accepted).toBe(true)
      expect(rangeExited).toBe(true)
      expect(result).toEqual({ exitCode: 23, signal: null })
      expect(Buffer.concat(stdout)).toEqual(Buffer.alloc(192 * 1024, 97))
      expect(Buffer.concat(stderr).toString()).toBe('separate stderr')
      expect(await job.waitForExit(10, AbortSignal.timeout(30_000))).toBe(true)
      expect(await readFile(join(h.root, 'work', 'production', 'data.txt'), 'utf8')).toBe('production-preserve')
      expect(await readFile(join(h.root, 'work', 'native-output.txt'), 'utf8')).toBe('confined')
      const outcome = await native.wait()
      expect(outcome).toEqual({ exitCode: 0, timedOut: false })
      release()
      expect(await errors).toBe('')
    } finally {
      try { native.kill(); await native.wait(); if (job !== undefined) { await stop(); job.close() } }
      finally { native.dispose() }
    }
  })

  it('retains the policy until independently owned Job accounting confirms all members exited', async () => {
    const repository = fileURLToPath(new URL('../../../..', import.meta.url))
    const h = await fixture('', [repository]), nonce = randomUUID()
    const bootstrap = fileURLToPath(new URL('../../../subprocess/win32-process/tests/fixtures/observed-job.mjs', import.meta.url))
    const child = await spawn({ ...h.request, command: buildCommandLine(process.execPath, [bootstrap, nonce]) })
    const input = child.standardInput, stdout = child.standardOutput, errors = capture(child.standardError)
    let job: ObservedWindowsJob | undefined, release: (() => void) | undefined
    const stop = async () => {
      if (job === undefined) throw new Error('The trusted startup barrier has not been attached')
      job.terminate(1)
      expect(await job.waitForExit(10, AbortSignal.timeout(30_000))).toBe(true)
      release?.()
    }
    try {
      if (input === null || stdout === null) throw new Error('Native startup streams are missing')
      const lines = createInterface({ input: stdout }), output = lines[Symbol.asyncIterator]()
      try {
        const first = await output.next()
        if (first.done) throw new Error(`Native bootstrap ended before readiness: ${await errors}`)
        const identity = z.object({ nonce: z.literal(nonce), pid: z.literal(child.id), creationTime: z.string().regex(/^\d+$/) })
          .strict().parse(JSON.parse(first.value))
        job = attachObservedWindowsJob({ pid: identity.pid, creationTime: BigInt(identity.creationTime) })
        release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, stop)
        expect(job.isEmpty()).toBe(false)
        input.write('start\n')
        expect((await output.next()).value).toMatch(/^\{"child":\d+\}$/)
        const changed = await h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, h.files.revision)
        expect(changed.revision).toBe(h.files.revision + 1)
        expect(job.isEmpty()).toBe(true)
        expect((await child.wait()).timedOut).toBe(false)
        expect(await errors).toBe('')
      } finally { lines.close() }
    } finally {
      try {
        child.kill(); await child.wait()
        if (job !== undefined) { await stop(); job.close() }
      } finally { child.dispose() }
    }
  })

  it('enforces generated full, readonly, owner and hard-link restrictions while allowing ordinary work', async () => {
    const h = await fixture(`
const fs=require('node:fs'); const result={};
for(const [name,path] of Object.entries({owner:root+'/owner.txt',production:root+'/work/production/data.txt',alias:root+'/work/production-link.txt',audit:root+'/work/audit/data.txt'})) {
  try { result[name]=fs.readFileSync(path,'utf8'); } catch(error) { result[name]=error.code; }
}
for(const [name,path] of Object.entries({work:root+'/work/output.txt',productionWrite:root+'/work/production/data.txt',auditWrite:root+'/work/audit/data.txt',auditAliasWrite:root+'/work/audit-link.txt',futureOwner:root+'/rules.sqlite-wal'})) {
  try { fs.writeFileSync(path,'changed'); result[name]='written'; } catch(error) { result[name]=error.code; }
}
console.log(JSON.stringify(result));`)
    let child: MxcProcess | undefined
    const closed = Promise.withResolvers<boolean>()
    const release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, async () => { child?.kill(); await closed.promise })
    h.releases.push(release)
    try {
      child = await spawn(h.request)
      const output = capture(child.standardOutput), errors = capture(child.standardError)
      const result = await child.wait()
      expect(result.timedOut).toBe(false)
      expect(result.exitCode, await errors).toBe(0)
      expect(await errors).toBe('')
      expect(JSON.parse(await output)).toEqual({ owner: 'EPERM', production: 'EPERM', alias: 'EPERM', audit: 'audit-preserve',
        work: 'written', productionWrite: 'EPERM', auditWrite: 'EPERM', auditAliasWrite: 'EPERM', futureOwner: 'EPERM' })
      expect(await readFile(join(h.root, 'work', 'production', 'data.txt'), 'utf8')).toBe('production-preserve')
      expect(await readFile(join(h.root, 'work', 'audit', 'data.txt'), 'utf8')).toBe('audit-preserve')
      expect(await readFile(join(h.root, 'work', 'output.txt'), 'utf8')).toBe('changed')
    } finally {
      if (child !== undefined) { child.kill(); await child.wait(); child.dispose() }
      release(); closed.resolve(true)
    }
  })

  it('commits new rules only after a real command and its detached descendant have stopped', async () => {
    const h = await fixture(`
const fs=require('node:fs');
if(process.argv[2]==='child') { console.log('ready'); setInterval(()=>fs.writeFileSync(root+'/work/heartbeat.txt','running'),25); }
else {
 const child=require('node:child_process').spawn(process.execPath,[__filename,'child'],{stdio:['ignore','pipe','ignore'],windowsHide:true,detached:true});
 child.stdout.once('data',()=>console.log(JSON.stringify({child:child.pid})));
 setInterval(()=>{},1000);
}`)
    let child: MxcProcess | undefined, ended = false
    const closed = Promise.withResolvers<boolean>()
    const release = h.ctx.targetProtection.retainNativeExecution(h.files.revision, async () => {
      if (!ended) child?.kill()
      await closed.promise
    })
    h.releases.push(release)
    let processHandle: NativePtr | null = null
    const api = extendWin32ProcessBindings(({ kernel32, bind }) => ({
      openProcess: bind(kernel32, 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']),
      terminateProcess: bind(kernel32, 'TerminateProcess', 'int', ['void *', 'uint32']),
    })) as ProcessObserver
    try {
      child = await spawn(h.request)
      const stdout = child.standardOutput, errors = capture(child.standardError)
      if (stdout === null) throw new Error('Native stdout is missing')
      const ready = await new Promise<number>((resolve, reject) => {
        let text = ''
        stdout.on('data', (chunk: Buffer) => {
          text += chunk.toString('utf8')
          if (!text.includes('\n')) return
          try {
            const value = z.object({ child: z.number().int().min(1).max(0xffff_ffff) }).strict().parse(JSON.parse(text.trim()))
            resolve(value.child)
          } catch (error) { reject(error instanceof Error ? error : new Error('Invalid native readiness result', { cause: error })) }
        })
        stdout.once('error', reject)
        stdout.once('end', () => { void errors.then((text) => { reject(new Error(`Native workload ended before readiness: ${text}`)) }, reject) })
      })
      // Hold the exact kernel process object before cancellation; PID reuse cannot change this observation or cleanup.
      processHandle = api.openProcess(0x00100001, 0, ready)
      if (isNullPtr(processHandle)) throw new Error('Could not retain the owned native descendant')
      const descendant = processHandle
      const completion = child.wait().then((result) => {
        expect(api.waitForSingleObject(descendant, 0)).toBe(0)
        ended = true; release(); closed.resolve(true)
        return result
      }).catch((error: unknown) => {
        closed.reject(error)
        throw error
      })
      void completion.catch(() => {}) // The configuration call observes the same failure through the native closure promise.
      const changed = await h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, h.files.revision)
      expect(changed.revision).toBe(h.files.revision + 1)
      expect(api.waitForSingleObject(processHandle, 0)).toBe(0)
      expect((await completion).timedOut).toBe(false)
      expect(await errors).toBe('')
    } finally {
      if (child !== undefined) { if (!ended) child.kill(); await child.wait(); child.dispose() }
      if (!isNullPtr(processHandle)) {
        if (api.waitForSingleObject(processHandle, 0) !== 0) {
          expect(api.terminateProcess(processHandle, 1)).toBe(1)
          expect(api.waitForSingleObject(processHandle, 5000)).toBe(0)
        }
        expect(api.closeHandle(processHandle)).toBe(1)
      }
      release(); closed.resolve(true)
    }
  })
})
