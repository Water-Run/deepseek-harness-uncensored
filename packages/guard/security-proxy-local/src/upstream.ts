/**
 * The configured upstream proxy: its address, its Proxy-Authorization value, the
 * dispatcher every proxied request uses, and the CONNECT primitive the chain
 * proxy and the connection check share.
 *
 * TLS verification is never relaxed here. A `https:` upstream is reached through
 * `node:https` with Node's default trust store, and origin TLS stays end-to-end
 * through the tunnel.
 * @module @deepseek-ai/dsh-security-proxy-local/upstream
 */

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Socket } from 'node:net'
import { ProxyAgent } from 'undici'
import type { SecurityProxyFailure, SecurityProxyProtocol } from '@deepseek-ai/dsh-security-proxy/types'

/** One resolved upstream proxy, credentials included. Never logged or stored in this form. */
export interface Upstream {
  readonly protocol: SecurityProxyProtocol
  readonly host: string
  readonly port: number
  readonly username: string
  readonly password: string | undefined
}

/** A classified transport failure the settings surface can render without a transport vocabulary. */
export class UpstreamFailure extends Error {
  override readonly name = 'UpstreamFailure'

  /**
   * @param failure - stable reason the Client localizes.
   * @param detail - unlocalized diagnostic; carries no credential.
   */
  constructor(
    readonly failure: SecurityProxyFailure,
    detail: string,
    options?: ErrorOptions,
  ) {
    super(detail, options)
  }
}

/** One open tunnel to a target, and its upstream response status. */
export interface UpstreamTunnel {
  readonly socket: Socket
  readonly status: number
}

/**
 * The proxy URL without credentials, for diagnostics and the dispatcher URI.
 * @param upstream - configured upstream.
 * @returns `protocol://host:port`.
 */
export function proxyUrl(upstream: Upstream): string {
  return `${upstream.protocol}://${upstream.host}:${String(upstream.port)}`
}

/**
 * Resolve the Proxy-Authorization header value.
 * @param upstream - configured upstream.
 * @returns the header value, or undefined when authentication is off.
 * @throws {UpstreamFailure} when authentication is on but no password is stored.
 */
export function proxyAuthorization(upstream: Upstream): string | undefined {
  if (upstream.password === undefined && upstream.username === '') return undefined
  if (upstream.password === undefined) {
    throw new UpstreamFailure('auth', 'the upstream proxy password is not configured')
  }
  return `Basic ${Buffer.from(`${upstream.username}:${upstream.password}`).toString('base64')}`
}

/**
 * Build the dispatcher for this upstream. One dispatcher serves every request for
 * one settings value; a settings change closes it and builds the next.
 * @param upstream - configured upstream.
 * @returns the dispatcher to hand to `fetch`.
 */
export function createDispatcher(upstream: Upstream): ProxyAgent {
  const token = proxyAuthorization(upstream)
  return new ProxyAgent({
    uri: proxyUrl(upstream),
    ...token === undefined ? {} : { token },
  })
}

/** Map a transport error to a stable failure reason. */
export function classifyFailure(error: unknown): SecurityProxyFailure {
  if (error instanceof UpstreamFailure) return error.failure
  const code = (error as NodeJS.ErrnoException | undefined)?.code ?? ''
  if (code === 'ERR_PROXY_AUTH' || code === 'ERR_INVALID_PROXY') return 'auth'
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || (error as Error | undefined)?.name === 'AbortError') return 'timeout'
  if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code.includes('SELF_SIGNED') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') return 'tls'
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'unreachable'
  return 'unknown'
}

/** Explain one classified failure without repeating a secret. */
export function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === undefined ? error.message : `${code}: ${error.message}`
  }
  return String(error)
}

/**
 * Open one CONNECT tunnel through the upstream.
 *
 * The request goes to the proxy itself (TLS-verified when the upstream is
 * `https:`), asks for `host:port`, and resolves only after the proxy answers
 * `2xx`. A `407` is classified as an authentication failure; any other non-2xx
 * is a proxy refusal.
 * @param upstream - configured upstream.
 * @param host - target host the proxy should reach.
 * @param port - target port the proxy should reach.
 * @param timeoutMs - whole-handshake budget.
 * @param signal - caller cancellation.
 * @returns the connected socket and the proxy's status.
 */
export async function connectThrough(
  upstream: Upstream,
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<UpstreamTunnel> {
  const authorization = proxyAuthorization(upstream)
  const authority = `${host}:${String(port)}`
  return await new Promise<UpstreamTunnel>((resolve, reject) => {
    const send = upstream.protocol === 'https' ? httpsRequest : httpRequest
    const request = send({
      host: upstream.host,
      port: upstream.port,
      method: 'CONNECT',
      path: authority,
      headers: {
        host: authority,
        ...authorization === undefined ? {} : { 'proxy-authorization': authorization },
      },
      timeout: timeoutMs,
      ...signal === undefined ? {} : { signal },
    })
    request.once('connect', (response, socket) => {
      if (response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300) {
        resolve({ socket, status: response.statusCode })
        return
      }
      socket.destroy()
      reject(new UpstreamFailure(response.statusCode === 407 ? 'auth' : 'unreachable', `the upstream proxy refused CONNECT ${authority} with HTTP ${String(response.statusCode)}`))
    })
    request.once('timeout', () => {
      request.destroy(new UpstreamFailure('timeout', `the upstream proxy did not answer CONNECT ${authority} within ${String(timeoutMs)} ms`))
    })
    request.once('error', (error) => {
      reject(error instanceof UpstreamFailure
        ? error
        : new UpstreamFailure(classifyFailure(error), describeFailure(error), { cause: error }))
    })
    request.end()
  })
}

/**
 * Run one real proxy-path check: a CONNECT tunnel to the configured target,
 * opened and closed. Nothing about TLS trust is relaxed, and no target body is
 * requested.
 * @param upstream - configured upstream.
 * @param host - check target host.
 * @param port - check target port.
 * @param timeoutMs - whole-check budget.
 * @returns the handshake latency in milliseconds.
 * @throws {UpstreamFailure} when the check fails.
 */
export async function checkUpstream(upstream: Upstream, host: string, port: number, timeoutMs: number): Promise<number> {
  const started = performance.now()
  const tunnel = await connectThrough(upstream, host, port, timeoutMs)
  tunnel.socket.destroy()
  return Math.round(performance.now() - started)
}
