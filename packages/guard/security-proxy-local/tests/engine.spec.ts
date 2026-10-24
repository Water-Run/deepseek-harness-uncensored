import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { getGlobalDispatcher } from 'undici'
import { connect as netConnect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WebError } from '@deepseek-ai/dsh-web'
import { CaptureStore } from '../src/capture.ts'
import { SecurityProxyEngine, type EgressSubject, type EngineOptions } from '../src/engine.ts'
import { SettingsStore } from '../src/settings.ts'
import { startLocalProxy, startLocalTarget, startTcpEcho, type LocalProxy, type LocalTarget, type LocalTcpTarget } from './support/local-proxy.ts'

const subject = (id: string): EgressSubject => ({ session: { id: SessionId(id) } })

interface Harness {
  readonly engine: SecurityProxyEngine
  readonly capture: CaptureStore
  readonly upstream: LocalProxy
  readonly target: LocalTarget
  readonly echo: LocalTcpTarget
  readonly warnings: string[]
  readonly chainPort: number
}

let harness: Harness | undefined
let root: string | undefined

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dshu-security-engine-'))
})

afterEach(async () => {
  if (harness !== undefined) {
    await harness.engine.dispose()
    await harness.upstream.close()
    await harness.target.close()
    await harness.echo.close()
    harness = undefined
  }
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Build the engine over real loopback servers. */
async function build(patch: Partial<EngineOptions> = {}): Promise<Harness> {
  const upstream = await startLocalProxy()
  const target = await startLocalTarget()
  const echo = await startTcpEcho()
  const capture = new CaptureStore(() => ({ maxFlows: 50, maxBodyBytes: 4_096, retentionMs: 600_000 }))
  const store = await SettingsStore.open(join(root ?? tmpdir(), 'security-proxy.json'))
  const warnings: string[] = []
  const presets = new Map<string, string>([['sess-a', 'security'], ['sess-b', 'standard']])
  const engine = new SecurityProxyEngine({
    store,
    capture,
    vault: { present: async () => true, resolve: async () => 'secret', save: async () => undefined },
    presetOf: scope => presets.get(scope.session.id) ?? 'standard',
    sessionIdOf: scope => scope.session.id,
    testTarget: { host: '127.0.0.1', port: echo.port },
    connectTimeoutMs: 4_000,
    requestTimeoutMs: 5_000,
    maxRedirects: 3,
    maxBodyChars: 10_000,
    maxResponseBytes: 1_000_000,
    userAgent: 'dshu-test',
    warnDisabled: (id) => { warnings.push(id) },
    ...patch,
  })
  await engine.configure({ enabled: true, protocol: 'http', host: '127.0.0.1', port: upstream.port })
  const env = await engine.environment(subject('sess-a'), 'bash')
  const chainPort = Number(new URL(env?.HTTP_PROXY ?? 'http://127.0.0.1:0').port)
  harness = { engine, capture, upstream, target, echo, warnings, chainPort }
  return harness
}

/** Issue one absolute-form request through the chain listener. */
function throughChain(port: number, url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, method: 'GET', path: url, headers: { host: new URL(url).host } }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => { resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }) })
    })
    request.on('error', reject)
    request.end()
  })
}

