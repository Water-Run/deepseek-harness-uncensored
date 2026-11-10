/** Guarded proxy execution against real listeners and a real Loader composition. @module */
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { createServer as createSecureServer, type ServerOptions as SecureServerOptions } from 'node:https'
import { connect, type AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import * as tls from 'node:tls'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as Credentials from '@deepseek-ai/dsh-credentials-local'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as Http from '@deepseek-ai/dsh-web-fetch-http'
import * as ProxyHost from '@deepseek-ai/dsh-security-proxy-local'
import { generate } from 'selfsigned'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import TargetProtection, { TargetStore } from '../src/index.ts'
import * as ProtectedProxy from '../src/security-proxy.ts'
import * as ProtectedHttp from '../src/http.ts'
import type { TargetRule, TargetRuleId } from '../src/types.ts'

afterEach(() => { vi.restoreAllMocks() })

function subject(): Agent {
  const id = SessionId('guarded-proxy-fixture')
  return { id, session: Session.create(id, [], {
    id, version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false, agentPreset: 'security',
  }) } as Agent
}

function production(overrides: Partial<TargetRule> = {}): TargetRule {
  return { id: '59d2c30a-2d98-45d5-a8df-392f99043072' as TargetRuleId, name: 'fixture', enabled: true, kind: 'server',
    environment: 'production', protection: 'full', match: 'host', address: 'origin.test', ...overrides }
}

async function harness(privateTarget = false, audit = false, tlsOptions?: SecureServerOptions) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-guarded-proxy-'))
  const ctx = new Context()
  const unblock: (() => void)[] = []
  let engine: ProxyHost.SecurityProxyEngine | undefined
  const mount = ProxyHost.mountSecurityProxy
  vi.spyOn(ProxyHost, 'mountSecurityProxy').mockImplementation((context, config, factory) => mount(context, config, (options) => {
    if (factory === undefined) throw new Error('The protected fixture requires its explicit engine')
    engine = factory(options); return engine
  }))
  const sockets = new Set<Duplex>()
  const servers: Server[] = []
  const failed: unknown[] = []
  const own = (socket: Duplex) => {
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket) })
    socket.on('error', () => { socket.destroy() })
  }
  onTestFinished(async () => {
    for (const release of unblock) release()
    try { await ctx.fiber.dispose() }
    finally {
      for (const socket of sockets) socket.destroy()
      try {
        await Promise.all(servers.filter(server => server.listening).map(server => new Promise<void>((resolve, reject) => {
          server.closeAllConnections()
          server.close((error) => { if (error === undefined) resolve(); else reject(error) })
        })))
      } finally { await rm(root, { recursive: true, force: true }) }
    }
    expect(failed).toEqual([])
  })
  if (audit) {
    await mountAgentLoopTestDependencies(ctx)
    await mountAgentLoopTestHarness(ctx)
  }
  const seen: { method: string; host: string | undefined; body: string; proxyAuthorization: string | undefined }[] = []
  let targetConnections = 0, proxyConnections = 0
  let handle: (request: IncomingMessage, response: ServerResponse) => Promise<void> = async (request, response) => {
    const chunks: Uint8Array[] = []
    for await (const chunk of request) {
      if (!(chunk instanceof Uint8Array)) throw new Error('fixture expected request bytes')
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks).toString('utf8')
    seen.push({ method: request.method ?? '', host: request.headers.host, body,
      proxyAuthorization: request.headers['proxy-authorization'] })
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end(body || 'guarded fixture')
  }
  const dispatch = (request: IncomingMessage, response: ServerResponse) => {
    void handle(request, response).catch((error: unknown) => { failed.push(error); response.destroy() })
  }
  const target = tlsOptions === undefined ? createServer(dispatch) : createSecureServer(tlsOptions, dispatch)
  servers.push(target)
  target.on('connection', (socket: Duplex) => { targetConnections++; own(socket) })
  await new Promise<void>((resolve) => { target.listen(0, '127.0.0.1', resolve) })
  const port = (target.address() as AddressInfo).port
  const tunnels: string[] = []
  const proxy = createServer((_request, response) => { response.writeHead(405); response.end() })
  servers.push(proxy)
  proxy.on('connection', (socket) => { proxyConnections++; own(socket) })
  proxy.on('connect', (request, client, head) => {
    tunnels.push(request.url ?? '')
    if (request.url !== `127.0.0.1:${port}`) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
    const remote = connect(port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.byteLength > 0) remote.write(head)
      client.pipe(remote); remote.pipe(client)
    })
    own(remote)
    client.once('close', () => { remote.destroy() })
    remote.once('close', () => { client.destroy() })
  })
  await new Promise<void>((resolve) => { proxy.listen(0, '127.0.0.1', resolve) })
  const proxyPort = (proxy.address() as AddressInfo).port
  const rulesPath = join(root, 'rules.sqlite')
  const hosts = join(root, 'hosts')
  await writeFile(hosts, '127.0.0.1 origin.test\n')
  // Only anonymous-fetch SSRF resolution is substituted; DNS, policy, CONNECT and target I/O stay real.
  if (!privateTarget) vi.spyOn(Http, 'resolvePublicAddresses').mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
  const replacements: Record<string, string | number> = {
    __CREDENTIALS__: join(root, 'credentials.yaml'), __HOME__: root, __RULES__: rulesPath,
    __HOSTS__: hosts, __PROXY__: join(root, 'proxy.json'), __PORT__: port,
    __AUDIT__: audit ? join(root, 'audit.sqlite') : '',
  }
  let config = await readFile(new URL('./fixtures/proxy.cordis.yml', import.meta.url), 'utf8')
  for (const [key, value] of Object.entries(replacements)) config = config.replace(key, JSON.stringify(value))
  config = config.replace('__INSPECTION__', tlsOptions === undefined ? 'null' : '{ tools: [fixture, sidebar_browser] }')
  const path = join(root, 'cordis.yml')
  await writeFile(path, config)
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.builtins['credentials-local'] = Credentials
  ctx.loader.builtins.web = WebRuntime
  ctx.loader.builtins['target-protection'] = TargetProtection
  ctx.loader.builtins['protected-http'] = ProtectedHttp
  ctx.loader.builtins['protected-proxy'] = ProtectedProxy
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  const configure = async (rules: TargetRule[], mainlandEnabled = false) => {
    const snapshot = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure({ rules, mainlandEnabled }, snapshot.revision)
  }
  await configure(privateTarget ? [production({ environment: 'test', port })] : [])
  expect((await ctx.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: proxyPort })).status).toBe('ready')
  await vi.waitFor(() => { expect(sockets.size).toBe(0) })
  proxyConnections = 0; targetConnections = 0; tunnels.length = 0
  const agent = audit ? (await ctx.agents.create({ sessionId: SessionId('guarded-proxy-fixture'),
    meta: { agentPreset: 'security' } })).agent : subject()
  const url = `http://origin.test:${port}/`
  const fetch = (path = '') => ctx.securityProxy.fetchTarget(agent, url + path, new AbortController().signal)
  const chain = async () => {
    const environment = await ctx.securityProxy.environment(agent, 'fixture')
    if (environment?.HTTP_PROXY === undefined) throw new Error('proxy route is absent')
    return Number(new URL(environment.HTTP_PROXY).port)
  }
  return { ctx, rulesPath, configure, fetch, url, port, agent, chain, seen, tunnels, unblock,
    engine: () => { if (engine === undefined) throw new Error('Protected engine is absent'); return engine },
    counts: () => ({ targetConnections, proxyConnections }),
    respond: (next: typeof handle) => { handle = next },
  }
}

