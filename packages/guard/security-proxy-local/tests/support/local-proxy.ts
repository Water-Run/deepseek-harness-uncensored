/**
 * Real local fixtures for the security-proxy engine: an upstream HTTP proxy that
 * records every request and CONNECT it carries, a plain HTTP target, and a TCP
 * echo target for tunnel tests. Every listener binds loopback on an
 * operating-system-assigned port and is owned by the test that starts it.
 */
import { createServer, request as httpRequest, type Server } from 'node:http'
import { connect as netConnect, createServer as createTcpServer } from 'node:net'

/** One forwarded request the upstream proxy carried. */
export interface ProxiedRequest {
  readonly method: string
  readonly url: string
  readonly authorization: string | undefined
}

/** One tunnel the upstream proxy opened. */
export interface ProxiedTunnel {
  readonly authority: string
}

/** A local upstream proxy with switchable authentication and tunnel policy. */
export interface LocalProxy {
  readonly port: number
  readonly requests: ProxiedRequest[]
  readonly tunnels: ProxiedTunnel[]
  /** Require this basic credential for both forwarding and CONNECT. */
  setCredentials(credentials: { readonly user: string; readonly pass: string } | null): void
  /** Refuse every CONNECT with this status; 0 restores normal tunneling. */
  setTunnelStatus(status: number): void
  close(): Promise<void>
}

/** Start the upstream proxy on loopback. */
export async function startLocalProxy(): Promise<LocalProxy> {
  const requests: ProxiedRequest[] = []
  const tunnels: ProxiedTunnel[] = []
  let credentials: { readonly user: string; readonly pass: string } | null = null
  let tunnelStatus = 0
  const server = createServer((request, response) => {
    const target = request.url ?? ''
    requests.push({ method: request.method ?? 'GET', url: target, authorization: request.headers['proxy-authorization'] })
    if (!authorized(request.headers['proxy-authorization'], credentials)) {
      response.writeHead(407, { 'proxy-authenticate': 'Basic realm="test"' })
      response.end()
      return
    }
    let parsed: URL
    try {
      parsed = new URL(target)
    } catch {
      response.writeHead(400)
      response.end()
      return
    }
    const upstream = httpRequest(parsed, { method: request.method }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    })
    upstream.on('error', () => {
      response.writeHead(502)
      response.end()
    })
    request.pipe(upstream)
  })
  server.on('connect', (request, clientSocket, head) => {
    const authority = request.url ?? ''
    tunnels.push({ authority })
    if (!authorized(request.headers['proxy-authorization'], credentials)) {
      clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n')
      return
    }
    if (tunnelStatus !== 0) {
      clientSocket.end(`HTTP/1.1 ${String(tunnelStatus)} Refused\r\n\r\n`)
      return
    }
    const separator = authority.lastIndexOf(':')
    const host = authority.slice(0, separator).replace(/^\[|\]$/g, '')
    const port = Number(authority.slice(separator + 1))
    const upstream = netConnect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.byteLength > 0) upstream.write(head)
      clientSocket.pipe(upstream)
      upstream.pipe(clientSocket)
    })
    upstream.on('error', () => { clientSocket.destroy() })
    clientSocket.on('error', () => { upstream.destroy() })
  })
  const port = await listen(server)
  return {
    port,
    requests,
    tunnels,
    setCredentials(next) { credentials = next },
    setTunnelStatus(status) { tunnelStatus = status },
    close: () => close(server),
  }
}

/** Whether one Proxy-Authorization value satisfies the current requirement. */
function authorized(
  header: string | string[] | undefined,
  credentials: { readonly user: string; readonly pass: string } | null,
): boolean {
  const value = Array.isArray(header) ? header[0] : header
  if (credentials === null) return true
  const expected = `Basic ${Buffer.from(`${credentials.user}:${credentials.pass}`).toString('base64')}`
  return value === expected
}

/** One plain HTTP target. */
export interface LocalTarget {
  readonly port: number
  readonly url: string
  close(): Promise<void>
}

/** Start the HTTP target with a fixed text body and a secret-bearing cookie. */
export async function startLocalTarget(body = 'target body'): Promise<LocalTarget> {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'set-cookie': 'session=secret-cookie',
      'x-target': 'local',
    })
    response.end(body)
  })
  const port = await listen(server)
  return { port, url: `http://127.0.0.1:${String(port)}/page`, close: () => close(server) }
}

/** One TCP echo target for CONNECT tests. */
export interface LocalTcpTarget {
  readonly port: number
  close(): Promise<void>
}

/** Start a loopback TCP echo server. */
export async function startTcpEcho(): Promise<LocalTcpTarget> {
  const server = createTcpServer((socket) => { socket.pipe(socket) })
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      server.off('error', reject)
      const address = server.address()
      if (address === null || typeof address === 'string') reject(new Error('no port'))
      else resolve(address.port)
    })
  })
  return { port, close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }) }) }
}

/** Bind one server on loopback and resolve its port. */
function listen(server: Server): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      server.off('error', reject)
      const address = server.address()
      if (address === null || typeof address === 'string') reject(new Error('the listener reported no port'))
      else resolve(address.port)
    })
  })
}

/** Close one server and resolve after it quiesces. */
function close(server: Server): Promise<void> {
  return new Promise<void>((resolve) => { server.close(() => { resolve() }) })
}
