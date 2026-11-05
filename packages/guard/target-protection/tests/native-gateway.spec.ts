/** Actual loopback egress verifies policy before HTTP or tunnel bytes reach a target. @module */
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { SessionChainProxy, type ChainOptions } from '@deepseek-ai/dsh-security-proxy-local'
import { createServer, request, type Server, type ServerResponse } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import * as tls from 'node:tls'
import { once } from 'node:events'
import { generate } from 'selfsigned'
import { connect, Socket, type AddressInfo } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import TargetProtection, { TargetStore } from '../src/index.ts'
import type { TargetRule, TargetRuleId } from '../src/types.ts'
import { startNativeGateway, type NativeGateway, type NativeGatewayOptions } from '../src/native-gateway.ts'

vi.mock('node:net', async (original) => {
  const actual = await original<typeof import('node:net')>()
  return { ...actual, connect: vi.fn(actual.connect) }
})

afterEach(() => { vi.restoreAllMocks(); vi.mocked(connect).mockReset() })

function rule(overrides: Partial<TargetRule> = {}): TargetRule {
  return { id: '4df071d9-85dd-40a2-adc0-016e30534528' as TargetRuleId, name: 'private test', enabled: true,
    kind: 'server', environment: 'test', protection: 'full', match: 'host', address: 'target.test', ...overrides }
}

async function fixture(audit = false) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-gateway-')), ctx = new Context()
  const sockets = new Set<Socket>(), servers: Server[] = [], gateways: NativeGateway[] = []
  const flows: Parameters<NonNullable<ChainOptions['capture']>['append']>[0][] = []
  const own = (socket: Socket) => {
    sockets.add(socket); socket.once('close', () => { sockets.delete(socket) }); socket.on('error', () => { socket.destroy() })
  }
  onTestFinished(async () => {
    try { await Promise.all(gateways.map(gateway => gateway.close())); await ctx.fiber.dispose() }
    finally {
      const closed = [...sockets].map(socket => new Promise<void>((resolve) => {
        if (socket.closed) resolve()
        else { socket.once('close', () => { resolve() }); socket.destroy() }
      }))
      await Promise.all(closed)
      await Promise.all(servers.filter(server => server.listening).map(server => new Promise<void>((resolve, reject) => {
        server.closeAllConnections(); server.close((error) => { if (error) reject(error); else resolve() })
      })))
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })
  const seen: { method: string; host: string | undefined; body: string }[] = []
  const arrived = Promise.withResolvers<ServerResponse>()
  let connections = 0
  const target = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      seen.push({ method: request.method ?? '', host: request.headers.host, body: Buffer.concat(chunks).toString() })
      if (request.url === '/hold') { arrived.resolve(response); return }
      if (request.url === '/redirect') { response.writeHead(302, { location: `http://production.test:${port}/` }); response.end(); return }
      response.end(Buffer.concat(chunks).toString() || 'target response')
    })
  })
  target.on('connection', (socket) => { own(socket); connections++ })
  await new Promise<void>((resolve) => { target.listen(0, '127.0.0.1', resolve) })
  servers.push(target)
  const port = (target.address() as AddressInfo).port, url = `http://target.test:${port}`
  const hosts = join(root, 'hosts')
  await writeFile(hosts, '127.0.0.1 target.test\n127.0.0.2 production.test\n127.0.0.1 alias.test\n')
  await ctx.plugin(SessionStore)
  const owner = await ctx.plugin({ inject: ['sessions'], apply(scope: Context) {
    scope.sessions.create(SessionId('native-gateway-fixture'))
  } })
  await ctx.plugin(TargetProtection, { path: join(root, 'rules.sqlite'), hostsFile: hosts,
    ...audit ? { auditPath: join(root, 'audit.sqlite') } : {} })
  const configure = async (rules: TargetRule[], mainlandEnabled = true) => {
    const previous = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure({ rules, mainlandEnabled }, previous.revision)
  }
  await configure([rule({ port })])
  const start = async (overrides: Partial<NativeGatewayOptions> = {}, signal = new AbortController().signal) => {
    let gateway: NativeGateway | undefined = undefined
    gateway = await startNativeGateway(ctx.targetProtection, {
      revision: (await ctx.targetProtection.snapshot()).revision, stopExecution: async () => { await gateway?.close() },
      sessionId: SessionId('native-gateway-fixture'), tool: 'shell', connectTimeoutMs: 2000, requestTimeoutMs: 5000,
      capture: { append(flow) { flows.push(flow); return undefined } }, capturePaused: () => false, ...overrides,
    }, signal)
    gateways.push(gateway)
    return gateway
  }
  const http = (gateway: NativeGateway, path = '/', body = '', authority = `target.test:${port}`, absolute = url + path) =>
    new Promise<{ status: number; body: string; location?: string }>((resolve, reject) => {
      const req = request(gateway.url, { method: body ? 'POST' : 'GET', path: absolute,
        headers: { host: authority }, signal: AbortSignal.timeout(10_000) }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => { chunks.push(chunk) })
        response.on('error', reject)
        response.on('end', () => { resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString(),
          ...response.headers.location === undefined ? {} : { location: response.headers.location } }) })
      })
      req.on('error', reject); req.end(body)
    })
  const tunnel = (gateway: NativeGateway, authority = `target.test:${port}`) =>
    new Promise<{ status: number; socket: Socket }>((resolve, reject) => {
      const req = request(gateway.url, { method: 'CONNECT', path: authority, signal: AbortSignal.timeout(10_000) })
      req.on('error', reject)
      req.once('connect', (response, socket) => { own(socket); resolve({ status: response.statusCode ?? 0, socket }) })
      req.end()
    })
  return { ctx, root, port, url, start, configure, http, tunnel, seen, flows, arrived, own, servers, owner,
    connections: () => connections }
}

