/** Independent security proxy backed by a mandatory, retained target-rule owner. @module */
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { isIP } from 'node:net'
import {
  Config as ProxyConfig, SecurityProxyEngine, mountSecurityProxy, proxyUrl, connectThrough,
} from '@deepseek-ai/dsh-security-proxy-local'
import type { ChainOptions, EngineOptions, ProxyHttpRequest, ProxyDispatcher, Upstream, UpstreamTunnel } from '@deepseek-ai/dsh-security-proxy-local'
import { requestPinnedViaProxy, validateFetchUrl } from '@deepseek-ai/dsh-web-fetch-http'
import type { HttpFetchDestination, PinnedResponse, PublicAddress } from '@deepseek-ai/dsh-web-fetch-http'
import { WebError } from '@deepseek-ai/dsh-web'
import type TargetProtection from './index.ts'
import type { TargetHttpResolution, TargetAuditExecution } from './index.ts'
import type {} from './settings.ts'
import { assertNetworkAllowed, authorizeGuardedHttp, guardedTunnelUrl } from './network-decision.ts'
import { canonicalTargetHost, hasExactTestServer } from './rules.ts'
import { createNativeHttps } from './native-https.ts'

/** Cordis diagnostics name. */
export const name = 'target-protected-security-proxy'
/** Removing either dependency withdraws this proxy instead of restoring an unguarded one. */
export const inject = ['credentials', 'targetProtection']
const inspectionSchema = schema.object({
  tools: schema.array(schema.string().pattern(/^[a-zA-Z0-9_.:-]+$/u)).required(),
  maxCertificates: schema.natural().min(1).max(4096).default(64),
  certificateLifetimeMs: schema.natural().min(1000).max(MAX_TIMER_DELAY_MS).default(86400000),
})

/** Independent proxy settings with optional HTTP/1.1 inspection for named tools. */
export const Config = schema.intersect([ProxyConfig, schema.object({
  httpsInspection: schema.union([schema.const(undefined), schema.const(null), inspectionSchema]),
})])
/** Validated independent proxy deployment configuration. */
export type Config = ReturnType<typeof Config>

class ProtectedProxyEngine extends SecurityProxyEngine {
  constructor(options: EngineOptions, private readonly ctx: Context, private readonly protection: TargetProtection,
    private readonly inspection: NonNullable<Config['httpsInspection']> | undefined) {
    super(options)
  }

  protected override executionSignal(): AbortSignal {
    return AbortSignal.any([super.executionSignal(), this.protection.executionSignal()])
  }

  protected override retainExecution(): () => void { return this.protection.retainExecution() }

  protected override executionScope(sessionId: SessionId | undefined): TargetAuditExecution {
    return this.protection.bindAuditSession(sessionId)
  }

  protected override async startChain(options: ChainOptions, signal: AbortSignal) {
    const inspection = this.inspection
    if (inspection === undefined || !inspection.tools.includes(options.tool())) return super.startChain(options, signal)
    const https = await createNativeHttps({
      maxCertificates: inspection.maxCertificates,
      certificateLifetimeMs: inspection.certificateLifetimeMs,
      handshakeTimeoutMs: this.options.connectTimeoutMs,
      requestTimeoutMs: this.options.requestTimeoutMs,
    }, signal)
    const route = await super.startChain({ ...options, inspectTunnel: async (host, port, requestSignal) => {
      const bounded = AbortSignal.any([requestSignal, AbortSignal.timeout(this.options.connectTimeoutMs)])
      await this.resolve(guardedTunnelUrl(host, port), bounded)
      return https.prepare(host, port, bounded)
    } }, signal)
    return { ...route, certificate: https.certificate }
  }

  private async authorize(destination: HttpFetchDestination, signal: AbortSignal, resolution?: TargetHttpResolution): Promise<void> {
    await authorizeGuardedHttp(this.ctx, destination, signal)
    assertNetworkAllowed(await this.protection.checkHttp(destination, signal, resolution))
    signal.throwIfAborted()
  }

