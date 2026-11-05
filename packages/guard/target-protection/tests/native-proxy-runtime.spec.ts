/** Real contained commands and ConPTY share Security mode's configured upstream and redacted traffic list. */
import { Context } from '@deepseek-ai/cordis'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import * as ProxyHost from '@deepseek-ai/dsh-security-proxy-local'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { brandString } from '@deepseek-ai/dsh-brand'
import { probe } from '@microsoft/mxc-sdk/v1'
import { createServer, type Server } from 'node:http'
import { connect, createServer as tcpServer, type Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { describe, expect, it, onTestFinished } from 'vitest'
import TargetProtection from '../src/index.ts'
import NativeSubprocess from '../src/subprocess-native.ts'
import TargetPtcRuntime from '../src/ptc.ts'
import type { TargetRuleId } from '../src/types.ts'
import { COVERAGE_TEST_TIMEOUT_ENV, coverageTestTimeoutOptions } from '../../../../scripts/coverage-partitions.ts'

const supported = process.platform === 'win32' && probe().tier === 'base-container'
// The contained child has its own 45-second deadline; allocation and joined teardown also consume time.
const nativeTimeout = Math.max(60000, coverageTestTimeoutOptions(process.env[COVERAGE_TEST_TIMEOUT_ENV]).testTimeout ?? 0)

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'native-security-egress-')), ctx = new Context()
  const sockets = new Set<Duplex>(), servers: Array<ReturnType<typeof tcpServer> | Server> = []
  const own = (socket: Duplex) => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => socket.destroy())
  }
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally {
      await Promise.all([...sockets].map(socket => new Promise<void>((resolve) => {
        if (socket.closed) resolve()
        else { socket.once('close', () => { resolve() }); socket.destroy() }
      })))
      try {
        await Promise.all(servers.filter(server => server.listening).map(server => new Promise<void>((resolve, reject) => {
          server.close((error) => { if (error) reject(error); else resolve() })
        })))
      } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) }
    }
  }, nativeTimeout)
  const listen = async (server: ReturnType<typeof tcpServer> | Server) => {
    servers.push(server)
    server.on('connection', own)
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Fixture did not bind a TCP port')
    return address.port
  }
  let requests = 0
  const arrived = Promise.withResolvers<undefined>(), targetClosed = Promise.withResolvers<undefined>()
  const target = createServer((request, response) => {
    requests++; request.resume()
    request.once('end', () => {
      if (request.url === '/hold') {
        response.once('close', () => { targetClosed.resolve(undefined) })
        response.writeHead(200, { 'content-type': 'text/plain' }); response.write('owned transfer')
        arrived.resolve(undefined); return
      }
      response.writeHead(200, { 'content-type': 'application/json', connection: 'close', 'set-cookie': 'private-response' })
      response.end('{"token":"private-response","message":"owned"}')
    })
  })
  let productionRequests = 0
  const productionPort = await listen(createServer((_request, response) => { productionRequests++; response.end('production') }))
  const port = await listen(target), echo = await listen(tcpServer(socket => socket.on('data', bytes => socket.write(bytes))))
  const upstream = async () => {
    const seen: string[] = []
    const proxy = createServer((_request, response) => { response.writeHead(502); response.end() })
    proxy.on('connect', (request, downstream, head) => {
      const authority = new URL(`http://${request.url}`)
      seen.push(request.url ?? '')
      const remote: Socket = connect({ host: authority.hostname, port: Number(authority.port) })
      own(remote)
      downstream.once('close', () => remote.destroy()); remote.once('close', () => downstream.destroy())
      remote.once('connect', () => {
        downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length > 0) remote.write(head)
        downstream.pipe(remote); remote.pipe(downstream)
      })
    })
    return { port: await listen(proxy), seen }
  }
  const selected = await upstream(), fallback = await upstream()
  const work = join(root, 'work'), temporary = join(root, 'private')
  await mkdir(work)
  await mountAgentLoopTestDependencies(ctx); await mountAgentLoopTestHarness(ctx)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: work })
  await ctx.plugin(Credentials, { path: join(root, 'credentials.yml'), dshHome: root, watch: false })
  await ctx.plugin(TargetProtection, { path: join(root, 'rules.sqlite'), hostsFile: '' })
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [
    { id: brandString<TargetRuleId>('425b1356-35c6-42bb-9117-d9c40423b093'), name: 'owned test', enabled: true,
      kind: 'server', environment: 'test', protection: 'full', match: 'host', address: '127.0.0.1', port },
    { id: brandString<TargetRuleId>('8546b4bc-fe10-45ba-95a4-a9b09fa0e8a4'), name: 'production name', enabled: true,
      kind: 'server', environment: 'production', protection: 'full', match: 'host', address: 'production.test', port: productionPort },
  ] }, 1)
  await ctx.plugin(ProxyHost, { path: join(root, 'proxy.json'), testHost: '127.0.0.1', testPort: echo })
  await ctx.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: selected.port })
  await ctx.plugin(NativeSubprocess, {
    readonlyPaths: [fileURLToPath(new URL('../../../..', import.meta.url)), dirname(process.execPath)], readwritePaths: [work],
    temporaryRoot: temporary, network: 'gateway', proxy: { protocol: 'http', host: '127.0.0.1', port: fallback.port },
  })
  await ctx.plugin(TargetPtcRuntime)
  const owner = await ctx.agents.create({ sessionId: SessionId('native-proxy-owner') })
  owner.agent.session.append('agent-preset/selected', { agentPreset: 'security' })
  const subprocess = owner.agent.ctx.get('subprocess')
  if (subprocess === undefined) throw new Error('Native subprocess was not provided')
  const program = `const http=require('node:http');
function post(host,port){return new Promise((resolve,reject)=>{const request=http.request('http://'+host+':'+port+'/fixture',{
method:'POST',headers:{authorization:'Bearer private-request','content-type':'application/json'}},response=>{
response.resume();response.once('end',()=>resolve(response.statusCode));response.once('error',reject)});
request.once('error',reject);request.end('{"password":"private-request","message":"owned"}')})}
(async()=>{try{process.stdout.write(JSON.stringify([await post('127.0.0.1',${port}),await post('production.test',${productionPort})]))}
finally{http.globalAgent.destroy()}})().catch(error=>{console.error(error);process.exitCode=1});`
  return { ctx, owner: owner.agent, work, temporary, subprocess, program, port, selected, fallback, arrived: arrived.promise,
    targetClosed: targetClosed.promise, requests: () => requests, productionRequests: () => productionRequests }
}