it('keeps native HTTP bodies bound to their Session and cancels transfer after that owner closes', async () => {
  const h = await fixture(true), borrowed = h.owner.ctx.get('targetProtection')
  if (borrowed === undefined) throw new Error('Missing borrowed audit owner')
  const gateway = await h.start({ auditExecution: borrowed.bindAuditSession(SessionId('native-gateway-fixture')) })
  const received = Promise.withResolvers<boolean>(), disconnected = Promise.withResolvers<boolean>()
  let ended = false
  const client = request(gateway.url, { path: h.url + '/hold', headers: { host: `target.test:${h.port}` },
    signal: AbortSignal.timeout(10_000) }, (response) => {
    response.on('data', () => { received.resolve(true) })
    response.on('end', () => { ended = true })
    response.on('error', () => { disconnected.resolve(true) })
    response.once('close', () => { disconnected.resolve(true) })
  })
  client.on('error', () => { disconnected.resolve(true) })
  onTestFinished(() => { client.destroy() })
  client.end()
  const response = await h.arrived.promise
  const targetClosed = new Promise<void>((accept) => { response.once('close', () => { accept() }) })
  response.writeHead(200)
  response.write('partial transfer')
  await received.promise
  const recorded = h.ctx.targetProtection.auditHistory().entries.filter(entry => entry.source?.sessionId === 'native-gateway-fixture')
  expect(recorded.some(entry => entry.operation === 'connection' && entry.decision === 'allow')).toBe(true)
  await h.owner.dispose()
  await Promise.all([disconnected.promise, targetClosed])
  expect(ended).toBe(false)
  expect(h.ctx.targetProtection.auditHistory().state).toBe('ready')
  await vi.waitFor(() => { expect(h.flows.at(-1)).toMatchObject({ sessionId: 'native-gateway-fixture', outcome: 'error' }) })
  const connections = h.connections()
  expect((await h.http(gateway)).status).toBeGreaterThanOrEqual(400)
  expect(h.connections()).toBe(connections)
})

it('forwards HTTP methods and bytes only to an explicit private test endpoint', async () => {
  const h = await fixture(), gateway = await h.start()
  expect(await h.http(gateway, '/', 'test payload')).toEqual({ status: 200, body: 'test payload' })
  expect(h.seen).toEqual([{ method: 'POST', host: `target.test:${h.port}`, body: 'test payload' }])
  await gateway.close()
  expect(h.flows).toMatchObject([{ method: 'POST', outcome: 'complete', target: h.url + '/', responseBody: 'test payload' }])
})