  private async resolve(url: URL, signal: AbortSignal): Promise<readonly PublicAddress[]> {
    const authority = { origin: url.origin, hostname: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) }
    await this.authorize({ ...authority, phase: 'before-resolution', route: 'proxy' }, signal)
    const snapshot = await this.protection.snapshot()
    const ownerTest = hasExactTestServer(snapshot.preferences, canonicalTargetHost(url.hostname), authority.port)
    const resolution = ownerTest ? await this.protection.resolveConnectionTarget(url.hostname, signal)
      : await this.protection.resolveHttpTarget(url.hostname, signal)
    const addresses = Object.freeze(resolution.addresses.map(address => Object.freeze({ ...address })))
    await this.authorize({ ...authority, phase: 'before-connect', route: 'proxy', binding: 'literal-connect', addresses }, signal, resolution)
    if (ownerTest && (await this.protection.snapshot()).revision !== snapshot.revision) {
      throw new WebError('The private target exception changed during resolution; no connection was opened.', 'TARGET_POLICY_CHANGED')
    }
    return addresses
  }

  protected override async requestHttp(
    upstream: Upstream, _dispatcher: ProxyDispatcher, url: URL, request: ProxyHttpRequest, signal: AbortSignal,
  ): Promise<PinnedResponse> {
    const target = validateFetchUrl(url.toString())
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(request.headers)) {
      if (name.toLowerCase() === 'host') {
        const authority = new URL(`${target.protocol}//${value}`)
        if (authority.origin !== target.origin || authority.username !== '' || authority.password !== ''
          || authority.pathname !== '/' || authority.search !== '' || authority.hash !== '') {
          throw new WebError('The HTTP Host does not match the destination being authorized.', 'TARGET_IDENTITY_UNVERIFIED')
        }
      } else if (name.toLowerCase() !== 'proxy-authorization') headers[name] = value
    }
    headers.host = target.host
    const addresses = await this.resolve(target, signal)
    const proxy = new URL(proxyUrl(upstream))
    if (upstream.password !== undefined) { proxy.username = upstream.username; proxy.password = upstream.password }
    const exchange = await requestPinnedViaProxy(proxy.toString(), target, addresses, headers, signal, {
      method: request.method, ...request.body === undefined ? {} : { body: request.body },
    })
    return {
      response: exchange.response,
      async close() {
        try { await exchange.response.body?.cancel().catch(() => undefined) }
        finally { await exchange.close() }
      },
    }
  }

  protected override async openTunnel(upstream: Upstream, host: string, port: number, signal: AbortSignal): Promise<UpstreamTunnel> {
    const target = guardedTunnelUrl(host, port)
    const literal = canonicalTargetHost(target.hostname)
    const snapshot = await this.protection.snapshot()
    // A hostname or database selector cannot attest the application identity inside CONNECT.
    const family = isIP(literal)
    if (family === 0 || !hasExactTestServer(snapshot.preferences, literal, port)) {
      if (family === 0) await this.resolve(target, signal)
      throw new WebError('An opaque tunnel requires an exact test-server IP rule. Use the guarded HTTP client for hostnames.',
        'TARGET_EXECUTION_UNCONFINED')
    }
    const addresses = await this.resolve(target, signal)
    const address = addresses.at(0)
    if (address === undefined || addresses.length !== 1 || canonicalTargetHost(address.address) !== literal) {
      throw new WebError('The opaque tunnel did not resolve to its authorized IP.', 'TARGET_IDENTITY_UNVERIFIED')
    }
    signal.throwIfAborted()
    const revocation = new AbortController()
    const closed = Promise.withResolvers<undefined>()
    let tunnel: UpstreamTunnel | undefined
    const release = this.protection.retainNativeExecution(snapshot.revision, () => {
      revocation.abort(new WebError('The test-server tunnel was revoked.', 'TARGET_POLICY_CHANGED'))
      tunnel?.socket.destroy()
      return closed.promise
    })
    const finish = (): void => {
      try { release() }
      catch (error: unknown) { this.ctx.logger.error(error) }
      finally { closed.resolve(undefined) }
    }
    const execution = AbortSignal.any([signal, revocation.signal])
    try {
      tunnel = await connectThrough(upstream, address.address, port, this.options.connectTimeoutMs, execution)
      if (tunnel.socket.closed) finish()
      else tunnel.socket.once('close', finish)
      execution.throwIfAborted()
      return tunnel
    } catch (error) {
      if (tunnel === undefined) finish()
      else tunnel.socket.destroy()
      await closed.promise
      throw error
    }
  }

  protected override async probe(upstream: Upstream, signal: AbortSignal): Promise<number> {
    const started = performance.now()
    const target = guardedTunnelUrl(this.options.testTarget.host, this.options.testTarget.port)
    const addresses = await this.resolve(target, signal)
    const address = addresses.at(0)
    if (address === undefined) throw new WebError('The proxy check has no authorized destination.', 'TARGET_IDENTITY_UNVERIFIED')
    const tunnel = await connectThrough(upstream, address.address, this.options.testTarget.port, this.options.connectTimeoutMs, signal)
    if (!tunnel.socket.closed) {
      await new Promise<void>((resolve) => { tunnel.socket.once('close', () => { resolve() }); tunnel.socket.destroy() })
    }
    signal.throwIfAborted()
    if (tunnel.socket.errored !== null) throw tunnel.socket.errored
    return Math.round(performance.now() - started)
  }
}

/**
 * Replace security-proxy-local with the guarded implementation in an explicitly protected composition.
 * @param ctx - Owner of the credentials and mandatory target-policy dependencies.
 * @param config - Independent-proxy configuration after schema defaults.
 * @returns Completion after proxy activation.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const protection = ctx.targetProtection
  await mountSecurityProxy(ctx, config, options => new ProtectedProxyEngine(options, ctx, protection, config.httpsInspection ?? undefined))
  ctx.provide('targetProtectedProxy', true)
}