describe.skipIf(!supported)('native Security proxy integration', () => {
  it('keeps concurrent Worker callbacks attributed to their own live Agents', async () => {
    const h = await fixture(), other = await h.ctx.agents.create({ sessionId: SessionId('native-proxy-second') })
    const entered: PromiseWithResolvers<void> = Promise.withResolvers()
    let callbacks = 0
    onTestFinished(() => { entered.resolve() })
    other.agent.session.append('agent-preset/selected', { agentPreset: 'security' })
    const run = (agent: Agent) => h.ctx.agents.withInitiator(agent, () => h.ctx.ptcRuntime.run(h.ctx.ptcRuntime.resolve({
      program: 'return await tools.command({});', cwd: h.work, signal: AbortSignal.timeout(45000),
      bindings: [{ global: 'tools', functions: { command: async () => {
        if (++callbacks === 2) entered.resolve()
        await entered.promise
        expect(h.ctx.targetProtection.currentExecutionAgent()).toBe(agent)
        const handle = h.ctx.subprocess.spawn({ argv: [process.execPath, '-e', h.program], cwd: h.work, graceMs: 1000,
          signal: AbortSignal.timeout(45000), stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } } })
        expect(await handle.done, handle.collected.stderr?.readFrom(0).text).toEqual({ exitCode: 0, signal: null })
        expect(await handle.waitForExit()).toBe(true)
        return handle.collected.stdout?.readFrom(0).text ?? ''
      } } }],
    })))
    expect(await Promise.all([run(h.owner), run(other.agent)])).toEqual([
      { logs: [], value: '[200,403]' }, { logs: [], value: '[200,403]' },
    ])
    for (const agent of [h.owner, other.agent]) {
      const flows = (await h.ctx.securityProxy.list({ sessionId: agent.id })).flows
      expect(flows).toHaveLength(2)
      expect(flows.every(flow => flow.sessionId === agent.id && flow.tool === 'subprocess')).toBe(true)
      expect(flows.some(flow => flow.status === 200)).toBe(true)
    }
    expect(h.requests()).toBe(2)
    expect(h.productionRequests()).toBe(0)
    expect(h.fallback.seen).toEqual([])
    expect(await readdir(h.temporary)).toEqual([])
  }, nativeTimeout)

  it.each(['command', 'terminal', 'worker'] as const)('captures real %s traffic through the selected upstream while production stays blocked', async (kind) => {
    const h = await fixture()
    if (kind === 'command') {
      const handle = h.subprocess.spawn({ argv: [process.execPath, '-e', h.program], cwd: h.work, graceMs: 1000,
        signal: AbortSignal.timeout(45000), stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } } })
      expect(await handle.done, handle.collected.stderr?.readFrom(0).text).toEqual({ exitCode: 0, signal: null })
      expect(await handle.waitForExit()).toBe(true)
      const details = await Promise.all((await h.ctx.securityProxy.list({})).flows.map(flow => h.ctx.securityProxy.detail(flow.id)))
      expect(handle.collected.stdout?.readFrom(0).text, JSON.stringify(details)).toBe('[200,403]')
    } else if (kind === 'worker') {
      const result = await h.ctx.agents.withInitiator(h.owner, () => h.ctx.ptcRuntime.run(h.ctx.ptcRuntime.resolve({
        program: 'return await tools.command({});', cwd: h.work, signal: AbortSignal.timeout(45000),
        bindings: [{ global: 'tools', functions: { command: async () => {
          const handle = h.ctx.subprocess.spawn({ argv: [process.execPath, '-e', h.program], cwd: h.work, graceMs: 1000,
            signal: AbortSignal.timeout(45000), stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } } })
          expect(await handle.done, handle.collected.stderr?.readFrom(0).text).toEqual({ exitCode: 0, signal: null })
          expect(await handle.waitForExit()).toBe(true)
          return handle.collected.stdout?.readFrom(0).text ?? ''
        } } }],
      })))
      expect(result).toEqual({ logs: [], value: '[200,403]' })
    } else {
      const terminal = await h.subprocess.spawnTerminal({ argv: [process.execPath, '-e', h.program], cwd: h.work,
        cols: 100, rows: 24, terminalType: 'xterm', graceMs: 1000, signal: AbortSignal.timeout(45000) })
      let output = ''; terminal.output.on('data', (bytes: Buffer) => { output += bytes.toString() })
      try { expect(await terminal.done, output).toEqual({ exitCode: 0, signal: null }); expect(output).toContain('[200,403]') }
      finally { await terminal.terminate() }
    }
    expect(h.requests()).toBe(1)
    expect(h.productionRequests()).toBe(0)
    expect(h.selected.seen).toContain(`127.0.0.1:${h.port}`)
    expect(h.fallback.seen).toEqual([])
    const flows = (await h.ctx.securityProxy.list({ sessionId: 'native-proxy-owner' })).flows
    expect(flows).toHaveLength(2)
    const success = flows.find(flow => flow.status === 200)!
    const detail = await h.ctx.securityProxy.detail(success.id)
    expect(detail).not.toBeNull()
    expect({ kind: detail!.kind, origin: detail!.origin, sessionId: detail!.sessionId, tool: detail!.tool,
      method: detail!.method, status: detail!.status, requestBody: detail!.requestBody, responseBody: detail!.responseBody })
      .toMatchInlineSnapshot(`
        {
          "kind": "http",
          "method": "POST",
          "origin": "proxy",
          "requestBody": "{"password":"[redacted]","message":"owned"}",
          "responseBody": "{"token":"[redacted]","message":"owned"}",
          "sessionId": "native-proxy-owner",
          "status": 200,
          "tool": "subprocess",
        }
      `)
    expect(flows.some(flow => flow.outcome === 'error' && flow.note === 'TARGET_FULLY_PROTECTED')).toBe(true)
    expect(await readdir(h.temporary)).toEqual([])
  }, nativeTimeout)

  it.each(['command', 'terminal', 'worker'] as const)('joins a real %s and its held upstream response when the independent proxy is disabled', async (kind) => {
    const h = await fixture()
    const program = `const http=require('node:http');http.get('http://127.0.0.1:${h.port}/hold',response=>{
response.on('data',()=>process.stdout.write('TRANSFER_STARTED\\n'));response.on('error',()=>{});
}).on('error',()=>{});setInterval(()=>{},1000);`
    if (kind === 'command') {
      const handle = h.subprocess.spawn({ argv: [process.execPath, '-e', program], cwd: h.work, graceMs: 1000,
        signal: AbortSignal.timeout(45000), stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } } })
      const outcome = Promise.allSettled([handle.done])
      try {
        await h.arrived
        expect((await h.ctx.securityProxy.configure({ enabled: false })).settings.enabled).toBe(false)
        expect(await handle.waitForExit()).toBe(true)
        await outcome; await h.targetClosed
      } finally { handle.terminate(); await handle.waitForExit() }
    } else if (kind === 'worker') {
      const running = h.ctx.agents.withInitiator(h.owner, () => h.ctx.ptcRuntime.run(h.ctx.ptcRuntime.resolve({
        program: 'return await tools.command({});', cwd: h.work, signal: AbortSignal.timeout(45000),
        bindings: [{ global: 'tools', functions: { command: async () => {
          const handle = h.ctx.subprocess.spawn({ argv: [process.execPath, '-e', program], cwd: h.work, graceMs: 1000,
            signal: AbortSignal.timeout(45000), stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } } })
          await Promise.allSettled([handle.done])
          return await handle.waitForExit()
        } } }],
      })))
      const outcome = Promise.allSettled([running])
      await Promise.race([h.arrived, running.then(() => { throw new Error('Worker ended before its upstream request arrived') })])
      expect((await h.ctx.securityProxy.configure({ enabled: false })).settings.enabled).toBe(false)
      expect(await running).toEqual({ logs: [], value: true })
      await outcome; await h.targetClosed
    } else {
      const terminal = await h.subprocess.spawnTerminal({ argv: [process.execPath, '-e', program], cwd: h.work,
        cols: 100, rows: 24, terminalType: 'xterm', graceMs: 1000, signal: AbortSignal.timeout(45000) })
      const outcome = Promise.allSettled([terminal.done])
      try {
        await h.arrived
        expect((await h.ctx.securityProxy.configure({ enabled: false })).settings.enabled).toBe(false)
        await outcome; await h.targetClosed
      } finally { await terminal.terminate() }
    }
    const flows = (await h.ctx.securityProxy.list({ sessionId: 'native-proxy-owner' })).flows
    expect(flows).toHaveLength(1)
    expect(flows[0]!.outcome).toBe('error')
    expect(h.fallback.seen).toEqual([])
    expect(await readdir(h.temporary)).toEqual([])
  }, nativeTimeout)
})