it.skipIf(typeof tls.setDefaultCACertificates !== 'function')('inspects real HTTPS, validates each redirected target and retains upstream certificate checks', async () => {
  const h = await fixture(), material = await generate([{ name: 'commonName', value: 'target.test' }], {
    keyType: 'ec', algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'target.test' }] }],
  })
  const original = tls.getCACertificates('default')
  onTestFinished(() => { tls.setDefaultCACertificates(original) })
  tls.setDefaultCACertificates([...original, material.cert])
  let requests = 0
  const target = createSecureServer({ key: material.private, cert: material.cert }, (request, response) => {
    requests++
    if (request.url === '/redirect') response.writeHead(302, { location: `https://production.test:${port}/` })
    response.end('secure target')
  })
  target.on('connection', h.own); target.on('tlsClientError', () => {})
  h.servers.push(target)
  await new Promise<void>((resolve) => { target.listen(0, '127.0.0.1', resolve) })
  const port = (target.address() as AddressInfo).port
  await h.configure([rule({ port }), rule({ id: '2e3a017d-ef02-427f-9c7f-860bed4d8148' as TargetRuleId,
    environment: 'production', match: 'regex', address: '^production\\.', port })], false)
  const gateway = await h.start({ httpsInspection: { maxCertificates: 8, certificateLifetimeMs: 60000,
    handshakeTimeoutMs: 2000, requestTimeoutMs: 5000 } })
  const send = async (path: string, authority = `target.test:${port}`, trusted = true) => {
    const opened = await h.tunnel(gateway, authority)
    if (opened.status !== 200) return { status: opened.status, text: '' }
    const secure = tls.connect({ socket: opened.socket, servername: 'target.test', ca: gateway.certificate })
    h.own(secure)
    await once(secure, 'secureConnect')
    const chunks: Buffer[] = []
    secure.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    const closed = once(secure, 'close')
    if (!trusted) tls.setDefaultCACertificates(original)
    secure.write(`GET ${path} HTTP/1.1\r\nHost: ${authority}\r\nConnection: close\r\n\r\n`)
    await closed
    const text = Buffer.concat(chunks).toString()
    return { status: Number(/^HTTP\/1.1 (\d+)/u.exec(text)?.[1]), text }
  }
  expect((await send('/')).text).toContain('secure target')
  expect((await send('/redirect')).status).toBe(302)
  expect((await send('/', `production.test:${port}`)).status).toBe(403)
  expect((await send('/', undefined, false)).status).toBe(502)
  expect(requests).toBe(2)
  await gateway.close()
  expect(h.flows.filter(flow => flow.kind === 'http' && flow.outcome === 'complete')).toHaveLength(2)
})

it('does not retain traffic when its generic process owner supplies no capture sink', async () => {
  const h = await fixture(), gateway = await h.start({ capture: undefined, capturePaused: undefined })
  expect((await h.http(gateway)).status).toBe(200)
  await gateway.close()
  expect(h.flows).toEqual([])
})

it.each(['full', 'audit'] as const)('blocks %s production before a socket is opened', async (protection) => {
  const h = await fixture()
  await h.configure([rule({ port: h.port }), rule({ id: '2e3a017d-ef02-427f-9c7f-860bed4d8148' as TargetRuleId,
    environment: 'production', protection, port: h.port })])
  const gateway = await h.start()
  expect((await h.http(gateway)).status).toBe(403)
  expect((await h.tunnel(gateway)).status).toBe(403)
  expect(h.connections()).toBe(0)
})

it('checks named production aliases against the selected literal address', async () => {
  const h = await fixture()
  await h.configure([rule({ port: h.port }), rule({ id: '2e3a017d-ef02-427f-9c7f-860bed4d8148' as TargetRuleId,
    environment: 'production', address: 'alias.test', port: h.port })])
  const gateway = await h.start()
  expect((await h.http(gateway)).status).toBe(403)
  expect(h.connections()).toBe(0)
})

it('rejects an HTTP authority mismatch and private endpoints without owner selection', async () => {
  const h = await fixture(), gateway = await h.start()
  expect((await h.http(gateway, '/', '', 'production.test')).status).toBe(403)
  await gateway.close(); await h.configure([], false)
  expect((await h.http(await h.start())).status).not.toBe(200)
  expect(h.connections()).toBe(0)
})

it('does not follow redirects on behalf of the native caller', async () => {
  const h = await fixture(), gateway = await h.start()
  expect(await h.http(gateway, '/redirect')).toMatchObject({ status: 302, location: `http://production.test:${h.port}/` })
  expect(h.seen).toHaveLength(1)
})

