/** Provider ownership and preparation use real policy/files; native process creation is an isolated transport fixture. @module */
import { Context } from '@deepseek-ai/cordis'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { ManagedProcessLaunch } from '@deepseek-ai/dsh-subprocess-local/managed'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { bindManagedProcess } from '@deepseek-ai/dsh-subprocess-local/managed'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { PassThrough } from 'node:stream'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import NativeSubprocess, { type NativeSubprocessConfig } from '../src/subprocess-native.ts'
import TargetProtection from '../src/index.ts'
import type { TargetRuleId } from '../src/types.ts'
import { nativeBrokerConfigSchema } from '../src/native-broker-config.ts'
import { readNativeFrames, writeNativeFrame, NATIVE_FRAME } from '../src/native-protocol.ts'
import type { NativeHostExecution } from '../src/native-host.ts'
import { launchNativeBroker } from '../src/native-launch.ts'
import { createNativeTerminal } from '../src/native-terminal-host.ts'

vi.mock('../src/native-runtime.ts', () => ({ requireNativeRuntime: vi.fn() }))
vi.mock('../src/native-launch.ts', () => ({ launchNativeBroker: vi.fn() }))
vi.mock('../src/native-terminal-host.ts', () => ({ createNativeTerminal: vi.fn() }))
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn(actual.rm), mkdtemp: vi.fn(actual.mkdtemp) }
})
vi.mock('@deepseek-ai/dsh-subprocess-local/managed', async (original) => {
  const actual = await original<typeof import('@deepseek-ai/dsh-subprocess-local/managed')>()
  return { ...actual, bindManagedProcess: vi.fn(actual.bindManagedProcess) }
})
const captured = vi.hoisted(() => ({ executions: [] as NativeHostExecution[] }))
vi.mock('../src/native-host.ts', async (original) => {
  const actual = await original<typeof import('../src/native-host.ts')>()
  return { ...actual, createNativeHostExecution(...args: Parameters<typeof actual.createNativeHostExecution>) {
    const execution = actual.createNativeHostExecution(...args)
    captured.executions.push(execution)
    return execution
  } }
})

