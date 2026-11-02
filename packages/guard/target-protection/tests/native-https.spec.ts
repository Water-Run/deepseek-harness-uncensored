/** Real TLS and HTTP parsing over owned CONNECT sockets, with no machine trust changes. @module */
import { request, IncomingMessage } from 'node:http'
import { connect as connectTls, type TLSSocket } from 'node:tls'
import { createServer, type AddressInfo, Socket } from 'node:net'
import { once } from 'node:events'
import { X509Certificate } from 'node:crypto'
import { SessionChainProxy, type ChainOptions } from '@deepseek-ai/dsh-security-proxy-local'
import { expect, it, onTestFinished, vi } from 'vitest'
import { bindNativeHttpsRequest, createNativeHttps, type NativeHttpsOptions } from '../src/native-https.ts'
import { generate } from 'selfsigned'
import { Response } from 'undici'

vi.mock('selfsigned', async (original) => {
  const actual = await original<typeof import('selfsigned')>()
  return { ...actual, generate: vi.fn(actual.generate) }
})

const defaults: NativeHttpsOptions = { maxCertificates: 8, certificateLifetimeMs: 60000, handshakeTimeoutMs: 2000, requestTimeoutMs: 3000 }

it('refuses a parsed request without a target', () => {
  const socket = new Socket(), request = new IncomingMessage(socket)
  request.url = undefined
  request.headers.host = 'target.test'; request.rawHeaders = ['Host', 'target.test']
  try { expect(() => { bindNativeHttpsRequest(request, new URL('https://target.test/')) }).toThrow() }
  finally { socket.destroy() }
})

async function fixture(options: Partial<NativeHttpsOptions> = {}) {
  const controller = new AbortController(), https = await createNativeHttps({ ...defaults, ...options }, controller.signal)
  const sockets = new Set<Socket>(), seen: { url: string; method: string; body: string }[] = []
  const flows: Parameters<NonNullable<ChainOptions['capture']>['append']>[0][] = []
  let retained = 0, opaque = 0
  const proxy = await SessionChainProxy.start({
    sessionId: null, tool: () => 'fixture', signal: () => controller.signal,
    retainExecution: () => { retained++; return () => { retained-- } },
    inspectTunnel: (host, port, signal) => https.prepare(host, port, signal),
    openTunnel: async () => { opaque++; throw new Error('Opaque forwarding must not be used.') },
    async requestHttp(url, incoming) {
      const body = incoming.body === undefined ? '' : new TextDecoder().decode(incoming.body)
      seen.push({ url: url.href, method: incoming.method, body })
      return { response: new Response(body || 'HTTPS response'), close: async () => {} }
    },
    capture: { append(flow) { flows.push(flow); return undefined } }, paused: () => false, timeoutMs: 3000,
  })
  const own = <T extends Socket>(socket: T): T => {
    sockets.add(socket); socket.on('error', () => { socket.destroy() }); socket.once('close', () => { sockets.delete(socket) }); return socket
  }
  onTestFinished(async () => {
    await proxy.close()
    await Promise.all([...sockets].map(socket => new Promise<void>((resolve) => {
      if (socket.closed) resolve()
      else { socket.once('close', () => { resolve() }); socket.destroy() }
    })))
    vi.restoreAllMocks()
    expect(retained).toBe(0)
    expect(opaque).toBe(0)
  })
  const tunnel = (authority = 'target.test:443') => new Promise<Socket>((resolve, reject) => {
    const req = request(`http://127.0.0.1:${proxy.port}`, { method: 'CONNECT', path: authority, signal: AbortSignal.timeout(10000) })
    req.on('error', reject)
    req.once('connect', (response, socket) => {
      own(socket)
      if (response.statusCode !== 200) { socket.destroy(); reject(new Error(`CONNECT ${response.statusCode}`)); return }
      resolve(socket)
    })
    req.end()
  })
  const tls = async (serverName = 'target.test', authority = 'target.test:443', alpn = ['http/1.1'], trust = true): Promise<TLSSocket> => {
    const raw = await tunnel(authority)
    const secure = own(connectTls({ socket: raw, host: authority.split(':')[0], servername: serverName,
      ...trust ? { ca: https.certificate } : {}, ALPNProtocols: alpn }))
    await once(secure, 'secureConnect')
    return secure
  }
  const exchange = async (text: string, authority?: string, serverName?: string) => {
    const socket = await tls(serverName, authority)
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    const closed = once(socket, 'close')
    socket.write(text)
    await closed
    return Buffer.concat(chunks).toString()
  }
  return { https, proxy, controller, seen, flows, tunnel, tls, exchange, retained: () => retained }
}

