/** Literal proxy tunnels retain origin identity and cannot fall back to direct transport. @module */
import { createServer, type Server } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { connect, type AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { generate } from 'selfsigned'
import type { ProxyAgent } from 'undici'
import { installProxyFromEnvironment } from '@deepseek-ai/dsh-http-proxy'
import { afterEach, expect, it, vi } from 'vitest'
import { requestPinnedViaProxy } from '../src/network.ts'
import { HttpFetchProvider, type HttpFetchLimits } from '../src/provider.ts'
import type { HttpFetchDestination } from '../src/authorization.ts'

const trust = vi.hoisted(() => ({ ca: '' }))
vi.mock('undici', async (original) => {
  const actual = await original<typeof import('undici')>()
  return { ...actual, ProxyAgent: class extends actual.ProxyAgent {
    constructor(options: ProxyAgent.Options | string) {
      if (typeof options === 'string') throw new Error('Expected explicit proxy options')
      super({ ...options, ...trust.ca === '' ? {} : { requestTls: { ...options.requestTls, ca: trust.ca } } })
    }
  } }
})

const servers: Server[] = [], sockets = new Set<Duplex>()
const restorers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const restore of restorers.splice(0)) await restore()
  vi.restoreAllMocks()
  trust.ca = ''
  for (const socket of sockets) socket.destroy()
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })))
})
async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return (server.address() as AddressInfo).port
}
function own(socket: Duplex): void {
  sockets.add(socket); socket.once('close', () => { sockets.delete(socket) }); socket.on('error', () => { socket.destroy() })
}
async function tunnel(deny = false) {
  const destinations: string[] = []
  const authorizations: (string | undefined)[] = []
  const server = createServer((_req, res) => { res.writeHead(405); res.end() })
  server.on('connect', (request, client, head) => {
    own(client)
    const target = request.url ?? ''; destinations.push(target)
    authorizations.push(request.headers['proxy-authorization'])
    if (deny) { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return }
    if (!/^127\.0\.0\.1:\d+$/u.test(target)) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
    const upstream = connect({ host: '127.0.0.1', port: Number(target.split(':')[1]) })
    own(upstream)
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      client.pipe(upstream); upstream.pipe(client)
    })
    client.once('close', () => { upstream.destroy() }); upstream.once('close', () => { client.destroy() })
  })
  return { url: `http://127.0.0.1:${String(await listen(server))}`, destinations, authorizations }
}
const limits: HttpFetchLimits = { maxResponseBytes: 10000, maxBodyChars: 10000, timeoutMs: 3000, maxRedirects: 2, userAgent: 'fixture' }

it('CONNECTs to the checked literal IP while preserving the original HTTP Host and URL', async () => {
  let host: string | undefined
  const port = await listen(createServer((req, res) => { host = req.headers.host; res.setHeader('content-type', 'text/plain'); res.end('bound') }))
  const proxy = await tunnel()
  restorers.push(await installProxyFromEnvironment({ get: name => name === 'HTTP_PROXY' ? { value: proxy.url } : undefined }, () => {}))
  const observed: HttpFetchDestination[] = []
  const resolver = vi.fn(async () => [{ address: '127.0.0.1', family: 4 as const }])
  const provider = new HttpFetchProvider(limits, resolver, async (destination) => { observed.push(destination) }, 'literal-connect')
  const url = `http://origin.test:${String(port)}/page?fixture=1`
  const result = await provider.fetch({ url })
  expect(result.body.content).toBe('bound')
  expect(result.url).toBe(url)
  expect(host).toBe(`origin.test:${String(port)}`)
  expect(proxy.destinations).toEqual([`127.0.0.1:${String(port)}`])
  expect(observed[1]).toMatchObject({ route: 'proxy', binding: 'literal-connect', addresses: [{ address: '127.0.0.1', family: 4 }] })
  expect(resolver).toHaveBeenCalledOnce()
})

it('never opens a proxy tunnel after a connection policy refuses the pinned address', async () => {
  const proxy = await tunnel()
  restorers.push(await installProxyFromEnvironment({ get: name => name === 'HTTP_PROXY' ? { value: proxy.url } : undefined }, () => {}))
  const provider = new HttpFetchProvider(limits, async () => [{ address: '127.0.0.1', family: 4 }], async (destination) => {
    if (destination.phase === 'before-connect') throw new Error('fixture refusal')
  }, 'literal-connect')
  await expect(provider.fetch({ url: 'http://origin.test:8080/' })).rejects.toBeDefined()
  expect(proxy.destinations).toEqual([])
})

