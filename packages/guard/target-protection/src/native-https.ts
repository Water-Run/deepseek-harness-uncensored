/** Execution-private TLS termination; only validated HTTP requests can reach the upstream relay. @module */
import { addAbortListener } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:https'
import { isIP } from 'node:net'
import { createSecureContext } from 'node:tls'
import { generate } from 'selfsigned'
import { WebError } from '@deepseek-ai/dsh-web'
import type { InspectedTunnel } from '@deepseek-ai/dsh-security-proxy-local'
import { canonicalTargetHost } from './rules.ts'

/** Per-execution resource bounds for inspected HTTPS. */
export interface NativeHttpsOptions {
  maxCertificates: number
  certificateLifetimeMs: number
  handshakeTimeoutMs: number
  requestTimeoutMs: number
}

/** Public trust material and an inspector factory; signing keys never leave the owning Host. */
export interface NativeHttpsInspector {
  readonly certificate: string
  /**
   * Prepare TLS for an already authorized CONNECT target without opening an upstream socket.
   * @param hostname - Policy-normalized target name or literal address.
   * @param port - Authorized target port.
   * @param signal - Execution and preparation cancellation.
   * @returns Inspector whose requests remain bound to that authority.
   */
  prepare(hostname: string, port: number, signal: AbortSignal): Promise<InspectedTunnel>
}

function identityError(): WebError {
  return new WebError('HTTPS identity does not match the authorized CONNECT target.', 'TARGET_IDENTITY_UNVERIFIED')
}

/**
 * Validate the decrypted HTTP authority and replace its request target with a bound absolute URL.
 * @param request - Parsed request, including raw headers used to detect duplicate Host fields.
 * @param origin - Authorized CONNECT origin.
 */
export function bindNativeHttpsRequest(request: IncomingMessage, origin: URL): void {
  const raw = request.url ?? ''
  // HTTP/1.1 Host is mandatory and duplicate authorities cannot be silently discarded by Node.
  if (request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length !== 1
    || request.headers.host === undefined || raw.includes('#') || raw.startsWith('//')) throw identityError()
  const authority = new URL(`https://${request.headers.host}`)
  const url = raw.startsWith('/') ? new URL(origin.origin + raw) : new URL(raw)
  if (authority.href !== origin.href || url.origin !== origin.origin || url.username !== '' || url.password !== '') throw identityError()
  request.url = url.href
}

type Certificate = { key: string; cert: string }

function inspector(material: Certificate, host: string, port: number, options: NativeHttpsOptions): InspectedTunnel {
  const origin = new URL(`https://${isIP(host) === 6 ? `[${host}]` : host}:${port}/`)
  return {
    async run(socket, head, forward, signal) {
      signal.throwIfAborted()
      const lifetime = AbortSignal.any([signal, AbortSignal.timeout(options.requestTimeoutMs)])
      socket.pause()
      if (head.byteLength > 0) socket.unshift(head)
      let failure: Error | undefined, verified = false
      const pending = new Set<Promise<void>>(), closed = Promise.withResolvers<void>()
      const context = createSecureContext(material)
      const http = createServer({ ...material, ALPNProtocols: ['http/1.1'],
        handshakeTimeout: options.handshakeTimeoutMs, maxHeaderSize: 16384, requestTimeout: options.requestTimeoutMs,
        headersTimeout: options.requestTimeoutMs, keepAliveTimeout: options.requestTimeoutMs,
        SNICallback(name, done) {
          try { done(canonicalTargetHost(name) === host ? null : identityError(), context) }
          catch (_invalidName) { done(identityError()) }
        },
      })
      const fail = (error: Error) => { failure ??= error; socket.destroy() }
      const reject = (_request: IncomingMessage, response: ServerResponse) => {
        response.writeHead(403, { connection: 'close', 'content-type': 'text/plain; charset=utf-8' })
        response.end('HTTPS target identity could not be verified.\n')
      }
      http.on('request', (request, response) => {
        if (!verified || lifetime.aborted) { response.destroy(); return }
        try { bindNativeHttpsRequest(request, origin) }
        catch (_invalidAuthority) { failure ??= identityError(); reject(request, response); return }
        const work = forward(request, response).catch((error: unknown) => {
          fail(error instanceof Error ? error : new Error('Inspected HTTPS request failed.', { cause: error }))
        }).finally(() => { pending.delete(work) })
        pending.add(work)
      })
      http.on('connect', () => { fail(identityError()) })
      http.on('upgrade', () => { fail(identityError()) })
      http.on('clientError', (error) => { fail(error) })
      http.on('tlsClientError', fail)
      socket.once('close', () => { _abort[Symbol.dispose](); closed.resolve() })
      socket.on('error', fail)
      http.prependListener('secureConnection', (secure) => {
        if (secure.servername && canonicalTargetHost(secure.servername) !== host || !secure.servername && isIP(host) === 0) {
          fail(identityError()); return
        }
        secure.disableRenegotiation()
        verified = true
      })
      using _abort = addAbortListener(lifetime, () => { fail(new Error('Inspected HTTPS cancelled.', { cause: lifetime.reason })) })
      try {
        http.emit('connection', socket)
        await closed.promise
        if (failure !== undefined) throw failure
      } finally {
        http.closeAllConnections()
        socket.destroy()
        await Promise.allSettled(pending)
        socket.off('error', fail)
      }
    },
  }
}