beforeEach(() => {
  captured.executions = []; vi.mocked(launchNativeBroker).mockReset()
  vi.mocked(bindManagedProcess).mockReset(); vi.mocked(rm).mockReset(); vi.mocked(mkdtemp).mockReset()
  vi.mocked(createNativeTerminal).mockReset()
  vi.stubEnv('DSH_NATIVE_PROXY', undefined)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

function broker() {
  const input = new PassThrough(), output = new PassThrough(), diagnostic = new PassThrough()
  const result = Promise.withResolvers<SubprocessOutcome>(), closed = Promise.withResolvers<undefined>()
  const ready = Promise.withResolvers<Record<string, string>>()
  let stopped = false, control = false
  const config = Promise.withResolvers<z.infer<typeof nativeBrokerConfigSchema>>()
  const close = (exitCode = 1) => {
    if (stopped) return
    stopped = true; input.destroy(); output.end(); diagnostic.end()
    result.resolve({ exitCode, signal: null }); closed.resolve(undefined)
  }
  const carrier: ManagedProcessLaunch = { stdin: input, stdout: output, stderr: diagnostic, direct: result.promise,
    owner: { signal: () => { close() }, waitForExit: () => closed.promise, terminateForHostExit: () => { close() } } }
  const reading = (async () => {
    for await (const frame of readNativeFrames(input)) {
      if (frame.tag === NATIVE_FRAME.configure) {
        config.resolve(nativeBrokerConfigSchema.parse(JSON.parse(Buffer.from(frame.data).toString())))
      }
      if (frame.tag === NATIVE_FRAME.launch) {
        const request = z.object({ env: z.record(z.string(), z.string()), control: z.boolean() })
          .parse(JSON.parse(Buffer.from(frame.data).toString()))
        control = request.control
        await writeNativeFrame(output, { tag: NATIVE_FRAME.accepted, data: Buffer.alloc(0) })
        ready.resolve(request.env)
      }
    }
  })()
  void reading.catch(() => {})
  return { carrier, ready: ready.promise, config: config.promise, close,
    async finish() {
      await writeNativeFrame(output, { tag: NATIVE_FRAME.stdout, data: Buffer.from('owned output') })
      for (const tag of [NATIVE_FRAME.stdout, NATIVE_FRAME.stderr, ...control ? [NATIVE_FRAME.controlOutput] : []]) {
        await writeNativeFrame(output, { tag: NATIVE_FRAME.streamClosed, data: Uint8Array.of(tag) })
      }
      await writeNativeFrame(output, { tag: NATIVE_FRAME.exited, data: Buffer.from('{"exitCode":0,"signal":null}') })
      await writeNativeFrame(output, { tag: NATIVE_FRAME.rangeExited, data: Buffer.alloc(0) })
      close(0)
    },
    async dispose() { close(); await reading.catch(() => {}); output.destroy(); diagnostic.destroy() },
  }
}

async function fixture(change: Partial<NativeSubprocessConfig> = {}, mount = true, audit = false) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-service-')), ctx = new Context()
  const work = join(root, 'work'), privateRoot = join(root, 'private')
  const brokers: ReturnType<typeof broker>[] = [], exits = new Set(process.listeners('exit'))
  const logs: unknown[] = []
  ctx.logger.exporter({ export(message) {
    if (message.type === 'error') { const values: unknown[] = message.args; logs.push(...values) }
  } })
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally {
      await Promise.all(brokers.map(value => value.dispose()))
      for (const listener of process.listeners('exit')) if (!exits.has(listener)) process.off('exit', listener)
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })
  await mkdir(work)
  if (audit) {
    await mountAgentLoopTestDependencies(ctx)
    await mountAgentLoopTestHarness(ctx)
  }
  await ctx.plugin(Credentials, { path: join(root, 'credentials.yml'), dshHome: root, watch: false })
  await ctx.plugin(TargetProtection, { path: join(root, 'rules.sqlite'), hostsFile: '',
    ...audit ? { auditPath: join(root, 'audit.sqlite') } : {} })
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 1)
  vi.mocked(launchNativeBroker).mockImplementation(() => { const value = broker(); brokers.push(value); return value.carrier })
  const config: NativeSubprocessConfig = { readonlyPaths: [dirname(process.execPath)], readwritePaths: [work],
    temporaryRoot: privateRoot, network: 'disabled', maxProcesses: 1, ...change }
  const fiber = mount ? await ctx.plugin(NativeSubprocess, config) : undefined
  const spec = (): SubprocessSpawnSpec => ({ argv: [process.execPath, '-e', ''], cwd: work,
    stdio: { stdin: 'ignore', stdout: { maxBytes: 64 }, stderr: { maxBytes: 64 } }, graceMs: 100 })
  const started = async () => {
    await vi.waitFor(() => { expect(brokers.length).toBeGreaterThan(0) })
    const value = brokers.at(-1)
    if (value === undefined) throw new Error('Native fixture broker missing')
    await value.ready
    return value
  }
  return { ctx, root, work, privateRoot, brokers, exits, config, fiber, spec, started, logs }
}

it('resolves private paths and the scrubbed environment before starting the broker', async () => {
  const h = await fixture(), handle = h.ctx.subprocess.spawn({ ...h.spec(), env: { EXPLICIT_TOKEN: 'selected', HTTP_PROXY: 'http://wrong.invalid:80' } })
  const process = await h.started(), environment = await process.ready, config = await process.config
  expect(environment.EXPLICIT_TOKEN).toBe('selected')
  expect(environment.HTTP_PROXY).toBeUndefined()
  expect(environment.HOME).toBe(environment.TEMP)
  expect(config.proxyUrl).toBeNull()
  expect(config.files.readwritePaths).toContain(environment.TEMP)
  await process.finish(); await handle.done; await handle.waitForExit()
  expect(await readdir(h.privateRoot)).toEqual([])
  expect(handle.collected.stdout?.readFrom(0).text).toBe('owned output')
})

