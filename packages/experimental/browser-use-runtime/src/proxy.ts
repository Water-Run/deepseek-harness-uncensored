/** Resolve the security-mode proxy for a newly owned browser. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-security-proxy'

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
  return endpoint
}