function throughChain(port: number, target: string, body = '', host = new URL(target).host): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path: target, method: body ? 'POST' : 'GET', headers: { host } }, (response) => {
      const chunks: Uint8Array[] = []
      response.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      response.on('error', reject)
      response.on('end', () => { resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }) })
    })
    request.on('error', reject)
    request.end(body)
  })
}

function throughTunnel(port: number, authority: string, payload = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n${payload}`)
    })
    socket.setTimeout(5_000, () => { socket.destroy(new Error('Fixture tunnel did not close')) })
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    socket.on('error', reject)
    socket.on('close', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
  })
}

async function processTraffic(
  environment: Readonly<Record<string, string>> | undefined, mode: 'http' | 'connect' | 'https', target: string,
): Promise<unknown> {
  if (environment?.HTTP_PROXY === undefined) throw new Error('Missing issued fixture route')
  const fixture = fileURLToPath(new URL('./fixtures/proxy-traffic.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [fixture, mode, target], {
    env: { ...process.env, ...environment }, windowsHide: true, timeout: 15_000, encoding: 'utf8', maxBuffer: 64 * 1024,
  })
  const result: unknown = JSON.parse(stdout)
  return result
}

it.skipIf(typeof tls.setDefaultCACertificates !== 'function')('inspects HTTPS only for the selected tool and preserves origin verification', async () => {
  const material = await generate([{ name: 'commonName', value: 'origin.test' }], {
    keyType: 'ec', algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'origin.test' }] }],
  })
  const original = tls.getCACertificates('default')
  onTestFinished(() => { tls.setDefaultCACertificates(original) })
  tls.setDefaultCACertificates([...original, material.cert])
  const h = await harness(true, true, { key: material.private, cert: material.cert })
  const rule = production({ environment: 'test', port: h.port })
  await h.configure([rule], true)
  const target = `https://origin.test:${h.port}/inspection?api_key=fixture-secret`
  const inspected = await h.ctx.securityProxy.environment(h.agent, 'fixture')
  const opaque = await h.ctx.securityProxy.environment(h.agent, 'other-fixture')
  expect(inspected?.DSH_SECURITY_PROXY_CA_PEM).toMatch(/^-----BEGIN CERTIFICATE-----/u)
  expect(opaque).not.toHaveProperty('DSH_SECURITY_PROXY_CA_PEM')
  const sidebar = await h.ctx.securityProxy.environment(h.agent, 'sidebar_browser')
  if (sidebar?.HTTP_PROXY === undefined) throw new Error('missing sidebar listener')
  const trust = await h.ctx.securityProxy.browserTrust(h.agent, sidebar.HTTP_PROXY)
  expect(trust).toBe(sidebar.DSH_SECURITY_PROXY_CA_PEM)
  expect(trust).not.toBe(inspected?.DSH_SECURITY_PROXY_CA_PEM)
  const before = h.counts()
  expect(await processTraffic(opaque, 'https', target)).toMatchObject({ status: 403 })
  expect(h.counts()).toEqual(before)
  const fixtureBody: unknown = expect.stringContaining('guarded fixture')
  expect(await processTraffic(inspected, 'https', target)).toMatchObject({ status: 200, text: fixtureBody })
  expect(h.tunnels).toEqual([`127.0.0.1:${h.port}`])
  const flow = (await h.ctx.securityProxy.list({})).flows.find(row => row.kind === 'http' && row.status === 200)
  expect(flow).toMatchObject({ sessionId: h.agent.id, tool: 'fixture', outcome: 'complete' })
  expect(flow?.target).not.toContain('fixture-secret')
  tls.setDefaultCACertificates(original)
  expect(await processTraffic(inspected, 'https', target)).toMatchObject({ status: 502 })
  const admitted = h.counts()
  await h.configure([production({ port: h.port })])
  expect(await processTraffic(inspected, 'https', target)).toMatchObject({ status: 403 })
  expect(h.counts()).toEqual(admitted)
})

