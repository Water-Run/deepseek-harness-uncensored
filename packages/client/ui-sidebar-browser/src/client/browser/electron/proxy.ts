/** Resolve native browser routing through the owning conversation's Host resource. */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { DesktopBrowserProxy } from '../../../types.ts'

/** Only the Remote reads needed before acquiring a native guest. */
export type BrowserProxyPort = Pick<ClientRemote['securityProxy'], 'get' | 'browserEnvironment'>

/**
 * Read the actual Host mode and proxy, without starting an Agent while the feature is off.
 * @param port - Available proxy Remote, absent for deployments without the feature.
 * @param sessionId - Owning conversation, never a renderer-supplied mode.
 * @param signal - Native guest acquisition lifetime.
 * @returns Session routing, or undefined when this conversation uses ordinary networking.
 */
export async function browserProxy(
  port: BrowserProxyPort | 'unavailable' | undefined, sessionId: DesktopBrowserProxy['sessionId'], signal: AbortSignal,
): Promise<DesktopBrowserProxy | undefined> {
  signal.throwIfAborted()
  if (port === undefined) return undefined
  if (port === 'unavailable') throw new Error('Browser proxy service is unavailable; reconnect before opening the page')
  const state = await port.get()
  signal.throwIfAborted()
  if (!state.ok) throw state.error
  if (!state.value.settings.enabled) return undefined
  const route = await port.browserEnvironment(sessionId)
  signal.throwIfAborted()
  if (!route.ok) throw route.error
  return route.value === undefined ? undefined : { sessionId, server: route.value }
}
