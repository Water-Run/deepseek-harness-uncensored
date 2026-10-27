/** Independent security proxy backed by a mandatory, retained target-rule owner. @module */
import type { Context } from '@deepseek-ai/cordis'
import {
  Config as ProxyConfig, SecurityProxyEngine, mountSecurityProxy, proxyUrl, connectThrough,
} from '@deepseek-ai/dsh-security-proxy-local'
import type { EngineOptions, ProxyHttpRequest, ProxyDispatcher, Upstream, UpstreamTunnel } from '@deepseek-ai/dsh-security-proxy-local'
import { requestPinnedViaProxy, validateFetchUrl } from '@deepseek-ai/dsh-web-fetch-http'
import type { HttpFetchDestination, PinnedResponse, PublicAddress } from '@deepseek-ai/dsh-web-fetch-http'
import { WebError } from '@deepseek-ai/dsh-web'
import type TargetProtection from './index.ts'
import type { TargetHttpResolution } from './index.ts'
import { assertNetworkAllowed } from './network-decision.ts'

/** Cordis diagnostics name. */
export const name = 'target-protected-security-proxy'
/** Removing either dependency withdraws this proxy instead of restoring an unguarded one. */
export const inject = ['credentials', 'targetProtection']
/** Existing independent-proxy deployment settings. */
export const Config = ProxyConfig
/** Existing independent-proxy deployment configuration. */
export type Config = ProxyConfig

class ProtectedProxyEngine extends SecurityProxyEngine {
  constructor(options: EngineOptions, private readonly ctx: Context, private readonly protection: TargetProtection) {
    super(options)
  }

  protected override executionSignal(): AbortSignal {
    return AbortSignal.any([super.executionSignal(), this.protection.executionSignal()])
  }

  protected override retainExecution(): () => void { return this.protection.retainExecution() }

  private async authorize(destination: HttpFetchDestination, signal: AbortSignal, resolution?: TargetHttpResolution): Promise<void> {
    signal.throwIfAborted()
    const veto = await this.ctx.serial('web-fetch/authorize', Object.freeze(destination), signal)
    if (veto !== undefined) throw new WebError(veto.reason, 'WEB_TARGET_PROTECTED')
    assertNetworkAllowed(await this.protection.checkHttp(destination, signal, resolution))
    signal.throwIfAborted()
  }

  private async resolve(url: URL, signal: AbortSignal): Promise<readonly PublicAddress[]> {
    const authority = { origin: url.origin, hostname: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) }
    await this.authorize({ ...authority, phase: 'before-resolution', route: 'proxy' }, signal)
    const resolution = await this.protection.resolveHttpTarget(url.hostname, signal)
    const addresses = Object.freeze(resolution.addresses.map(address => Object.freeze({ ...address })))
    await this.authorize({ ...authority, phase: 'before-connect', route: 'proxy', binding: 'literal-connect', addresses }, signal, resolution)
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

  protected override async openTunnel(_upstream: Upstream, host: string, port: number, signal: AbortSignal): Promise<UpstreamTunnel> {
    await this.resolve(tunnelUrl(host, port), signal)
    throw new WebError('An opaque tunnel cannot verify its application targets. Use the guarded HTTP client.', 'TARGET_EXECUTION_UNCONFINED')
  }

  protected override async probe(upstream: Upstream, signal: AbortSignal): Promise<number> {
    const started = performance.now()
    const target = tunnelUrl(this.options.testTarget.host, this.options.testTarget.port)
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

function tunnelUrl(host: string, port: number): URL {
  const name = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return validateFetchUrl(`https://${name}:${String(port)}/`)
}

/**
 * Replace security-proxy-local with the guarded implementation in an explicitly protected composition.
 * @param ctx - Owner of the credentials and mandatory target-policy dependencies.
 * @param config - Independent-proxy configuration after schema defaults.
 * @returns Completion after proxy activation.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const protection = ctx.targetProtection
  await mountSecurityProxy(ctx, config, options => new ProtectedProxyEngine(options, ctx, protection))
}