/** Open one CONNECT tunnel through the chain listener and exchange bytes. */
function tunnelThrough(port: number, authority: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(port, '127.0.0.1', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`)
    })
    let buffer = ''
    let upgraded = false
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      if (!upgraded && buffer.includes('\r\n\r\n')) {
        upgraded = true
        const index = buffer.indexOf('\r\n\r\n') + 4
        buffer = buffer.slice(index)
        socket.write('ping')
        return
      }
      if (upgraded && buffer.includes('ping')) {
        socket.end()
        resolve(buffer)
      }
    })
    socket.on('error', reject)
    socket.setTimeout(4_000, () => { socket.destroy(); reject(new Error('tunnel timed out')) })
  })
}

describe('covered retrieval', () => {
  it('retrieves through the upstream and records the plaintext exchange', async () => {
    const h = await build()
    const result = await h.engine.fetchTarget(subject('sess-a'), h.target.url, new AbortController().signal)
    expect(result.statusCode).toBe(200)
    expect(result.body).toEqual({ kind: 'text', content: 'target body' })
    expect(h.upstream.requests.map(entry => entry.url)).toEqual([h.target.url])
    const flows = h.engine.list()
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({
      kind: 'http',
      origin: 'client',
      sessionId: 'sess-a',
      tool: 'web_fetch',
      status: 200,
      outcome: 'complete',
    })
    const detail = h.engine.detail(flows[0]?.id ?? '')
    expect(detail?.responseBody).toBe('target body')
    expect(detail?.responseHeaders).toContainEqual({ name: 'set-cookie', value: '[redacted]' })
  })

  it('lets a non-security session keep the direct path', async () => {
    const h = await build()
    expect(h.engine.route(subject('sess-b'), 'web_fetch')).toBeUndefined()
    const failure = await h.engine.fetchTarget(subject('sess-b'), h.target.url, new AbortController().signal).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(WebError)
    expect((failure as WebError).code).toBe('SECURITY_PROXY_NOT_COVERED')
    expect(h.upstream.requests).toHaveLength(0)
    expect(h.engine.list()).toHaveLength(0)
  })

  it('stops routing and warns once per conversation when disabled', async () => {
    const h = await build()
    await h.engine.configure({ enabled: false, warnWhenDisabled: true })
    expect(h.engine.route(subject('sess-a'), 'bash')).toBeUndefined()
    expect(h.engine.route(subject('sess-a'), 'bash')).toBeUndefined()
    expect(h.engine.route(subject('sess-b'), 'bash')).toBeUndefined()
    expect(h.warnings).toEqual(['sess-a'])
    h.engine.forgetSession(SessionId('sess-a'))
    expect(h.engine.route(subject('sess-a'), 'bash')).toBeUndefined()
    expect(h.warnings).toEqual(['sess-a', 'sess-a'])
  })

  it('reports an unreachable upstream instead of pretending the request was proxied', async () => {
    const upstream = await startLocalProxy()
    const target = await startLocalTarget()
    const echo = await startTcpEcho()
    const capture = new CaptureStore(() => ({ maxFlows: 10, maxBodyBytes: 1_024, retentionMs: 60_000 }))
    const store = await SettingsStore.open(join(root ?? tmpdir(), 'unreachable.json'))
    const engine = new SecurityProxyEngine({
      store,
      capture,
      vault: { present: async () => false, resolve: async () => undefined, save: async () => undefined },
      presetOf: () => 'security',
      sessionIdOf: scope => scope.session.id,
      testTarget: { host: '127.0.0.1', port: echo.port },
      connectTimeoutMs: 1_000,
      requestTimeoutMs: 1_000,
      maxRedirects: 2,
      maxBodyChars: 1_000,
      maxResponseBytes: 10_000,
      userAgent: 'dshu-test',
    })
    await upstream.close()
    await echo.close()
    try {
      const state = await engine.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })
      expect(state.status).toBe('failed')
      expect(state.failure).not.toBeNull()
      const failure = await engine.fetchTarget(subject('sess-a'), target.url, new AbortController().signal).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(WebError)
      expect((failure as WebError).code).toBe('SECURITY_PROXY_UNREACHABLE')
      expect((await engine.state()).status).toBe('failed')
      expect(capture.list()).toHaveLength(1)
      expect(capture.list()[0]?.outcome).toBe('error')
    } finally {
      await engine.dispose()
      await target.close()
    }
  })
})

describe('connection check', () => {
  it('requires a real CONNECT through the upstream', async () => {
    const h = await build()
    expect(h.upstream.tunnels.length).toBeGreaterThan(0)
    expect((await h.engine.state()).status).toBe('ready')
    h.upstream.setTunnelStatus(403)
    const failed = await h.engine.test()
    expect(failed.ok).toBe(false)
    expect((await h.engine.state()).status).toBe('failed')
  })

  it('classifies rejected credentials as an authentication failure', async () => {
    const h = await build({
      vault: { present: async () => true, resolve: async () => 'wrong', save: async () => undefined },
    })
    h.upstream.setCredentials({ user: 'ops', pass: 'secret' })
    await h.engine.configure({ enabled: true, authEnabled: true, username: 'ops', host: '127.0.0.1', port: h.upstream.port })
    const result = await h.engine.test()
    expect(result.ok).toBe(false)
    expect(result.failure).toBe('auth')
  })
})

describe('child-process coverage', () => {
  it('forwards plain HTTP through the per-session listener and attributes it', async () => {
    const h = await build()
    const env = await h.engine.environment(subject('sess-a'), 'bash')
    expect(env).toMatchObject({ HTTP_PROXY: `http://127.0.0.1:${String(h.chainPort)}`, HTTPS_PROXY: `http://127.0.0.1:${String(h.chainPort)}`, NO_PROXY: '' })
    expect(h.upstream.requests).toHaveLength(0)
    const response = await throughChain(h.chainPort, h.target.url)
    expect(response).toEqual({ status: 200, body: 'target body' })
    expect(h.upstream.requests.map(entry => entry.url)).toEqual([h.target.url])
    const flows = h.engine.list()
    expect(flows[0]).toMatchObject({ origin: 'proxy', sessionId: 'sess-a', tool: 'bash', status: 200 })
  })

  it('records only tunnel metadata for CONNECT', async () => {
    const h = await build()
    const echoed = await tunnelThrough(h.chainPort, `127.0.0.1:${String(h.echo.port)}`)
    expect(echoed).toBe('ping')
    await new Promise(resolve => setTimeout(resolve, 50))
    const flow = h.engine.list().find(entry => entry.kind === 'tunnel')
    expect(flow).toMatchObject({
      kind: 'tunnel',
      origin: 'proxy',
      sessionId: 'sess-a',
      method: 'CONNECT',
      target: `127.0.0.1:${String(h.echo.port)}`,
      status: null,
      note: 'tunnel-metadata-only',
    })
    const detail = h.engine.detail(flow?.id ?? '')
    expect(detail?.requestBody).toBeNull()
    expect(detail?.responseBody).toBeNull()
    expect(h.upstream.tunnels.map(entry => entry.authority)).toContain(`127.0.0.1:${String(h.echo.port)}`)
  })

  it('hands no proxy environment to an uncovered session', async () => {
    const h = await build()
    expect(await h.engine.environment(subject('sess-b'), 'bash')).toBeUndefined()
  })
})