it('forwards inspected HTTPS with method, body, canonical authority and captured plaintext', async () => {
  const h = await fixture()
  const result = await h.exchange('POST /test?x=1 HTTP/1.1\r\nHost: target.test\r\nConnection: close\r\nContent-Length: 5\r\n\r\nhello')
  expect(result).toContain('200 OK')
  expect(result).toContain('hello')
  expect(h.seen).toEqual([{ url: 'https://target.test/test?x=1', method: 'POST', body: 'hello' }])
  await vi.waitFor(() => { expect(h.retained()).toBe(0) })
  await h.proxy.close()
  expect(h.flows).toMatchObject([{ kind: 'http', target: 'https://target.test/test?x=1', requestBody: 'hello', responseBody: 'hello' }])
  expect(h.https.certificate).not.toContain('PRIVATE KEY')
})

it.each([
  'GET / HTTP/1.1\r\nHost: production.test\r\n',
  'GET https://production.test/ HTTP/1.1\r\nHost: target.test\r\n',
  'GET https://owner:secret@target.test/ HTTP/1.1\r\nHost: target.test\r\n',
  'GET https://:secret@target.test/ HTTP/1.1\r\nHost: target.test\r\n',
  'GET //production.test/ HTTP/1.1\r\nHost: target.test\r\n',
  'GET /#fragment HTTP/1.1\r\nHost: target.test\r\n',
  'GET / HTTP/1.1\r\nHost: target.test/other\r\n',
  'GET / HTTP/1.1\r\nHost: target.test\r\nHost: production.test\r\n',
  'GET / HTTP/1.0\r\n',
])('refuses an unverified HTTP authority before any upstream operation: %s', async (request) => {
  const h = await fixture()
  expect(await h.exchange(request + 'Connection: close\r\n\r\n')).toContain('403 Forbidden')
  expect(h.seen).toEqual([])
})

it('accepts explicit default port and same-authority absolute URLs', async () => {
  const h = await fixture()
  expect(await h.exchange('GET https://target.test/a HTTP/1.1\r\nHost: target.test:443\r\nConnection: close\r\n\r\n')).toContain('200 OK')
})

it('refuses a different TLS name for a named CONNECT target', async () => {
  const h = await fixture()
  await expect(h.tls('production.test')).rejects.toBeDefined()
  expect(h.seen).toEqual([])
})

it('rejects an invalid TLS server name before forwarding', async () => {
  const h = await fixture()
  await expect(h.tls('bad name')).rejects.toBeDefined()
  expect(h.seen).toEqual([])
})

it('closes a named CONNECT without SNI before any application request', async () => {
  const h = await fixture(), socket = await h.tls('')
  const closed = new Promise<void>((resolve) => { socket.once('close', () => { resolve() }) })
  socket.resume(); socket.write('GET / HTTP/1.1\r\nHost: target.test\r\n\r\n')
  await closed
  expect(h.seen).toEqual([])
})

it('joins key generation before reporting cancellation', async () => {
  const controller = new AbortController(), pending = createNativeHttps(defaults, controller.signal)
  controller.abort(new Error('during CA generation'))
  await expect(pending).rejects.toThrow('during CA generation')
  const h = await fixture(), leaf = new AbortController()
  const issuing = h.https.prepare('target.test', 443, leaf.signal)
  leaf.abort(new Error('during leaf generation'))
  await expect(issuing).rejects.toThrow('during leaf generation')
})

it('requires the execution certificate to be trusted by the caller', async () => {
  const h = await fixture()
  await expect(h.tls('target.test', 'target.test:443', ['http/1.1'], false)).rejects.toBeDefined()
  expect(h.seen).toEqual([])
})

it('supports an authorized literal address without SNI', async () => {
  const h = await fixture()
  expect(await h.exchange('GET / HTTP/1.1\r\nHost: 127.0.0.1:8443\r\nConnection: close\r\n\r\n', '127.0.0.1:8443', '')).toContain('200 OK')
})

it.each([
  'CONNECT production.test:443 HTTP/1.1\r\nHost: production.test:443\r\n\r\n',
  'GET / HTTP/1.1\r\nHost: target.test\r\nConnection: upgrade\r\nUpgrade: websocket\r\n\r\n',
  'not an HTTP request\r\n\r\n',
])('refuses protocol changes and malformed plaintext', async (request) => {
  const h = await fixture()
  await h.exchange(request)
  expect(h.seen).toEqual([])
})