it('attributes concurrent external processes to their issued listeners and leaves Host checks unassigned', async () => {
  const h = await harness(true, true)
  const side = await h.ctx.agents.create({ sessionId: SessionId('guarded-side'),
    meta: { agentPreset: 'security', parentSession: h.agent.id } })
  const unrelated = await h.ctx.agents.create({ sessionId: SessionId('unrelated-initiator') })
  const issue = (agent: Agent) => h.ctx.agents.withInitiator(unrelated.agent, () => h.ctx.securityProxy.environment(agent, 'delegate'))
  const [mainRoute, sideRoute] = await Promise.all([issue(h.agent), issue(side.agent)])
  const entered = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  h.unblock.push(() => { release.resolve(true) })
  let waiting = 0
  h.respond(async (_request, response) => {
    if (++waiting === 2) entered.resolve(true)
    await release.promise
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('audited relay')
  })
  const requests = Promise.all([processTraffic(mainRoute, 'http', h.url), processTraffic(sideRoute, 'http', h.url)])
  await Promise.race([entered.promise, requests.then(() => { throw new Error('Traffic ended before reaching the concurrency barrier') })])
  release.resolve(true)
  expect(await requests).toEqual([{ status: 200, body: 'audited relay' }, { status: 200, body: 'audited relay' }])
  for (const agent of [h.agent, side.agent]) {
    const records = agent.session.snapshotEvents().filter(event => event.type === 'target/admission')
    expect(records).toHaveLength(1)
    expect(records[0]?.data).toMatchObject({ source: { sessionId: agent.id }, decision: 'allow', operation: 'proxy-http' })
  }
  expect(side.agent.session.snapshotEvents().find(event => event.type === 'target/admission')?.data.source?.parentSessionId).toBe(h.agent.id)
  expect(unrelated.agent.session.snapshotEvents().filter(event => event.type === 'target/admission')).toEqual([])
  const before = h.counts()
  await h.configure([production()])
  expect(await processTraffic(sideRoute, 'http', h.url)).toMatchObject({ status: 403 })
  expect(h.counts()).toEqual(before)
  expect(h.ctx.targetProtection.auditHistory().entries[0]).toMatchObject({ source: { sessionId: side.agent.id },
    code: 'TARGET_FULLY_PROTECTED', decision: 'deny' })
  await h.ctx.agents.withInitiator(unrelated.agent, () => h.ctx.securityProxy.test())
  expect(h.ctx.targetProtection.auditHistory().entries[0]).not.toHaveProperty('source')
  expect(unrelated.agent.session.snapshotEvents().filter(event => event.type === 'target/admission')).toEqual([])
})

