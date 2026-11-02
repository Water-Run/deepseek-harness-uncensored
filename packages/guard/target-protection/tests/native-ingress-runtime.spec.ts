/** Explicit native-helper acceptance; build Rust first and provide DSH_NATIVE_INGRESS_HELPER. @module */
import { spawn as spawnNative, probe } from '@microsoft/mxc-sdk/v1'
import { attachObservedWindowsJob, buildCommandLine, currentWindowsProcessIdentity,
  extendWin32ProcessBindings, observedWindowsBootstrapPath, type ObservedWindowsJob,
  type CurrentTokenProcessBindings, type NativePtr } from '@deepseek-ai/dsh-win32-process'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import { readNativeBootstrapIdentity } from '../src/native-bootstrap.ts'
import { startNativeIngress } from '../src/native-ingress.ts'

const helper = process.env.DSH_NATIVE_INGRESS_HELPER
const supported = process.platform === 'win32' && helper !== undefined && probe().tier === 'base-container'
const elevated = process.env.DSH_NATIVE_INGRESS_TEST_ELEVATED === '1'

describe.skipIf(!supported)('private native ingress helper', () => {
  it('does not increase a borrowed query-only Job handle and leaves an unadmitted target alive', async () => {
    if (helper === undefined) throw new Error('Helper path required')
    const root = await mkdtemp(join(tmpdir(), 'dshu-ingress-access-')), nonce = randomUUID()
    const target = spawn(process.execPath, [observedWindowsBootstrapPath(), nonce,
      pathToFileURL(join(root, 'must-not-load.mjs')).href, '', '', root], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive,
        TEMP: root, TMP: root } })
    const targetDone = new Promise<void>((resolve) => { target.once('close', () => { resolve() }) })
    target.stderr.resume()
    target.stdin.on('error', () => {})
    const owned: { job?: ObservedWindowsJob; duplicate?: NativePtr } = {}
    interface DuplicateBindings extends CurrentTokenProcessBindings {
      getCurrentProcess(): NativePtr
      duplicateHandle(source: NativePtr, handle: bigint, target: NativePtr, output: Buffer,
        access: number, inherit: number, flags: number): number
    }
    const api = extendWin32ProcessBindings(({ kernel32, bind }) => ({
      getCurrentProcess: bind(kernel32, 'GetCurrentProcess', 'void *', []),
      duplicateHandle: bind(kernel32, 'DuplicateHandle', 'int', ['void *', 'void *', 'void *', 'void *', 'uint32', 'int', 'uint32']),
    })) as DuplicateBindings
    onTestFinished(async () => {
      try {
        owned.job?.terminate(1); target.kill(); await targetDone
        if (owned.duplicate !== undefined) expect(api.closeHandle(owned.duplicate)).toBe(1)
        if (owned.job !== undefined) { expect(await owned.job.waitForExit(10, AbortSignal.timeout(10000))).toBe(true); owned.job.close() }
      } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
    })
    if (target.pid === undefined) throw new Error('Target PID missing')
    const identity = await readNativeBootstrapIdentity(target.stdout, nonce, target.pid, AbortSignal.timeout(10000))
    const job = owned.job = attachObservedWindowsJob(identity), slot = Buffer.alloc(8), processHandle = api.getCurrentProcess()
    expect(api.duplicateHandle(processHandle, job.borrowHandle(), processHandle, slot, 4, 0, 0)).toBe(1)
    owned.duplicate = slot.readBigUInt64LE() as NativePtr
    const owner = currentWindowsProcessIdentity()
    const child = spawn(helper, ['--stdio', String(owner.pid), String(owner.creationTime), '5000', '10'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const done = new Promise<number | null>((resolve) => { child.once('close', resolve) })
    onTestFinished(async () => { child.kill(); await done })
    let output = ''
    child.stdout.on('data', (bytes: Buffer) => { output += bytes.toString() }); child.stderr.resume(); child.stdin.on('error', () => {})
    child.stdin.end(`${JSON.stringify({ sequence: 1, operation: 'install',
      admission: { target: { pid: identity.pid, created: String(identity.creationTime) }, job: String(owned.duplicate) } })}\n`)
    expect(await done).toBe(1)
    expect(JSON.parse(output)).toMatchObject({ ok: false, error: { code: 'job-access-insufficient' } })
    expect(job.isEmpty()).toBe(false)
  })

  it('authenticates inherited pipes and rejects a changed caller creation time', async () => {
    if (helper === undefined) throw new Error('Helper path required')
    const owner = currentWindowsProcessIdentity()
    const child = spawn(helper, ['--stdio', String(owner.pid), String(owner.creationTime + 1n), '5000', '10'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const done = new Promise<number | null>((resolve) => { child.once('close', resolve) })
    let error = ''
    child.stderr.on('data', (bytes: Buffer) => { error += bytes.toString() })
    child.stdin.on('error', () => {})
    child.stdout.resume()
    onTestFinished(async () => { child.kill(); await done })
    child.stdin.end()
    expect(await done).toBe(1)
    expect(error).toContain('identity-changed')
  })

  it.skipIf(elevated)('refuses unavailable WFP permission, stops the bootstrap and never dispatches target code', async () => {
    if (helper === undefined) throw new Error('Helper path required')
    const root = await mkdtemp(join(tmpdir(), 'dshu-ingress-runtime-'))
    const owned: { child?: Awaited<ReturnType<typeof spawnNative>>; job?: ObservedWindowsJob } = {}
    onTestFinished(async () => {
      try {
        owned.job?.terminate(1); owned.child?.kill()
        await owned.child?.wait()
        if (owned.job !== undefined && !await owned.job.waitForExit(10, AbortSignal.timeout(10000))) throw new Error('Native Job did not exit')
        owned.job?.close()
      } finally { owned.child?.dispose(); await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
    })
    const temporary = join(root, 'private'), marker = join(temporary, 'started'), worker = join(root, 'worker.mjs')
    await mkdir(temporary)
    await writeFile(worker, `import{writeFileSync}from'node:fs';export function runNativeWorker(){writeFileSync(${JSON.stringify(marker)},'started')}`)
    const repository = fileURLToPath(new URL('../../../..', import.meta.url)), nonce = randomUUID()
    const parents: string[] = []
    for (const grant of [root, repository, dirname(process.execPath)]) {
      for (let path = dirname(grant); ; path = dirname(path)) {
        if (!parents.includes(path)) parents.push(path)
        if (path === dirname(path)) break
      }
    }
    const child = owned.child = await spawnNative({
      command: buildCommandLine(process.execPath, [observedWindowsBootstrapPath(), nonce, pathToFileURL(worker).href, '', '', temporary]),
      workingDirectory: root, containment: { type: 'processcontainer', config: { filesystem: { enumeratePaths: parents } } },
      filesystem: { readonlyPaths: [repository, root, dirname(process.execPath)], readwritePaths: [temporary] },
      network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
      ui: { disable: false, clipboard: 'none', allowInputInjection: false }, timeoutMs: 30000,
      environment: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive,
        TEMP: temporary, TMP: temporary, LOCALAPPDATA: temporary, USERPROFILE: temporary },
    }, { telemetry: { enabled: false } })
    const input = child.standardInput, output = child.standardOutput, errors = child.standardError
    if (input === null || output === null || errors === null) throw new Error('Native streams missing')
    let diagnostic = ''
    errors.on('data', (bytes: Buffer) => { diagnostic += bytes.toString() })
    const identity = await readNativeBootstrapIdentity(output, nonce, child.id, AbortSignal.timeout(10000))
      .catch((error: unknown) => { throw new Error(diagnostic, { cause: error }) })
    const job = owned.job = attachObservedWindowsJob(identity)
    const failure: unknown = await startNativeIngress({ executable: helper, requestTimeoutMs: 10000, shutdownTimeoutMs: 10000,
      pollIntervalMs: 10, diagnosticMaxBytes: 4096 }, job, identity, new AbortController().signal).catch((error: unknown) => error)
    expect(failure).toMatchObject({ errors: [
      { code: 'TARGET_INGRESS_REFUSED', cause: { code: 'permission-required', win32: 5 } }, expect.any(Error),
    ] })
    expect(await job.waitForExit(10, AbortSignal.timeout(10000))).toBe(true)
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