it('keeps origin TLS name validation through a literal CONNECT tunnel', async () => {
  const material = generate([{ name: 'commonName', value: 'origin.test' }], { keySize: 2048, days: 1, algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'origin.test' }] }],
  })
  let servername: string | undefined, host: string | undefined
  const server = createHttpsServer({ key: material.private, cert: material.cert }, (req, res) => { host = req.headers.host; res.end('TLS origin') })
  server.on('secureConnection', (socket) => { servername = socket.servername || undefined })
  server.on('tlsClientError', () => {})
  const port = await listen(server), proxy = await tunnel()
  trust.ca = material.cert
  const response = await requestPinnedViaProxy(proxy.url, new URL(`https://origin.test:${String(port)}/`),
    [{ address: '127.0.0.1', family: 4 }], {}, AbortSignal.timeout(3000))
  try { expect(await response.response.text()).toBe('TLS origin') } finally { await response.close() }
  expect(servername).toBe('origin.test')
  expect(host).toBe(`origin.test:${String(port)}`)
  await expect(requestPinnedViaProxy(proxy.url, new URL(`https://wrong.test:${String(port)}/`),
    [{ address: '127.0.0.1', family: 4 }], {}, AbortSignal.timeout(3000))).rejects.toBeDefined()
})

it('reports a failed proxy without opening a direct origin connection', async () => {
  let requests = 0
  const port = await listen(createServer((_req, res) => { requests++; res.end('must not run') }))
  const proxy = await tunnel(true)
  await expect(requestPinnedViaProxy(proxy.url, new URL(`http://origin.test:${String(port)}/`),
    [{ address: '127.0.0.1', family: 4 }], {}, AbortSignal.timeout(3000))).rejects.toBeDefined()
  expect(proxy.destinations).toEqual([`127.0.0.1:${String(port)}`])
  expect(requests).toBe(0)
})

it('resolves and rechecks the original authority at each proxy redirect', async () => {
  let requests = 0, protectedNow = false
  const port = await listen(createServer((_req, res) => {
    requests++; protectedNow = true
    res.writeHead(302, { location: '/next' }); res.end()
  }))
  const proxy = await tunnel()
  restorers.push(await installProxyFromEnvironment({ get: name => name === 'HTTP_PROXY' ? { value: proxy.url } : undefined }, () => {}))
  const provider = new HttpFetchProvider(limits, async () => [{ address: '127.0.0.1', family: 4 }], async () => {
    if (protectedNow) throw new Error('fixture policy changed')
  }, 'literal-connect')
  await expect(provider.fetch({ url: `http://origin.test:${String(port)}/` })).rejects.toBeDefined()
  expect(proxy.destinations).toEqual([`127.0.0.1:${String(port)}`])
  expect(requests).toBe(1)
})

it('sends proxy credentials only to CONNECT and never to the origin', async () => {
  let originAuthorization: string | undefined, originHost: string | undefined
  const port = await listen(createServer((req, res) => {
    originAuthorization = req.headers['proxy-authorization']; originHost = req.headers.host; res.end('origin')
  }))
  const proxy = await tunnel()
  const authenticated = new URL(proxy.url); authenticated.username = 'fixture'; authenticated.password = 'fixture-password'
  const response = await requestPinnedViaProxy(authenticated.href, new URL(`http://origin.test:${String(port)}/`),
    [{ address: '127.0.0.1', family: 4 }], { Host: 'other.test', 'Proxy-Authorization': 'must-not-reach-origin' }, AbortSignal.timeout(3000))
  try { expect(await response.response.text()).toBe('origin') } finally { await response.close() }
  expect(proxy.authorizations).toEqual([`Basic ${Buffer.from('fixture:fixture-password').toString('base64')}`])
  expect(originAuthorization).toBeUndefined()
  expect(originHost).toBe(`origin.test:${String(port)}`)
})

it('encodes an IPv6 destination as one literal CONNECT authority', async () => {
  const proxy = await tunnel()
  await expect(requestPinnedViaProxy(proxy.url, new URL('https://origin.test/'),
    [{ address: '::1', family: 6 }], {}, AbortSignal.timeout(3000))).rejects.toBeDefined()
  expect(proxy.destinations).toEqual(['[::1]:443'])
})

it('cancels a body still arriving through the private tunnel and closes its dispatcher', async () => {
  const port = await listen(createServer((_req, res) => { res.writeHead(200); res.write('pending') }))
  const proxy = await tunnel(), abort = new AbortController()
  const fetched = await requestPinnedViaProxy(proxy.url, new URL(`http://origin.test:${String(port)}/`),
    [{ address: '127.0.0.1', family: 4 }], {}, abort.signal)
  try {
    const rejected = expect(fetched.response.text()).rejects.toBeDefined()
    abort.abort()
    await rejected
  } finally { await fetched.close() }
  expect(proxy.destinations).toEqual([`127.0.0.1:${String(port)}`])
})