it('attributes an external CONNECT client and withdraws its listener after leaving Security mode', async () => {
  const h = await harness(true, true)
  await h.configure([production({ environment: 'test', address: '127.0.0.1', port: h.port })])
  const route = await h.ctx.securityProxy.environment(h.agent, 'external-browser')
  const result = await processTraffic(route, 'connect', `127.0.0.1:${h.port}`)
  expect(result).toContain('200 Connection Established')
  expect(result).toContain('guarded fixture')
  expect(h.agent.session.snapshotEvents().filter(event => event.type === 'target/admission').map(event => event.data))
    .toContainEqual(expect.objectContaining({ decision: 'allow', operation: 'proxy-http', source: { sessionId: h.agent.id } }))
  h.agent.session.append('agent-preset/selected', { agentPreset: 'standard' })
  expect((await h.ctx.securityProxy.get()).listeners).toBe(0)
  const before = h.counts()
  await expect(processTraffic(route, 'connect', `127.0.0.1:${h.port}`)).rejects.toBeDefined()
  expect(h.counts()).toEqual(before)
  expect(await h.ctx.securityProxy.environment(h.agent, 'external-browser')).toBeUndefined()
})

it('refuses production before either upstream or target connections, including direct service calls', async () => {
  const h = await harness()
  await h.configure([production()])
  await expect(h.fetch()).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect((await throughChain(await h.chain(), h.url)).status).toBe(403)
  expect(await h.ctx.securityProxy.test()).toMatchObject({ ok: false, state: { status: 'failed' } })
  expect(h.counts()).toEqual({ targetConnections: 0, proxyConnections: 0 })
  expect((await h.ctx.securityProxy.list({})).flows.map(flow => flow.note)).toEqual([
    'TARGET_FULLY_PROTECTED', 'TARGET_FULLY_PROTECTED',
  ])
})

it('binds an exact test exception to literal CONNECT while preserving Host, method, body and capture', async () => {
  const h = await harness()
  await h.configure([production({ environment: 'test' })], true)
  expect((await h.fetch()).body.content).toBe('guarded fixture')
  expect(await throughChain(await h.chain(), h.url, 'test payload')).toEqual({ status: 200, body: 'test payload' })
  expect(h.tunnels).toEqual([`127.0.0.1:${h.port}`, `127.0.0.1:${h.port}`])
  expect(h.seen).toEqual([
    { method: 'GET', host: `origin.test:${h.port}`, body: '', proxyAuthorization: undefined },
    { method: 'POST', host: `origin.test:${h.port}`, body: 'test payload', proxyAuthorization: undefined },
  ])
  const flows = await h.ctx.securityProxy.list({})
  expect(flows.flows).toHaveLength(2)
  const relay = flows.flows.find(flow => flow.origin === 'proxy')
  if (relay === undefined) throw new Error('relay capture missing')
  expect(await h.ctx.securityProxy.detail(relay.id)).toMatchObject({ requestBody: 'test payload', responseBody: 'test payload' })
  const before = h.counts()
  expect((await throughChain(await h.chain(), h.url, '', 'other.test')).status).toBe(403)
  expect(h.counts()).toEqual(before)
})