describe('capture controls', () => {
  it('keeps routing while capture is paused and clears on demand', async () => {
    const h = await build()
    await h.engine.fetchTarget(subject('sess-a'), h.target.url, new AbortController().signal)
    expect(h.engine.list()).toHaveLength(1)
    await h.engine.setPaused(true)
    await h.engine.fetchTarget(subject('sess-a'), h.target.url, new AbortController().signal)
    expect(h.engine.list()).toHaveLength(1)
    expect(h.upstream.requests).toHaveLength(2)
    expect((await h.engine.state()).capture.paused).toBe(true)
    h.engine.clear()
    expect(h.engine.list()).toHaveLength(0)
  })

  it('cuts a large body at the capture cap and flags it', async () => {
    const h = await build()
    const big = 'x'.repeat(20_000)
    const bigTarget = await startLocalTarget(big)
    try {
      const result = await h.engine.fetchTarget(subject('sess-a'), bigTarget.url, new AbortController().signal)
      expect(result.body.content).toHaveLength(10_000)
      expect(result.truncated).toBe(true)
      const flow = h.engine.list()[0]
      const detail = h.engine.detail(flow?.id ?? '')
      expect(detail?.bodyTruncated).toBe(true)
      expect((detail?.responseBody ?? '').length).toBeLessThanOrEqual(4_096)
    } finally {
      await bigTarget.close()
    }
  })
})

describe('cancellation and shutdown', () => {
  it('reports caller cancellation instead of a proxy failure', async () => {
    const h = await build({ requestTimeoutMs: 30_000 })
    const slow = createServer((_request, response) => {
      setTimeout(() => { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('late') }, 2_000)
    })
    const port = await portOf(slow)
    try {
      const controller = new AbortController()
      const pending = h.engine.fetchTarget(subject('sess-a'), `http://127.0.0.1:${String(port)}/slow`, controller.signal)
      setTimeout(() => { controller.abort() }, 20)
      const failure = await pending.catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(WebError)
      expect((failure as WebError).code).toBe('WEB_ABORTED')
      expect(h.engine.list()[0]?.outcome).toBe('error')
    } finally {
      await stop(slow)
    }
  })

  it('times out a request whose target never answers', async () => {
    const h = await build({ requestTimeoutMs: 100 })
    const slow = createServer(() => { /* Never responds. */ })
    const port = await portOf(slow)
    try {
      const failure = await h.engine.fetchTarget(subject('sess-a'), `http://127.0.0.1:${String(port)}/slow`, new AbortController().signal)
        .catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(WebError)
      expect((failure as WebError).code).toBe('WEB_FETCH_TIMEOUT')
    } finally {
      await stop(slow)
    }
  })

  it('closes the session listener on disposal so nothing keeps serving', async () => {
    const h = await build()
    const port = h.chainPort
    await h.engine.dispose()
    await expect(throughChain(port, h.target.url)).rejects.toThrow()
  })
})

/** Close one test server, dropping connections a stalled response left open. */
async function stop(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
}

/** Resolve a server's loopback port after it starts listening. */
function portOf(server: Server): Promise<number> {
  return new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(address !== null && typeof address !== 'string' ? address.port : 0)
    })
  })
}

describe('isolation from the process route', () => {
  it('never replaces the global dispatcher or the Host environment', async () => {
    const dispatcher = getGlobalDispatcher()
    const proxyEnv = process.env.HTTP_PROXY
    const h = await build()
    try {
      await h.engine.fetchTarget(subject('sess-a'), h.target.url, new AbortController().signal)
      await h.engine.environment(subject('sess-a'), 'bash')
      expect(getGlobalDispatcher()).toBe(dispatcher)
      expect(process.env.HTTP_PROXY).toBe(proxyEnv)
    } finally {
      await h.engine.dispose()
    }
  })
})
