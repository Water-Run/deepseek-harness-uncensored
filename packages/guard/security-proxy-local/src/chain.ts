/**
 * Loopback chain proxy for child processes.
 *
 * A tool call gets an environment pointing at one listener owned by its session.
 * Plain HTTP through that listener is forwarded to the upstream and captured in
 * full; HTTPS is tunnelled with CONNECT and only its metadata is recorded, which
 * is exactly what a non-intercepting proxy can see. The listener never becomes a
 * system proxy and is never bound beyond loopback.
 * @module @deepseek-ai/dsh-security-proxy-local/chain
 */

import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { fetch as undiciFetch, type Dispatcher } from 'undici'
import type { CaptureStore, CapturedExchangeInput } from './capture.ts'
import { connectThrough, describeFailure, type Upstream, UpstreamFailure } from './upstream.ts'

/** Request and response bodies larger than this are refused rather than buffered. */
const MAX_FORWARD_BODY_BYTES = 8 * 1_048_576

/** Header names the chain proxy must not forward to the next hop. */
const HOP_BY_HOP = new Set([
  'proxy-authorization',
  'proxy-connection',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
])

/** Everything one session's listener needs from the owning engine. */
export interface ChainOptions {
  /** Session the listener attributes its flows to. */
  readonly sessionId: string
  /** Tool name shown for every flow this listener handles, read per exchange. */
  tool: () => string
  /** Current upstream, resolved per request so a settings change applies without a new listener. */
  upstream: () => Upstream
  /** Dispatcher for plain HTTP forwards; owned by the engine and never closed here. */
  dispatcher: () => Dispatcher
  /** Capture store every exchange is appended to. */
  capture: CaptureStore
  /** Whether capture is currently paused; forwarding continues regardless. */
  paused: () => boolean
  /** Whole-exchange budget for one forwarded request. */
  timeoutMs: number
  /** Clock, injectable for tests. */
  now?: () => number
}

/**
 * One session's loopback HTTP proxy.
 *
 * `port` is assigned by the operating system on `127.0.0.1`; nothing else on the
 * machine is reconfigured. Disposal destroys open tunnels and closes the server.
 */
export class SessionChainProxy {
  private readonly sockets = new Set<Socket>()
  private closing = false
  /** Port assigned by the operating system on loopback. */
  port = 0

  private constructor(
    private readonly server: Server,
    private readonly options: ChainOptions,
  ) {}

  /**
   * Bind one listener on loopback and start serving.
   * @param options - session attribution, upstream accessors, and capture.
   * @returns the started listener.
   */
  static async start(options: ChainOptions): Promise<SessionChainProxy> {
    const server = createServer()
    const proxy = new SessionChainProxy(server, options)
    server.on('request', (request, response) => {
      proxy.forward(request, response).catch((error: unknown) => {
        if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        response.end(`security proxy forward failed: ${describeFailure(error)}\n`)
      })
    })
    server.on('connect', (request, socket, head) => {
      proxy.tunnel(request, socket as Socket, head).catch(() => { socket.destroy() })
    })
    server.on('connection', (socket) => {
      proxy.sockets.add(socket)
      socket.once('close', () => { proxy.sockets.delete(socket) })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address()
    /* v8 ignore next 3 -- listen() succeeded, so the address is an AddressInfo. */
    if (address === null || typeof address === 'string') {
      await proxy.close()
      throw new Error('security proxy: the loopback listener reported no port')
    }
    proxy.port = address.port
    return proxy
  }

  /** Close the listener and destroy every socket it still owns. */
  async close(): Promise<void> {
    if (this.closing) return
    this.closing = true
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    await new Promise<void>((resolve) => {
      this.server.close(() => { resolve() })
    })
  }

  /** Forward one absolute-form HTTP request through the upstream and capture it. */
  private async forward(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const started = this.options.now?.() ?? Date.now()
    const startedAt = performance.now()
    const target = request.url ?? ''
    let parsed: URL
    try {
      parsed = new URL(target)
    } catch {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('security proxy: an HTTP proxy request must carry an absolute URL\n')
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(`security proxy: unsupported scheme ${parsed.protocol}\n`)
      return
    }
    const body = await readBody(request)
    const headers = forwardHeaders(request.headers)
    try {
      const upstreamResponse = await undiciFetch(parsed, {
        method: request.method ?? 'GET',
        headers,
        ...body === undefined ? {} : { body: new Uint8Array(body) },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.options.timeoutMs),
        dispatcher: this.options.dispatcher(),
      })
      const responseHeaders = Object.fromEntries(
        [...upstreamResponse.headers].filter(([name]) => !HOP_BY_HOP.has(name.toLowerCase()) && name.toLowerCase() !== 'content-encoding' && name.toLowerCase() !== 'content-length'),
      )
      response.writeHead(upstreamResponse.status, responseHeaders)
      const captured: Uint8Array[] = []
      let responseBytes = 0
      let capturedBytes = 0
      const maxCapture = 1_048_576
      if (upstreamResponse.body !== null) {
        const reader = upstreamResponse.body.getReader()
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          const value: unknown = chunk.value
          if (!(value instanceof Uint8Array)) throw new TypeError('security proxy: response stream must contain bytes')
          responseBytes += value.byteLength
          if (capturedBytes < maxCapture) {
            const remaining = maxCapture - capturedBytes
            captured.push(value.byteLength <= remaining ? value : value.subarray(0, remaining))
            capturedBytes += Math.min(value.byteLength, remaining)
          }
          response.write(value)
        }
      }
      response.end()
      this.record({
        at: started,
        kind: 'http',
        origin: 'proxy',
        sessionId: this.options.sessionId,
        tool: this.options.tool(),
        method: request.method ?? 'GET',
        target: parsed.toString(),
        status: upstreamResponse.status,
        durationMs: Math.round(performance.now() - startedAt),
        requestBytes: body?.byteLength ?? 0,
        responseBytes,
        outcome: 'complete',
        note: null,
        requestHeaders: Object.entries(headers),
        responseHeaders: [...upstreamResponse.headers],
        requestBody: body === undefined ? null : new TextDecoder().decode(body),
        responseBody: new TextDecoder().decode(concat(captured)),
        contentType: upstreamResponse.headers.get('content-type'),
      })
    } catch (error: unknown) {
      const failure = error instanceof UpstreamFailure ? error : new UpstreamFailure('unreachable', describeFailure(error), { cause: error })
      this.record(errorInput(this.options, started, parsed.toString(), request, startedAt, body, failure))
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(`security proxy: ${failure.message}\n`)
    }
  }