it('captures the scoped command owner before native preparation and ignores environment identity', async () => {
  const h = await fixture({ network: 'gateway' }, true, true)
  const owner = await h.ctx.agents.create({ sessionId: SessionId('native-command-owner') })
  const other = await h.ctx.agents.create({ sessionId: SessionId('unrelated-command-initiator') })
  const target = createServer((_request, response) => { response.end('native owner response') })
  onTestFinished(async () => {
    target.closeAllConnections()
    if (target.listening) await new Promise<void>((accept) => { target.close(() => { accept() }) })
  })
  await new Promise<void>((accept) => { target.listen(0, '127.0.0.1', accept) })
  const port = (target.address() as AddressInfo).port
  const before = await h.ctx.targetProtection.snapshot()
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{
    id: '5e90f895-6fb0-4da1-8f7e-47b644892284' as TargetRuleId, name: 'owned native target', enabled: true,
    kind: 'server', environment: 'test', protection: 'full', match: 'host', address: '127.0.0.1', port,
  }] }, before.revision)
  const run = h.ctx.targetProtection.bindAuditSession(other.agent.id)
  const subprocess = owner.agent.ctx.get('subprocess')
  if (subprocess === undefined) throw new Error('Missing scoped native provider')
  await run(() => subprocess.resolveExecutable(process.execPath))
  const handle = await run(async () => subprocess.spawn({ ...h.spec(),
    env: { DSH_SESSION_ID: other.agent.id } }))
  const processFixture = await h.started(), environment = await processFixture.ready
  const url = `http://127.0.0.1:${port}/`
  await new Promise<void>((accept, reject) => {
    const call = request(environment.HTTP_PROXY!, { path: url, headers: { host: `127.0.0.1:${port}` } }, (response) => {
      response.resume()
      response.on('error', reject)
      response.once('end', () => { expect(response.statusCode).toBe(200); accept() })
    })
    call.on('error', reject)
    call.end()
  })
  const records = owner.agent.session.snapshotEvents().filter(event => event.type === 'target/admission')
  expect(records.some(event => event.data.operation === 'connection')).toBe(true)
  expect(records.every(event => event.data.source?.sessionId === owner.agent.id)).toBe(true)
  expect(other.agent.session.snapshotEvents().filter(event => event.type === 'target/admission')).toEqual([])
  await processFixture.finish()
  await handle.done
  await handle.waitForExit()
})

it('keeps HTTPS private keys in the Host and supplies only a temporary CA to native targets', async () => {
  const h = await fixture({ network: 'gateway', httpsInspection: true })
  const handle = h.ctx.subprocess.spawn({ ...h.spec(), env: { NODE_EXTRA_CA_CERTS: 'wrong.pem', CURL_CA_BUNDLE: 'wrong.pem' } })
  const process = await h.started(), environment = await process.ready
  const certificate = await readFile(environment.NODE_EXTRA_CA_CERTS!, 'utf8')
  expect(certificate).toContain('BEGIN CERTIFICATE')
  expect(certificate).not.toContain('PRIVATE KEY')
  expect(environment.CURL_CA_BUNDLE).toBe(environment.NODE_EXTRA_CA_CERTS)
  expect(environment.REQUESTS_CA_BUNDLE).toBe(environment.NODE_EXTRA_CA_CERTS)
  expect(environment.SSL_CERT_FILE).toBe(environment.NODE_EXTRA_CA_CERTS)
  expect(await readdir(environment.HOME!)).toEqual(['https-ca.pem'])
  await process.finish(); await handle.done; await handle.waitForExit()
  expect(await readdir(h.privateRoot)).toEqual([])
})

it('refuses HTTPS inspection without an execution gateway', async () => {
  const h = await fixture({}, false)
  expect(() => new NativeSubprocess(h.ctx, { ...h.config, httpsInspection: true })).toThrow('requires the native gateway')
})

it('enforces capacity until range closure and admits a later command', async () => {
  const h = await fixture(), first = h.ctx.subprocess.spawn(h.spec())
  expect(() => h.ctx.subprocess.spawn(h.spec())).toThrow(expect.objectContaining({ code: 'TARGET_NATIVE_CAPACITY' }))
  const process = await h.started()
  await process.finish(); await first.done; await first.waitForExit()
  const allocation: { handle?: SubprocessHandle } = {}
  await vi.waitFor(() => { allocation.handle = h.ctx.subprocess.spawn(h.spec()) })
  const second = allocation.handle
  if (second === undefined) throw new Error('Native capacity did not return')
  second.terminate(); await second.done.catch(() => undefined); await second.waitForExit()
})

