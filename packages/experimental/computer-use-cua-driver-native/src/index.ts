/** In-process Cua Driver provider using the host desktop permissions. @module */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { mountNativeComputerUse } from './native.ts'

/** Cordis plugin identity for the native Cua Driver provider. */
export const name = 'experimental-computer-use-cua-driver-native'

/** Services required before the native runtime can publish tools. */
export const inject = ['computerUse', 'tools', 'systemPrompt']

/** The native provider uses the installed SDK's same-process defaults. */
export const Config = Schema.object({})

/**
 * Own one native runtime and expose its catalog through the MCP result adapter.
 * Startup failures roll back every registration. Unload removes tools, aborts
 * calls and image admission, awaits settlement and SDK shutdown, then releases computer use.
 * @param ctx - context providing the exclusive registration and tool services.
 * @returns after native import, runtime creation, and tool discovery complete.
 */
export async function apply(ctx: Context): Promise<void> {
  const controller = new AbortController()
  await mountNativeComputerUse(ctx, { signal: controller.signal,
    check: () => { controller.signal.throwIfAborted() }, release: () => { controller.abort() } })
}