it('reaches an owner-selected private test server through the real resolver and captures its response', async () => {
  const h = await harness(true)
  await h.configure([production({ environment: 'test', port: h.port })], true)
  expect(await throughChain(await h.chain(), h.url, 'private test payload')).toEqual({ status: 200, body: 'private test payload' })
  expect((await h.fetch()).body.content).toBe('guarded fixture')
  expect(await h.ctx.securityProxy.test()).toMatchObject({ ok: true, state: { status: 'ready' } })
  expect(h.tunnels.every(target => target === `127.0.0.1:${h.port}`)).toBe(true)
  const rows = (await h.ctx.securityProxy.list({})).flows
  const flow = rows.find(row => row.origin === 'proxy')
  if (flow === undefined) throw new Error('Private test response was not recorded')
  expect(await h.ctx.securityProxy.detail(flow.id)).toMatchObject({ requestBody: 'private test payload', responseBody: 'private test payload' })
  const count = h.counts()
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'WEB_BLOCKED_URL' })
  expect(h.counts()).toEqual(count)
})

it.each(['absent', 'disabled', 'database', 'domain', 'other-port'] as const)(
  'does not widen private proxy access for a %s test selector', async (kind) => {
    const h = await harness(true)
    const rule = production({ environment: 'test', port: h.port })
    if (kind === 'disabled') rule.enabled = false
    if (kind === 'database') { rule.kind = 'database'; rule.database = 'owned' }
    if (kind === 'domain') rule.kind = 'domain'
    if (kind === 'other-port') rule.port = h.port === 65535 ? h.port - 1 : h.port + 1
    await h.configure(kind === 'absent' ? [] : [rule])
    await expect(h.fetch()).rejects.toMatchObject({ code: 'WEB_BLOCKED_URL' })
    expect(h.counts()).toEqual({ targetConnections: 0, proxyConnections: 0 })
  },
)

it.each(['full', 'audit'] as const)('keeps production %s stronger than private test access', async (protection) => {
  const h = await harness(true)
  await h.configure([production({ environment: 'test', port: h.port }),
    production({ id: 'f5b044e3-8bf8-440f-840c-5351f794fe3c' as TargetRuleId, address: '127.0.0.1', port: h.port, protection })], true)
  await expect(h.fetch()).rejects.toMatchObject({ code: protection === 'full' ? 'TARGET_FULLY_PROTECTED' : 'TARGET_READ_ONLY' })
  expect(h.counts()).toEqual({ targetConnections: 0, proxyConnections: 0 })
})

it('does not carry a private test exception to an unlisted redirect authority', async () => {
  const h = await harness(true)
  h.respond(async (_request, response) => {
    response.writeHead(302, { location: `http://127.0.0.1:${h.port}/redirected` }); response.end()
  })
  await expect(h.fetch()).rejects.toMatchObject({ code: 'WEB_REDIRECT_BLOCKED' })
  expect(h.tunnels).toHaveLength(1)
  expect(h.counts()).toEqual({ targetConnections: 1, proxyConnections: 1 })
})

it('allows an explicit private server alias without allowing unrelated ports', async () => {
  const h = await harness(true)
  await h.configure([production({ address: 'unused.test', environment: 'test', port: h.port,
    aliases: [{ match: 'host', address: 'origin.test', port: h.port }] })])
  expect((await h.fetch()).body.content).toBe('guarded fixture')
  expect(h.tunnels).toEqual([`127.0.0.1:${h.port}`])
})