  /** Tunnel one CONNECT request and record only what the tunnel itself reveals. */
  private async tunnel(request: IncomingMessage, socket: Socket, head: Buffer): Promise<void> {
    const started = this.options.now?.() ?? Date.now()
    const startedAt = performance.now()
    const authority = request.url ?? ''
    const [host, port] = splitAuthority(authority)
    if (host === undefined || port === undefined) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      return
    }
    try {
      const upstreamTunnel = await connectThrough(this.options.upstream(), host, port, this.options.timeoutMs)
      let sent = 0
      let received = 0
      socket.on('data', (chunk: Buffer) => { sent += chunk.byteLength })
      upstreamTunnel.socket.on('data', (chunk: Buffer) => { received += chunk.byteLength })
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.byteLength > 0) upstreamTunnel.socket.write(head)
      socket.pipe(upstreamTunnel.socket)
      upstreamTunnel.socket.pipe(socket)
      let recorded = false
      const finish = (): void => {
        if (recorded) return
        recorded = true
        socket.destroy()
        upstreamTunnel.socket.destroy()
        this.record({
          at: started,
          kind: 'tunnel',
          origin: 'proxy',
          sessionId: this.options.sessionId,
          tool: this.options.tool(),
          method: 'CONNECT',
          target: authority,
          status: null,
          durationMs: Math.round(performance.now() - startedAt),
          requestBytes: sent,
          responseBytes: received,
          outcome: 'complete',
          note: 'tunnel-metadata-only',
          requestHeaders: [['host', authority]],
          responseHeaders: [],
          requestBody: null,
          responseBody: null,
          contentType: null,
        })
      }
      socket.once('close', finish)
      upstreamTunnel.socket.once('close', finish)
      socket.once('error', finish)
      upstreamTunnel.socket.once('error', finish)
    } catch (error: unknown) {
      const failure = error instanceof UpstreamFailure ? error : new UpstreamFailure('unreachable', describeFailure(error), { cause: error })
      this.record(errorInput(this.options, started, authority, request, startedAt, undefined, failure))
      socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    }
  }

  /** Append one exchange unless the owner paused capture. */
  private record(input: CapturedExchangeInput): void {
    if (this.options.paused()) return
    this.options.capture.append(input)
  }
}

/** Synthesize the failed exchange row for one refused request. */
function errorInput(
  options: ChainOptions,
  at: number,
  target: string,
  request: IncomingMessage,
  startedAt: number,
  body: Buffer | undefined,
  failure: UpstreamFailure,
): CapturedExchangeInput {
  return {
    at,
    kind: request.method === 'CONNECT' ? 'tunnel' : 'http',
    origin: 'proxy',
    sessionId: options.sessionId,
    tool: options.tool(),
    method: request.method ?? 'GET',
    target,
    status: null,
    durationMs: Math.round(performance.now() - startedAt),
    requestBytes: body?.byteLength ?? 0,
    responseBytes: 0,
    outcome: 'error',
    note: failure.failure,
    requestHeaders: Object.entries(forwardHeaders(request.headers)),
    responseHeaders: [],
    requestBody: body === undefined ? null : new TextDecoder().decode(body),
    responseBody: null,
    contentType: null,
  }
}

/** Convert incoming headers to a plain forwardable record. */
function forwardHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (HOP_BY_HOP.has(name.toLowerCase())) continue
    result[name] = Array.isArray(value) ? value.join(', ') : value
  }
  return result
}

/** Collect a request body up to {@link MAX_FORWARD_BODY_BYTES}. */
async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = chunk as Buffer
    total += buffer.byteLength
    if (total > MAX_FORWARD_BODY_BYTES) throw new Error(`request body exceeds ${String(MAX_FORWARD_BODY_BYTES)} bytes`)
    chunks.push(buffer)
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks)
}

/** Concatenate captured chunks without copying twice. */
function concat(chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0)
  if (chunks.length === 1) return chunks[0] as Uint8Array
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

/** Split a CONNECT authority into host and port, accepting bracketed IPv6. */
function splitAuthority(authority: string): [string | undefined, number | undefined] {
  const match = /^\[([^\]]+)\]:(\d+)$/.exec(authority) ?? /^([^:]+):(\d+)$/.exec(authority)
  if (match === null) return [undefined, undefined]
  const host = match[1]
  const port = Number(match[2])
  if (host === undefined || !Number.isInteger(port) || port < 1 || port > 65_535) return [undefined, undefined]
  return [host, port]
}