it('joins active commands and caller control streams when the provider unloads', async () => {
  const h = await fixture(), provider = h.ctx.subprocess
  const handle = provider.spawn({ ...h.spec(), stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', control: 'pipe' } })
  await h.started()
  await h.fiber?.dispose()
  await handle.done.catch(() => undefined)
  expect(await handle.waitForExit()).toBe(true)
  expect(handle.control?.destroyed).toBe(true)
  expect(h.ctx.get('subprocess')).toBeUndefined()
  expect(() => provider.spawn(h.spec())).toThrow(expect.objectContaining({ code: 'TARGET_NATIVE_UNAVAILABLE' }))
  expect(process.listeners('exit').filter(listener => !h.exits.has(listener))).toEqual([])
})

it('rejects protected executable metadata before the local PATH lookup', async () => {
  const h = await fixture(), executable = join(h.work, 'protected.exe')
  await writeFile(executable, 'owned marker')
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{
    id: '4df071d9-85dd-40a2-adc0-016e30534528' as TargetRuleId, name: 'protected', enabled: true, kind: 'server',
    environment: 'production', protection: 'full', match: 'path', address: executable,
  }] }, 2)
  await expect(h.ctx.subprocess.resolveExecutable(executable)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(await h.ctx.subprocess.resolveExecutable(process.execPath)).toBe(process.execPath)
  expect(await readFile(executable, 'utf8')).toBe('owned marker')
})

it('releases preparation resources if native startup fails', async () => {
  const h = await fixture(), failure = new Error('native launcher failed')
  vi.mocked(launchNativeBroker).mockImplementationOnce(() => { throw failure })
  const handle = h.ctx.subprocess.spawn(h.spec())
  await expect(handle.done).rejects.toBe(failure)
  expect(await handle.waitForExit()).toBe(true)
  expect(await readdir(h.privateRoot)).toEqual([])
  const snapshot = await h.ctx.targetProtection.snapshot()
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, snapshot.revision)
})

it('binds a private gateway and releases it with the native range', async () => {
  const h = await fixture({ network: 'gateway' }), handle = h.ctx.subprocess.spawn(h.spec())
  const process = await h.started(), environment = await process.ready
  expect(environment.HTTP_PROXY).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u)
  expect(environment.HTTPS_PROXY).toBe(environment.HTTP_PROXY)
  expect((await process.config).proxyUrl).toBe(environment.HTTP_PROXY)
  await process.finish(); await handle.done; await handle.waitForExit()
  expect(await readdir(h.privateRoot)).toEqual([])
})

it('rejects an unavailable proxy credential during activation', async () => {
  const h = await fixture({ network: 'gateway', proxy: { protocol: 'http', host: 'proxy.invalid', port: 8888,
    username: 'owner', passwordRef: 'DSH_NATIVE_PROXY' } }, false)
  await expect(h.ctx.plugin(NativeSubprocess, h.config)).rejects.toMatchObject({ code: 'TARGET_NATIVE_PROXY_CREDENTIAL' })
  expect(h.brokers).toEqual([])
})

it('keeps stored proxy credentials out of the command environment', async () => {
  const h = await fixture({ network: 'gateway', proxy: { protocol: 'https', host: 'proxy.invalid', port: 8888,
    username: 'owner', passwordRef: 'DSH_NATIVE_PROXY' } }, false)
  await h.ctx.credentials.set(credentialRef('DSH_NATIVE_PROXY'), 'private-password')
  await h.ctx.plugin(NativeSubprocess, h.config)
  const handle = h.ctx.subprocess.spawn(h.spec()), process = await h.started()
  expect(JSON.stringify(await process.ready)).not.toContain('private-password')
  await process.finish(); await handle.done; await handle.waitForExit()
  await h.ctx.credentials.unset(credentialRef('DSH_NATIVE_PROXY'))
  const revoked = h.ctx.subprocess.spawn(h.spec())
  await expect(revoked.done).rejects.toMatchObject({ code: 'TARGET_NATIVE_PROXY_CREDENTIAL' })
  expect(await revoked.waitForExit()).toBe(true)
  expect(h.brokers).toHaveLength(1)
})

it.each([
  { temporaryRoot: 'relative' }, { readonlyPaths: ['relative'] },
  { network: 'disabled' as const, proxy: { protocol: 'http' as const, host: 'proxy.invalid', port: 80 } },
  { network: 'gateway' as const, proxy: { protocol: 'http' as const, host: 'proxy.invalid/path', port: 80 } },
  { network: 'gateway' as const, proxy: { protocol: 'http' as const, host: 'proxy.invalid', port: 80, username: 'owner' } },
  { network: 'gateway' as const, proxy: { protocol: 'http' as const, host: 'proxy.invalid', port: 80, passwordRef: 'DSH_NATIVE_PROXY' } },
])('rejects unusable owner configuration %# before executing commands', async (change) => {
  const h = await fixture({}, false)
  await expect(h.ctx.plugin(NativeSubprocess, { ...h.config, ...change })).rejects.toBeDefined()
  expect(h.brokers).toEqual([])
})

