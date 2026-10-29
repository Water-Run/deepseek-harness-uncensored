/** Read-only discovery of the pinned runtime extension before reattaching. @module */
import { readFile } from 'node:fs/promises'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'

const versionSchema = z.object({ webSocketDebuggerUrl: z.url().refine(value => /^wss?:/u.test(value)) })
const extensionsSchema = z.object({ extensions: z.array(z.object({
  id: z.string().regex(/^[a-p]{32}$/u), name: z.string(), version: z.string(), enabled: z.boolean(),
})) })

/**
 * Reuse an enabled, version-matched Stagehand extension without reloading its service worker.
 * @param endpoint - Explicit trusted browser debugging endpoint.
 * @param timeoutMs - Existing browser operation deadline.
 * @returns Its extension id, or undefined when the SDK must install its bundled extension.
 */
export async function findRuntimeExtension(endpoint: string, timeoutMs: number): Promise<string | undefined> {
  const signal = AbortSignal.timeout(timeoutMs)
  const asset = new URL('./extension/manifest.json', import.meta.resolve('@browserbasehq/stagehand'))
  const manifest = z.object({ name: z.string(), version: z.string() }).parse(JSON.parse(await readFile(asset, 'utf8')))
  let address = endpoint
  if (!/^wss?:/u.test(address)) {
    const response = await fetch(endpoint.replace(/\/$/u, '') + '/json/version', { signal })
    if (!response.ok) throw new HarnessError('Browser debugging metadata is unavailable. Check the configured endpoint.', 'BROWSER_EXTENSION_DISCOVERY_FAILED')
    address = versionSchema.parse(await response.json()).webSocketDebuggerUrl
  }
  signal.throwIfAborted()
  const socket = new WebSocket(address)
  const closed = new Promise<void>((resolve) => { socket.addEventListener('close', () => { resolve() }, { once: true }) })
  const result = Promise.withResolvers<unknown>()
  const abort = (): void => { result.reject(signal.reason); socket.close() }
  signal.addEventListener('abort', abort, { once: true })
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ id: 1, method: 'Extensions.getExtensions', params: {} }))
  }, { once: true })
  socket.addEventListener('message', (event) => {
    try {
      if (typeof event.data !== 'string') throw new Error('Browser debugging metadata must be text')
      const reply = z.object({ id: z.number().optional(), result: z.unknown().optional(), error: z.unknown().optional() })
        .parse(JSON.parse(event.data))
      if (reply.id !== 1) return
      if (reply.error !== undefined) throw new HarnessError(
        'This browser cannot inspect installed extensions. Configure extensionId explicitly or use compatible Chromium.',
        'BROWSER_EXTENSION_DISCOVERY_FAILED')
      result.resolve(reply.result)
    } catch (error) {
      result.reject(error)
    }
  })
  socket.addEventListener('error', () => { result.reject(new HarnessError('Cannot inspect the configured browser. Check its debugging endpoint.', 'BROWSER_EXTENSION_DISCOVERY_FAILED')) }, { once: true })
  socket.addEventListener('close', () => { result.reject(new HarnessError('Browser closed during extension discovery.', 'BROWSER_EXTENSION_DISCOVERY_FAILED')) }, { once: true })
  try {
    signal.throwIfAborted()
    const extensions = extensionsSchema.parse(await result.promise).extensions.filter(item => item.name === manifest.name)
    const extension = extensions[0]
    if (extension === undefined) return undefined
    if (extensions.length !== 1 || !extension.enabled || extension.version !== manifest.version) {
      throw new HarnessError('Installed Stagehand extensions are disabled, duplicated or incompatible. Choose a compatible extensionId explicitly.', 'BROWSER_EXTENSION_IDENTITY_MISMATCH')
    }
    return extension.id
  } finally {
    signal.removeEventListener('abort', abort)
    socket.close()
    await closed
  }
}