it('refuses a private exception revoked by another registry connection during resolution', async () => {
  const h = await harness(true)
  const resolve = h.ctx.targetProtection.resolveConnectionTarget.bind(h.ctx.targetProtection)
  vi.spyOn(h.ctx.targetProtection, 'resolveConnectionTarget').mockImplementation(async (...args) => {
    const result = await resolve(...args)
    const store = await TargetStore.open(h.rulesPath, 1000)
    try { store.configure({ mainlandEnabled: false, rules: [] }, store.snapshot().revision) } finally { store.close() }
    return result
  })
  await expect(h.fetch()).rejects.toMatchObject({ code: 'TARGET_POLICY_CHANGED' })
  expect(h.counts()).toEqual({ targetConnections: 0, proxyConnections: 0 })
})

it('honors authorization vetoes for default HTTP and HTTPS ports before opening a route', async () => {
  const h = await harness(true)
  h.ctx.on('web-fetch/authorize', async () => ({ reason: 'fixture veto' }))
  for (const url of ['http://origin.test/', 'https://origin.test/']) {
    await expect(h.ctx.securityProxy.fetchTarget(h.agent, url, new AbortController().signal)).rejects.toMatchObject({ code: 'WEB_TARGET_PROTECTED' })
  }
  const chain = await h.chain()
  expect((await throughChain(chain, h.url)).status).toBe(403)
  expect(await throughTunnel(chain, `origin.test:${h.port}`)).toContain('403 Forbidden')
  expect(h.counts()).toEqual({ targetConnections: 0, proxyConnections: 0 })
})

it('strips caller proxy credentials while retaining an authenticated upstream route', async () => {
  const h = await harness(true)
  await h.ctx.securityProxy.setPassword('fixture-secret')
  await h.ctx.securityProxy.configure({ authEnabled: true, username: 'fixture-user' })
  const engine = h.engine(), transport = await engine['ensureTransport']()
  const exchange = await engine['requestHttp'](transport.upstream, transport.dispatcher, new URL(h.url), {
    method: 'GET', headers: { host: new URL(h.url).host, 'proxy-authorization': 'must-not-reach-origin' },
  }, new AbortController().signal)
  try { expect(await exchange.response.text()).toBe('guarded fixture') } finally { await exchange.close() }
  expect(h.seen.at(-1)?.proxyAuthorization).toBeUndefined()
})

it('rejects an empty destination and an opaque IPv6 authority without opening upstream traffic', async () => {
  const h = await harness()
  vi.spyOn(h.ctx.targetProtection, 'resolveHttpTarget').mockResolvedValue({ hostname: 'origin.test', names: ['origin.test'], addresses: [], source: 'dns' })
  expect(await h.ctx.securityProxy.test()).toMatchObject({ ok: false })
  vi.restoreAllMocks()
  const engine = h.engine(), transport = await engine['ensureTransport']()
  await expect(engine['openTunnel'](transport.upstream, '::1', 443, new AbortController().signal))
    .rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(h.counts()).toEqual({ targetConnections: 0, proxyConnections: 0 })
})

it('checks each redirect against another connection’s committed rules', async () => {
  const h = await harness()
  let requests = 0
  h.respond(async (_request, response) => {
    requests++
    const store = await TargetStore.open(h.rulesPath, 1000)
    try { store.configure({ mainlandEnabled: false, rules: [production()] }, store.snapshot().revision) }
    finally { store.close() }
    response.writeHead(302, { location: '/after-change' }); response.end()
  })
  await expect(h.fetch('redirect')).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(requests).toBe(1)
  expect(h.tunnels).toHaveLength(1)
})

it.each([false, true])('settles a probe whose socket closed before the consumer resumed (reset=%s)', async (reset) => {
  const h = await harness()
  const open = ProxyHost.connectThrough
  vi.spyOn(ProxyHost, 'connectThrough').mockImplementation(async (...args) => {
    const tunnel = await open(...args)
    await new Promise<void>((resolve) => {
      tunnel.socket.once('close', () => { resolve() })
      tunnel.socket.destroy(reset ? new Error('fixture target reset') : undefined)
    })
    return tunnel
  })
  expect(await h.ctx.securityProxy.test()).toMatchObject({ ok: !reset, state: { status: reset ? 'failed' : 'ready' } })
})