it('does not accept a temporary root that commands can access through a deployment grant', async () => {
  const h = await fixture({}, false)
  await expect(h.ctx.plugin(NativeSubprocess, { ...h.config, temporaryRoot: join(h.work, 'private') }))
    .rejects.toThrow('outside all deployment file grants')
})

it('rejects a file supplied as a write directory before service activation', async () => {
  const h = await fixture({}, false), file = join(h.work, 'not-directory')
  await writeFile(file, 'preserve')
  await expect(h.ctx.plugin(NativeSubprocess, { ...h.config, readwritePaths: [file] })).rejects.toThrow('write grants')
  expect(await readFile(file, 'utf8')).toBe('preserve')
})

it('allocates terminals through the protected helper spawn path', async () => {
  const h = await fixture()
  vi.mocked(createNativeTerminal).mockImplementationOnce(async (_spec, spawn) => {
    const handle = spawn(h.spec())
    handle.terminate(); await handle.done.catch(() => undefined); await handle.waitForExit()
    throw new Error('owned terminal fixture')
  })
  await expect(h.ctx.subprocess.spawnTerminal({ argv: [process.execPath], cwd: h.work,
    rows: 24, cols: 80, graceMs: 100, terminalType: 'xterm' })).rejects.toThrow('owned terminal fixture')
  expect(createNativeTerminal).toHaveBeenCalledOnce()
  expect(h.brokers).toEqual([])
})

it('preserves asynchronous terminal cancellation and executable lookup cancellation', async () => {
  const h = await fixture(), signal = AbortSignal.abort(null)
  await expect(h.ctx.subprocess.spawnTerminal({ argv: [process.execPath], cwd: h.work,
    rows: 24, cols: 80, graceMs: 100, terminalType: 'xterm', signal })).rejects.toBeNull()
  expect(await h.ctx.subprocess.resolveExecutable(process.execPath, undefined, new AbortController().signal)).toBe(process.execPath)
})

it('rejects executable lookup when its policy changes after authorization', async () => {
  const h = await fixture(), check = h.ctx.targetProtection.checkLocalFile.bind(h.ctx.targetProtection)
  vi.spyOn(h.ctx.targetProtection, 'checkLocalFile').mockImplementationOnce(async (...args) => {
    const result = await check(...args)
    await h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, 2)
    return result
  })
  await expect(h.ctx.subprocess.resolveExecutable(process.execPath)).rejects.toMatchObject({ code: 'conflict' })
})

it('accepts a credential-free IPv6 upstream without forwarding an ambient proxy', async () => {
  const h = await fixture({ network: 'gateway', proxy: { protocol: 'http', host: '::1', port: 8888 } })
  const handle = h.ctx.subprocess.spawn(h.spec()), process = await h.started()
  expect((await process.ready).HTTP_PROXY).toMatch(/^http:\/\/127\.0\.0\.1:/u)
  await process.finish(); await handle.done; await handle.waitForExit()
})

it('rejects a directory alias that resolves the private root inside a grant', async () => {
  const h = await fixture({}, false), alias = join(h.root, 'alias')
  await symlink(h.root, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(h.ctx.plugin(NativeSubprocess, { ...h.config, readonlyPaths: [alias] }))
    .rejects.toThrow('resolves inside a deployment grant')
})

it('stops a running execution before the owner changes its rule revision', async () => {
  const h = await fixture(), handle = h.ctx.subprocess.spawn(h.spec())
  await h.started()
  await h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, 2)
  expect(await handle.waitForExit()).toBe(true)
  await handle.done.catch(() => undefined)
})

it('attempts every owned synchronous exit stop even if one native stop throws', async () => {
  const h = await fixture({ maxProcesses: 2 })
  const first = h.ctx.subprocess.spawn(h.spec()), second = h.ctx.subprocess.spawn(h.spec())
  await vi.waitFor(() => { expect(h.brokers).toHaveLength(2) })
  await Promise.all(h.brokers.map(value => value.ready))
  const execution = captured.executions[0]
  if (execution === undefined) throw new Error('Expected first execution')
  execution.launch.owner.terminateForHostExit = () => { throw new Error('first stop failed') }
  for (const listener of process.listeners('exit')) if (!h.exits.has(listener)) listener.call(process, 0)
  expect(await second.waitForExit()).toBe(true)
  await second.done.catch(() => undefined)
  first.terminate(); await first.done.catch(() => undefined); await first.waitForExit()
})