it('allows a pinned test tunnel and closes its target socket with the gateway', async () => {
  const h = await fixture(), gateway = await h.start(), tunnel = await h.tunnel(gateway)
  expect(tunnel.status).toBe(200)
  expect(h.connections()).toBe(1)
  const closed = new Promise<void>((resolve) => { tunnel.socket.once('close', () => { resolve() }); tunnel.socket.resume() })
  await gateway.close(); await closed
  expect(h.flows).toMatchObject([{ method: 'CONNECT', note: 'cancelled' }])
})

it('refuses an opaque tunnel when domain rules cannot establish its application identity', async () => {
  const h = await fixture()
  await h.configure([rule({ port: h.port }), rule({ id: '2e3a017d-ef02-427f-9c7f-860bed4d8148' as TargetRuleId,
    environment: 'production', match: 'regex', address: '^production\\.', port: h.port })])
  const gateway = await h.start()
  expect((await h.http(gateway)).status).toBe(200)
  const previous = h.connections()
  expect((await h.tunnel(gateway)).status).toBe(403)
  expect(h.connections()).toBe(previous)
})

it('cancels a pending request on policy changes and refuses later requests from that execution', async () => {
  const h = await fixture(), gateway = await h.start(), response = h.http(gateway, '/hold')
  void response.catch(() => {})
  await h.arrived.promise
  await h.configure([rule({ environment: 'production', port: h.port })])
  const outcome = await response.catch(() => undefined)
  if (outcome !== undefined) expect(outcome.status).toBe(502)
  await expect(h.http(gateway)).rejects.toBeDefined()
  await gateway.close()
  expect(h.seen).toHaveLength(1)
})

it('never falls back to direct traffic when an upstream refuses CONNECT', async () => {
  const h = await fixture(), attempts: string[] = []
  const upstream = createServer()
  upstream.on('connection', h.own)
  upstream.on('connect', (request, socket) => { attempts.push(request.url ?? ''); socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n') })
  await new Promise<void>((resolve) => { upstream.listen(0, '127.0.0.1', resolve) })
  h.servers.push(upstream)
  const gateway = await h.start({ upstream: { protocol: 'http', host: '127.0.0.1', port: (upstream.address() as AddressInfo).port,
    username: '', password: undefined } })
  expect((await h.http(gateway)).status).toBe(502)
  expect(attempts).toEqual([`127.0.0.1:${h.port}`])
  expect(h.connections()).toBe(0)
})

it('does not allocate a gateway after caller cancellation', async () => {
  const h = await fixture(), cancellation = new Error('execution cancelled')
  await expect(h.start({}, AbortSignal.abort(cancellation))).rejects.toBe(cancellation)
})

it('retains the registry revision until all gateway transports close', async () => {
  const h = await fixture(), store = await TargetStore.open(join(h.root, 'rules.sqlite'), 1)
  try {
    const gateway = await h.start()
    const snapshot = store.snapshot()
    expect(() => { store.configure({ mainlandEnabled: false, rules: [] }, snapshot.revision) }).toThrow()
    await gateway.close()
    expect(store.configure({ mainlandEnabled: false, rules: [] }, snapshot.revision).revision).toBe(snapshot.revision + 1)
  } finally { store.close() }
})

it('closes a listener acquired concurrently with cancellation and releases its revision', async () => {
  const h = await fixture(), controller = new AbortController(), failure = new Error('cancel during listen')
  const start = SessionChainProxy.start.bind(SessionChainProxy)
  vi.spyOn(SessionChainProxy, 'start').mockImplementationOnce(async (options) => {
    const proxy = await start(options)
    controller.abort(failure)
    return proxy
  })
  await expect(h.start({}, controller.signal)).rejects.toBe(failure)
  await h.configure([], false)
  expect((await h.ctx.targetProtection.snapshot()).preferences.rules).toEqual([])
})

it.each(['http', 'https'])('checks the default %s port before connecting to a protected name', async (scheme) => {
  const h = await fixture()
  await h.configure([rule({ environment: 'production' })])
  expect((await h.http(await h.start(), '/', '', 'target.test', `${scheme}://target.test/`)).status).toBe(403)
  expect(h.connections()).toBe(0)
})

it('uses the public resolver for targets without an owner test selection', async () => {
  const h = await fixture()
  await h.configure([], false)
  // The public-address resolver is substituted; the owned target, pinning and HTTP request stay real.
  const resolved = vi.spyOn(h.ctx.targetProtection, 'resolveHttpTarget').mockImplementation((name, signal) =>
    h.ctx.targetProtection.resolveConnectionTarget(name, signal))
  expect((await h.http(await h.start())).status).toBe(200)
  expect(resolved).toHaveBeenCalledWith('target.test', expect.any(AbortSignal))
})

it('preserves upstream credentials without forwarding them to the target', async () => {
  const h = await fixture(), destinations: string[] = [], credentials: (string | undefined)[] = []
  const upstream = createServer()
  upstream.on('connection', h.own)
  upstream.on('connect', (request, client, head) => {
    destinations.push(request.url ?? ''); credentials.push(request.headers['proxy-authorization'])
    if (request.url !== `127.0.0.1:${h.port}`) { client.destroy(); return }
    const target = connect(h.port, '127.0.0.1')
    h.own(target)
    target.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) target.write(head)
      client.pipe(target); target.pipe(client)
    })
    client.once('close', () => { target.destroy() }); target.once('close', () => { client.destroy() })
  })
  await new Promise<void>((resolve) => { upstream.listen(0, '127.0.0.1', resolve) })
  h.servers.push(upstream)
  const gateway = await h.start({ upstream: { protocol: 'http', host: '127.0.0.1', port: (upstream.address() as AddressInfo).port,
    username: 'fixture', password: 'private-proxy-password' } })
  expect((await h.http(gateway, '/', 'through upstream')).body).toBe('through upstream')
  expect((await h.tunnel(gateway)).status).toBe(200)
  await gateway.close()
  expect(destinations).toEqual([`127.0.0.1:${h.port}`, `127.0.0.1:${h.port}`])
  expect(credentials).toEqual(Array(2).fill(`Basic ${Buffer.from('fixture:private-proxy-password').toString('base64')}`))
  expect(JSON.stringify(h.flows)).not.toContain('private-proxy-password')
})