it('refuses an opaque tunnel before forwarding bytes even when its named endpoint is a test exception', async () => {
  const h = await harness()
  await h.configure([production({ environment: 'test' })], true)
  const reply = await throughTunnel(await h.chain(), `origin.test:${h.port}`)
  expect(reply).toContain('403 Forbidden')
  expect(h.counts()).toEqual({ targetConnections: 0, proxyConnections: 0 })
  expect((await h.ctx.securityProxy.list({})).flows[0]?.note).toBe('TARGET_EXECUTION_UNCONFINED')
})

it('forwards opaque bytes only to the literal IP and port authorized as a test server', async () => {
  const h = await harness(true)
  const endpoint = `127.0.0.1:${h.port}`
  const rule = production({ address: '127.0.0.1', environment: 'test', port: h.port })
  await h.configure([rule], true)
  const request = `GET / HTTP/1.1\r\nHost: ${endpoint}\r\nConnection: close\r\n\r\n`
  const reply = await throughTunnel(await h.chain(), endpoint, request)
  expect(reply).toContain('200 Connection Established')
  expect(reply).toContain('guarded fixture')
  expect(h.tunnels).toEqual([endpoint])
  expect(h.counts()).toEqual({ targetConnections: 1, proxyConnections: 1 })
  await vi.waitFor(async () => {
    const { flows } = await h.ctx.securityProxy.list({})
    expect(flows).toContainEqual(expect.objectContaining({
      kind: 'tunnel', target: endpoint, status: null, note: 'tunnel-metadata-only', requestBytes: Buffer.byteLength(request),
    }))
  })
})

it.each(['other port', 'database selector', 'production alias'] as const)('refuses a literal tunnel for %s before dialing', async (caseName) => {
  const h = await harness(true)
  const literal = { address: '127.0.0.1', environment: 'test' as const, port: h.port }
  const rule = production(caseName === 'other port' ? { ...literal, port: 1 }
    : caseName === 'database selector' ? { ...literal, kind: 'database', database: 'sandbox' } : literal)
  const blocked = production({ id: '6b344b4a-5882-43f2-90ac-6752f0237bad' as TargetRuleId, port: h.port })
  await h.configure(caseName === 'production alias' ? [rule, blocked] : [rule])
  const reply = await throughTunnel(await h.chain(), `127.0.0.1:${h.port}`)
  expect(reply).toContain('403 Forbidden')
  expect(h.counts()).toEqual({ targetConnections: 0, proxyConnections: 0 })
})

it('closes a live literal tunnel when its test-server rule is revoked', async () => {
  const h = await harness(true)
  const endpoint = `127.0.0.1:${h.port}`
  await h.configure([production({ address: '127.0.0.1', environment: 'test', port: h.port })])
  const proxyPort = await h.chain()
  const external = await TargetStore.open(h.rulesPath, 0)
  const { revision } = external.snapshot()
  const opened = Promise.withResolvers<string>()
  const closed = Promise.withResolvers<undefined>()
  const socket = connect(proxyPort, '127.0.0.1', () => {
    socket.write(`CONNECT ${endpoint} HTTP/1.1\r\nHost: ${endpoint}\r\n\r\n`)
  })
  socket.setTimeout(5_000, () => { socket.destroy(new Error('Fixture tunnel did not close')) })
  let response = ''
  socket.on('data', (chunk: Buffer) => {
    response += chunk.toString('utf8')
    if (response.includes('\r\n\r\n')) opened.resolve(response)
  })
  socket.once('error', opened.reject)
  socket.once('close', () => {
    opened.reject(new Error('Fixture tunnel closed before its response'))
    closed.resolve(undefined)
  })
  try {
    expect(await opened.promise).toContain('200 Connection Established')
    expect(() => external.configure({ rules: [], mainlandEnabled: false }, revision)).toThrow(expect.objectContaining({ code: 'busy' }))
    await h.configure([])
    await closed.promise
    expect(await throughTunnel(await h.chain(), endpoint)).toContain('403 Forbidden')
    expect(h.counts()).toEqual({ targetConnections: 1, proxyConnections: 1 })
  } finally {
    socket.destroy()
    external.close()
  }
})