it('closes a TLS connection stalled before its handshake', async () => {
  const h = await fixture({ handshakeTimeoutMs: 30 }), socket = await h.tunnel()
  socket.resume()
  await once(socket, 'close')
  expect(h.seen).toEqual([])
})

it('bounds an inspected connection that never completes its HTTP headers', async () => {
  const h = await fixture({ requestTimeoutMs: 500 }), socket = await h.tls()
  const closed = new Promise<void>((resolve) => { socket.once('close', () => { resolve() }) })
  socket.resume(); socket.write('GET / HTTP/1.1\r\nHost: target.test\r\n')
  await closed
  expect(h.seen).toEqual([])
})

it('cancels established inspected sockets and returns all execution leases', async () => {
  const h = await fixture(), socket = await h.tls()
  const closed = new Promise<void>((resolve) => { socket.once('close', () => { resolve() }) }); socket.resume()
  expect(h.retained()).toBe(1)
  h.controller.abort(new Error('owner cancelled'))
  await closed; await h.proxy.close()
  expect(h.retained()).toBe(0)
})

it('shares certificates for concurrent names but refuses capacity and expiry', async () => {
  const h = await fixture({ maxCertificates: 1 }), signal = new AbortController().signal
  const [a, b] = await Promise.all([h.https.prepare('target.test', 443, signal), h.https.prepare('TARGET.TEST', 8443, signal)])
  expect(a).toBeDefined(); expect(b).toBeDefined()
  await expect(h.https.prepare('other.test', 443, signal)).rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
  const expiry = new X509Certificate(h.https.certificate).validTo
  vi.spyOn(Date, 'now').mockReturnValue(new Date(expiry).getTime() + 1)
  await expect(h.https.prepare('target.test', 443, signal)).rejects.toThrow('expired')
})

it('refuses cancelled certificate preparation', async () => {
  const signal = AbortSignal.abort(new Error('cancelled'))
  await expect(createNativeHttps(defaults, signal)).rejects.toThrow('cancelled')
  const h = await fixture()
  await expect(h.https.prepare('target.test', 443, signal)).rejects.toThrow('cancelled')
})

it('releases certificate capacity after signing fails', async () => {
  const h = await fixture({ maxCertificates: 1 }), signal = new AbortController().signal
  vi.mocked(generate).mockRejectedValueOnce(new Error('key generation failed'))
  await expect(h.https.prepare('target.test', 443, signal)).rejects.toThrow('key generation failed')
  await expect(h.https.prepare('other.test', 443, signal)).resolves.toBeDefined()
})

it.each([new Error('relay failed'), 'non-Error failure'])('preserves pipelined TLS bytes and contains relay failure %s', async (reason) => {
  const signal = AbortSignal.timeout(10000), https = await createNativeHttps(defaults, signal)
  const prepared = await https.prepare('::1', 443, signal)
  const completion = Promise.withResolvers<undefined>(), sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket); socket.once('close', () => { sockets.delete(socket) }); socket.on('error', () => {})
    socket.once('data', (head) => {
      socket.pause()
      void prepared.run(socket, head, async () => { throw reason }, signal).then(() => { completion.resolve(undefined) }, completion.reject)
    })
  })
  void completion.promise.catch(() => {})
  onTestFinished(async () => {
    await Promise.all([...sockets].map(socket => new Promise<void>((resolve) => { socket.once('close', () => { resolve() }); socket.destroy() })))
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const socket = connectTls({ host: '127.0.0.1', port: (server.address() as AddressInfo).port,
    servername: '', ca: https.certificate, checkServerIdentity: (_host, certificate) => {
      return new X509Certificate(certificate.raw).checkIP('::1') === undefined ? new Error('wrong IP') : undefined
    } })
  onTestFinished(async () => { if (!socket.closed) await new Promise<void>((resolve) => { socket.once('close', resolve); socket.destroy() }) })
  socket.on('error', () => {}); socket.resume()
  await once(socket, 'secureConnect')
  socket.write('GET / HTTP/1.1\r\nHost: [::1]\r\n\r\n')
  await expect(completion.promise).rejects.toThrow(reason instanceof Error ? reason.message : 'Inspected HTTPS request failed')
})