/**
 * Create one ephemeral CA. No system trust, process-global TLS settings or private-key files are changed.
 * @param options - Certificate budget, validity and transport deadlines.
 * @param signal - Preparation cancellation; asynchronous key generation is joined before returning.
 * @returns Public CA certificate and bounded per-target inspectors.
 */
export async function createNativeHttps(options: NativeHttpsOptions, signal: AbortSignal): Promise<NativeHttpsInspector> {
  signal.throwIfAborted()
  const notAfterDate = new Date(Math.floor((Date.now() + options.certificateLifetimeMs) / 1000) * 1000)
  const ca = await generate([{ name: 'commonName', value: 'DSHU private execution HTTPS' }], {
    keyType: 'ec', curve: 'P-256', algorithm: 'sha256', notAfterDate,
    extensions: [{ name: 'basicConstraints', cA: true, critical: true, pathLenConstraint: 0 },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }],
  })
  signal.throwIfAborted()
  const certificates = new Map<string, Promise<Certificate>>()
  return {
    certificate: ca.cert,
    async prepare(hostname, port, requestSignal) {
      requestSignal.throwIfAborted()
      const host = canonicalTargetHost(hostname)
      if (Date.now() >= notAfterDate.getTime()) throw new WebError('Execution HTTPS certificate expired; start a new execution.', 'TARGET_IDENTITY_UNVERIFIED')
      let context = certificates.get(host)
      if (context === undefined) {
        if (certificates.size >= options.maxCertificates) throw new WebError('Execution HTTPS certificate capacity reached.', 'TARGET_IDENTITY_UNVERIFIED')
        context = generate([{ name: 'commonName', value: host }], {
          keyType: 'ec', curve: 'P-256', algorithm: 'sha256', notAfterDate, ca: { key: ca.private, cert: ca.cert },
          extensions: [{ name: 'basicConstraints', cA: false, critical: true },
            { name: 'keyUsage', digitalSignature: true, critical: true }, { name: 'extKeyUsage', serverAuth: true },
            { name: 'subjectAltName', altNames: [isIP(host) === 0 ? { type: 2, value: host } : { type: 7, ip: host }] }],
        }).then(material => ({ key: material.private, cert: material.cert }))
          .catch((error: unknown) => { certificates.delete(host); throw error })
        certificates.set(host, context)
      }
      const prepared = await context
      requestSignal.throwIfAborted()
      return inspector(prepared, host, port, options)
    },
  }
}