it('closes a failed direct tunnel without replay or retained target sockets', async () => {
  const h = await fixture(), gateway = await h.start()
  await new Promise<void>((resolve) => { h.servers[0]!.close(() => { resolve() }) })
  expect((await h.tunnel(gateway)).status).toBe(502)
  expect(h.connections()).toBe(0)
  await gateway.close()
})

it('cancels and joins a direct connection still waiting for its connect event', async () => {
  const h = await fixture(), controller = new AbortController(), gateway = await h.start({}, controller.signal)
  const started = Promise.withResolvers<Socket>()
  vi.mocked(connect).mockImplementationOnce(() => {
    const socket = new Socket()
    started.resolve(socket)
    return socket
  })
  const pending = h.tunnel(gateway)
  void pending.catch(() => {})
  const socket = await started.promise
  controller.abort(new Error('cancel pending connect'))
  await pending.catch(() => undefined)
  await gateway.close()
  expect(socket.closed).toBe(true)
  expect(h.connections()).toBe(0)
})

it('refuses tunnel startup without a resolved address', async () => {
  const h = await fixture()
  await h.configure([rule()], false)
  vi.spyOn(h.ctx.targetProtection, 'resolveConnectionTarget').mockResolvedValue({
    hostname: 'target.test', names: ['target.test'], addresses: [], source: 'hosts',
  })
  expect((await h.tunnel(await h.start())).status).toBe(403)
  expect(h.connections()).toBe(0)
})

it('waits for physical socket closure after a failed connection attempt', async () => {
  const h = await fixture(), gateway = await h.start()
  const release = Promise.withResolvers<undefined>()
  let awaitedClosure = false
  vi.mocked(connect).mockImplementationOnce(() => {
    const socket = new Socket()
    const destroy = socket._destroy.bind(socket)
    socket._destroy = (error, callback) => {
      void release.promise.then(() => { destroy(error, callback) })
    }
    socket.on('newListener', (event) => {
      if (event === 'close' && socket.destroyed) {
        awaitedClosure = true
        queueMicrotask(() => { release.resolve(undefined) })
      }
    })
    queueMicrotask(() => { socket.emit('error', new Error('owned connection failure')) })
    return socket
  })
  try {
    expect((await h.tunnel(gateway)).status).toBe(502)
    expect(awaitedClosure).toBe(true)
  } finally { release.resolve(undefined) }
  await gateway.close()
})
