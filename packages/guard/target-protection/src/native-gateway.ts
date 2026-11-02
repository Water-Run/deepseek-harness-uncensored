/** Per-execution loopback egress, with policy-owned resolution and no direct fallback. @module */
import { addAbortListener, once } from 'node:events'
import { connect, type Socket } from 'node:net'
import { WebError } from '@deepseek-ai/dsh-web'
import { SessionChainProxy, connectThrough, proxyUrl } from '@deepseek-ai/dsh-security-proxy-local'
import type { ChainOptions, ProxyHttpRequest, Upstream, UpstreamTunnel } from '@deepseek-ai/dsh-security-proxy-local'
import { requestPinned, requestPinnedViaProxy, validateFetchUrl } from '@deepseek-ai/dsh-web-fetch-http'
import type { PinnedResponse } from '@deepseek-ai/dsh-web-fetch-http'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type TargetProtection from './index.ts'
import type { TargetConnectionResolution } from './index.ts'
import { canonicalTargetHost, expandTargetRules } from './rules.ts'
import { assertNetworkAllowed } from './network-decision.ts'

/** Execution attribution, optional owner-selected upstream and deployment time bounds. */
export interface NativeGatewayOptions {
  /** File and network rules held by this native execution. */
  revision: number
  /** Stop and join the native process range; its release closes this gateway. */
  stopExecution(): Promise<void>
  sessionId: SessionId
  tool: string
  upstream?: Upstream
  connectTimeoutMs: number
  requestTimeoutMs: number
  capture: ChainOptions['capture']
  capturePaused(): boolean
}

/** Owned listener; the native process range must close before its owner releases this gateway. */
export interface NativeGateway {
  readonly url: string
  /** Close admission, cancel in-flight checks and join sockets before releasing the policy owner. */
  close(): Promise<void>
}

async function closeSocket(socket: Socket): Promise<void> {
  if (socket.closed) return
  await new Promise<void>((resolve) => { socket.once('close', () => { resolve() }); socket.destroy() })
}

async function directTunnel(address: string, port: number, signal: AbortSignal): Promise<UpstreamTunnel> {
  signal.throwIfAborted()
  const socket = connect({ host: address, port })
  socket.on('error', () => { socket.destroy() })
  using _abort = addAbortListener(signal, () => { socket.destroy() })
  try {
    await once(socket, 'connect', { signal })
    signal.throwIfAborted()
    return { socket, status: 200 }
  } catch (error) { await closeSocket(socket); throw error }
}

/**
 * Bind an execution-private gateway. Private endpoints require an exact owner test-server selector.
 * @param protection - Live rule owner retained until gateway shutdown settles.
 * @param options - Explicit route, attribution, capture and time bounds.
 * @param signal - Execution cancellation, including the owning native range's lifetime.
 * @returns Listener URL for the native containment policy and its asynchronous disposer.
 */
export async function startNativeGateway(
  protection: TargetProtection, options: NativeGatewayOptions, signal: AbortSignal,
): Promise<NativeGateway> {
  signal.throwIfAborted()
  const release = protection.retainNativeExecution(options.revision, () => options.stopExecution()), lifetime = new AbortController()
  const combined = AbortSignal.any([signal, lifetime.signal, protection.executionSignal()])
  let proxy: SessionChainProxy | undefined, closing: Promise<void> | undefined
  const close = (): Promise<void> => {
    closing ??= Promise.resolve().then(async () => {
      lifetime.abort(new Error('Native target gateway is closing.'))
      await proxy?.close()
      release()
    })
    return closing
  }
  const authorize = async (hostname: string, port: number, opaque: boolean, requestSignal: AbortSignal) => {
    const host = canonicalTargetHost(hostname)
    assertNetworkAllowed(await protection.checkConnection(host, port, undefined, 'endpoint', 'unknown', requestSignal))
    const snapshot = await protection.snapshot()
    const ownerTest = expandTargetRules(snapshot.preferences).some(rule => rule.enabled && rule.kind === 'server'
      && rule.environment === 'test' && rule.match === 'host' && rule.address === host
      && (rule.port === undefined || rule.port === port))
    const resolution = ownerTest ? await protection.resolveConnectionTarget(host, requestSignal)
      : await protection.resolveHttpTarget(host, requestSignal)
    assertNetworkAllowed(await protection.checkConnection(host, port, resolution, 'endpoint', 'unknown', requestSignal))
    if (opaque) {
      // Encrypted and arbitrary protocols do not attest their application names or database selection.
      for (const address of resolution.addresses) {
        const literal = canonicalTargetHost(address.address)
        const endpoint: TargetConnectionResolution = { ...resolution, hostname: literal, names: [literal], addresses: [address] }
        assertNetworkAllowed(await protection.checkConnection(literal, port, endpoint, 'endpoint', 'unknown', requestSignal))
      }
    }
    requestSignal.throwIfAborted()
    return resolution
  }
  const requestHttp = async (url: URL, request: ProxyHttpRequest, requestSignal: AbortSignal): Promise<PinnedResponse> => {
    const target = validateFetchUrl(url.toString())
    const headers = { ...request.headers }
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() === 'host') {
        const authority = new URL(`${target.protocol}//${value}`)
        if (authority.origin !== target.origin || authority.username !== '' || authority.password !== ''
          || authority.pathname !== '/' || authority.search !== '' || authority.hash !== '') {
          throw new WebError('HTTP Host does not match its authorized target.', 'TARGET_IDENTITY_UNVERIFIED')
        }
        Reflect.deleteProperty(headers, name)
      }
    }
    headers.host = target.host
    const resolution = await authorize(target.hostname, Number(target.port || (target.protocol === 'https:' ? 443 : 80)), false, requestSignal)
    const upstream = options.upstream
    if (upstream === undefined) return requestPinned(target, resolution.addresses, headers, requestSignal, request)
    const route = new URL(proxyUrl(upstream))
    if (upstream.password !== undefined) { route.username = upstream.username; route.password = upstream.password }
    return requestPinnedViaProxy(route.toString(), target, resolution.addresses, headers, requestSignal, request)
  }
  try {
    combined.throwIfAborted()
    proxy = await SessionChainProxy.start({
      sessionId: options.sessionId, tool: () => options.tool, signal: () => combined,
      retainExecution: () => protection.retainExecution(), requestHttp,
      async openTunnel(host, port, requestSignal) {
        const bounded = AbortSignal.any([requestSignal, AbortSignal.timeout(options.connectTimeoutMs)])
        const resolution = await authorize(host, port, true, bounded)
        const first = resolution.addresses.at(0)
        if (first === undefined) throw new WebError('No verified target address.', 'TARGET_IDENTITY_UNVERIFIED')
        return options.upstream === undefined ? directTunnel(first.address, port, bounded)
          : connectThrough(options.upstream, first.address, port, options.connectTimeoutMs, bounded)
      },
      capture: options.capture, paused: () => options.capturePaused(), timeoutMs: options.requestTimeoutMs,
    })
    combined.throwIfAborted()
    return { url: `http://127.0.0.1:${proxy.port}`, close }
  } catch (error) { await close(); throw error }
}