it('closes a caller-owned control channel retained after native completion', async () => {
  const h = await fixture(), handle = h.ctx.subprocess.spawn({ ...h.spec(),
    stdio: { stdin: 'ignore', stdout: { maxBytes: 64 }, stderr: { maxBytes: 64 }, control: 'pipe' } })
  const process = await h.started()
  handle.control?.resume()
  await process.finish(); await handle.done; await handle.waitForExit()
  const allocation: { handle?: SubprocessHandle } = {}
  await vi.waitFor(() => { allocation.handle = h.ctx.subprocess.spawn(h.spec()) })
  const second = allocation.handle
  second?.terminate(); await second?.done.catch(() => undefined); await second?.waitForExit()
  await h.fiber?.dispose()
  expect(handle.control?.destroyed).toBe(true)
})

it('cancels a prepared execution if output binding fails', async () => {
  const h = await fixture(), failure = new Error('binding failed')
  vi.mocked(bindManagedProcess).mockImplementationOnce(() => { throw failure })
  expect(() => h.ctx.subprocess.spawn(h.spec())).toThrow(failure)
  await Promise.all(captured.executions.map(execution => execution.dispose()))
  expect(h.brokers).toEqual([])
  expect(await readdir(h.privateRoot)).toEqual([])
})

it('reports cleanup failure and refuses new work instead of losing the retained execution', async () => {
  const h = await fixture(), failure = new Error('private directory cleanup failed'), handle = h.ctx.subprocess.spawn(h.spec())
  const process = await h.started()
  vi.mocked(rm).mockRejectedValueOnce(failure)
  await process.finish(); await handle.done
  await expect(handle.waitForExit()).rejects.toBe(failure)
  await vi.waitFor(() => {
    expect(() => h.ctx.subprocess.spawn(h.spec())).toThrow(expect.objectContaining({ code: 'TARGET_NATIVE_SHUTDOWN_UNCONFIRMED' }))
  })
  const recorded = h.logs.filter(value => value === failure).length
  await h.fiber?.dispose()
  expect(h.logs.filter(value => value === failure).length).toBeGreaterThan(recorded)
})

it('does not wait again for a caller-closed control stream', async () => {
  const h = await fixture(), handle = h.ctx.subprocess.spawn({ ...h.spec(),
    stdio: { stdin: 'ignore', stdout: { maxBytes: 64 }, stderr: { maxBytes: 64 }, control: 'pipe' } })
  const process = await h.started(), control = handle.control
  if (control === undefined) throw new Error('Expected control stream')
  control.resume()
  await process.finish(); await handle.done; await handle.waitForExit()
  control.removeAllListeners('close')
  await new Promise<void>((resolve) => { control.once('close', () => { resolve() }); control.destroy() })
  await h.fiber?.dispose()
  expect(control.closed).toBe(true)
})

it('refuses cleanup outside its private root and still releases the completed execution revision', async () => {
  const h = await fixture(), marker = join(h.work, 'preserve.txt')
  await writeFile(marker, 'preserved')
  vi.mocked(mkdtemp).mockResolvedValueOnce(h.work)
  const handle = h.ctx.subprocess.spawn(h.spec()), process = await h.started()
  await process.finish(); await handle.done
  await expect(handle.waitForExit()).rejects.toThrow('escaped its owner root')
  expect(await readFile(marker, 'utf8')).toBe('preserved')
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 2)
})

it('reports cleanup failure after an output-binding failure without leaving unobserved work', async () => {
  const h = await fixture(), binding = new Error('binding failed'), cleanup = new Error('binding cleanup failed')
  vi.mocked(bindManagedProcess).mockImplementationOnce(() => {
    const execution = captured.executions.at(-1)
    if (execution === undefined) throw new Error('Expected execution')
    const dispose = execution.dispose.bind(execution)
    execution.dispose = async () => { await dispose(); throw cleanup }
    throw binding
  })
  expect(() => h.ctx.subprocess.spawn(h.spec())).toThrow(binding)
  await vi.waitFor(() => { expect(h.logs).toContain(cleanup) })
  expect(h.brokers).toEqual([])
})