it('aborts a streaming target when policy changes and withdraws both guarded consumers', async () => {
  const h = await harness()
  const reached = Promise.withResolvers<boolean>(), closed = Promise.withResolvers<boolean>()
  h.respond((_request, response) => {
    response.once('close', () => { closed.resolve(true) })
    response.writeHead(200, { 'content-type': 'text/plain' }); response.write('partial')
    reached.resolve(true)
    return Promise.resolve()
  })
  const request = h.fetch()
  const outcome = request.catch((error: unknown) => error)
  await reached.promise
  await h.configure([production()])
  expect(await outcome).toBeInstanceOf(Error)
  await closed.promise
  const previous = h.ctx.securityProxy
  const entry = [...h.ctx.loader.entries()].find(entry => entry.options.id === 'protection')
  if (entry?.fiber === undefined) throw new Error('rule owner missing')
  await entry.fiber.dispose()
  await h.ctx.loader.await()
  expect(h.ctx.get('securityProxy')).toBeUndefined()
  await expect(previous.fetchTarget(h.agent, h.url, new AbortController().signal)).rejects.toBeDefined()
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
  expect(h.tunnels).toHaveLength(1)
})

it('retains the rule store until the proxy dispatcher has actually finished cleanup', async () => {
  const h = await harness()
  const cleanupStarted = Promise.withResolvers<boolean>(), cleanupAllowed = Promise.withResolvers<boolean>()
  onTestFinished(() => { cleanupAllowed.resolve(true) })
  const native = Http.requestPinnedViaProxy
  vi.spyOn(Http, 'requestPinnedViaProxy').mockImplementation(async (...args) => {
    const exchange = await native(...args)
    return { response: exchange.response, close: async () => {
      cleanupStarted.resolve(true); await cleanupAllowed.promise; await exchange.close()
    } }
  })
  const closed = vi.spyOn(TargetStore.prototype, 'close')
  const request = h.fetch()
  const outcome = request.catch((error: unknown) => error)
  await cleanupStarted.promise
  const stopping = Promise.withResolvers<boolean>()
  const engine = h.engine(), dispose = engine.dispose.bind(engine)
  vi.spyOn(engine, 'dispose').mockImplementation(() => {
    const result = dispose()
    stopping.resolve(true)
    return result
  })
  const shutdown = h.ctx.fiber.dispose()
  try {
    await Promise.race([stopping.promise, shutdown.then(() => { throw new Error('Owner closed before dispatcher cleanup') })])
    expect(closed).not.toHaveBeenCalled()
  } finally { cleanupAllowed.resolve(true); await Promise.all([outcome, shutdown]) }
  expect(closed).toHaveBeenCalledOnce()
})

it('cancels the old proxy route on disable without silently switching the active request to a direct connection', async () => {
  const h = await harness()
  const reached = Promise.withResolvers<boolean>(), closed = Promise.withResolvers<boolean>()
  h.respond((_request, response) => {
    response.once('close', () => { closed.resolve(true) })
    response.writeHead(200, { 'content-type': 'text/plain' }); response.write('pending')
    reached.resolve(true)
    return Promise.resolve()
  })
  const outcome = h.fetch().catch((error: unknown) => error)
  await reached.promise
  expect((await h.ctx.securityProxy.configure({ enabled: false })).status).toBe('off')
  expect(await outcome).toBeInstanceOf(Error)
  await closed.promise
  await h.configure([production()])
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.counts()).toEqual({ targetConnections: 1, proxyConnections: 1 })
})

it('closes the protected upstream when a relay client leaves before the response finishes', async () => {
  const h = await harness()
  const closed = Promise.withResolvers<boolean>()
  h.respond((_request, response) => {
    response.once('close', () => { closed.resolve(true) })
    response.writeHead(200, { 'content-type': 'text/plain' }); response.write('partial')
    return Promise.resolve()
  })
  const port = await h.chain()
  await new Promise<void>((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path: h.url, headers: { host: new URL(h.url).host } }, (response) => {
      response.once('close', () => { resolve() })
      response.destroy()
    })
    request.on('error', reject)
    request.end()
  })
  await closed.promise
  await vi.waitFor(async () => { expect((await h.ctx.securityProxy.list({})).flows[0]?.outcome).toBe('error') })
})
