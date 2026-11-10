/** Resolve the security-mode proxy for a newly owned browser. @module */
import { X509Certificate } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-security-proxy'

/** Proxy and optional public CA for one owned browser's launch. */
export interface BrowserProxyRoute {
  readonly server: string
  readonly certificate?: string
}

/**
 * Select a session-owned loopback proxy without changing Host or browser-control traffic.
 * Externally attached browsers cannot adopt launch-time proxy settings.
 * @param ctx Provider context with an optional security proxy.
 * @param agent Exact Agent owning the browser.
 * @param tool Stable browser-provider label used for captured traffic.
 * @param owned Whether the provider launches its own browser.
 * @param signal Browser acquisition cancellation.
 * @returns The local HTTP proxy endpoint, or undefined when this session is not covered.
 */
export async function resolveBrowserProxy(
  ctx: Context, agent: Agent, tool: string, owned: boolean, signal: AbortSignal,
): Promise<string | undefined> {
  return (await resolveBrowserProxyRoute(ctx, agent, tool, owned, signal))?.server
}

/**
 * Resolve the full launch route with public trust material from the owning listener.
 * @param ctx Provider context with an optional security proxy.
 * @param agent Exact Agent owning the browser.
 * @param tool Stable browser-provider label used for captured traffic.
 * @param owned Whether the provider launches its own browser.
 * @param signal Browser acquisition cancellation.
 * @returns The local proxy route, or undefined when the browser uses ordinary networking.
 */
export async function resolveBrowserProxyRoute(
  ctx: Context, agent: Agent, tool: string, owned: boolean, signal: AbortSignal,
): Promise<BrowserProxyRoute | undefined> {
  signal.throwIfAborted()
  const proxy = ctx.get('securityProxy')
  if (proxy?.route(agent, tool) === undefined) return undefined
  if (!owned) throw new Error('Security proxy requires a newly launched browser; switch the browser provider from attach to launch.')
  const environment = await proxy.environment(agent, tool)
  signal.throwIfAborted()
  if (environment === undefined) return undefined
  const endpoint = environment.HTTP_PROXY
  if (endpoint === undefined) throw new Error('Security proxy did not provide an HTTP browser endpoint.')
  let url: URL
  try { url = new URL(endpoint) }
  catch {
    // URL parser errors can retain credentials from an invalid provider response.
    throw new Error('Security proxy returned an invalid browser endpoint.')
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw new Error('Security proxy must provide a loopback HTTP browser endpoint without embedded credentials.')
  }
  const certificate = environment.DSH_SECURITY_PROXY_CA_PEM
  return { server: endpoint, ...certificate === undefined ? {} : { certificate } }
}

/**
 * Seed Chromium's certificate preference before its first launch on a new profile.
 * @param profile Empty temporary user-data directory owned by this launch.
 * @param pem Public CA certificate issued by the session proxy.
 */
export async function writeChromiumProfileTrust(profile: string, pem: string): Promise<void> {
  if (pem.length > 8192 || !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/u.test(pem)) {
    throw new Error('Security proxy returned invalid browser trust material.')
  }
  const root = new X509Certificate(pem)
  const now = Date.now()
  if (!root.ca || !root.checkIssued(root) || !root.verify(root.publicKey)
    || now < root.validFromDate.getTime() || now >= root.validToDate.getTime()) {
    throw new Error('The security proxy certificate is invalid or expired.')
  }
  const directory = join(profile, 'Default')
  await mkdir(directory)
  await writeFile(join(directory, 'Preferences'), JSON.stringify({
    certificates: { ca_certificates: [root.raw.toString('base64')] },
  }), { flag: 'wx' })
}
