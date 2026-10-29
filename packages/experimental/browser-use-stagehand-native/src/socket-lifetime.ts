/** CDP socket ownership for the single browser initialization in a private Worker. @module */
import type { NativeBrowserRuntime } from './native.ts'
import { BrowserResourceCleanupError } from '@deepseek-ai/dsh-experimental-browser-use-runtime'

/**
 * Capture SDK WebSockets during one isolated Worker's initialization and await their close handshake.
 * The Worker accepts operations only after this function restores its global constructor.
 * @param open - The Worker's sole SDK initialization; concurrent initialization in the same realm is unsupported.
 * @returns The native runtime with SDK drainage followed by socket closure, preserving external browsers.
 */
export async function openWithOwnedSockets(open: () => Promise<NativeBrowserRuntime>): Promise<NativeBrowserRuntime> {
  const OriginalWebSocket = globalThis.WebSocket
  const sockets = new Set<WebSocket>()
  const OwnedWebSocket = new Proxy(OriginalWebSocket, {
    construct(target, args) {
      const socket = Reflect.construct(target, args) as WebSocket
      sockets.add(socket)
      socket.addEventListener('close', () => { sockets.delete(socket) }, { once: true })
      return socket
    },
  })
  const closeSockets = async (): Promise<void> => {
    await Promise.all([...sockets].map(socket => new Promise<void>((resolve) => {
      if (socket.readyState === OriginalWebSocket.CLOSED) { resolve(); return }
      socket.addEventListener('close', () => { resolve() }, { once: true })
      if (socket.readyState !== OriginalWebSocket.CLOSING) socket.close()
    })))
  }
  let native: NativeBrowserRuntime
  globalThis.WebSocket = OwnedWebSocket
  try { native = await open() }
  catch (error) {
    try { await closeSockets() }
    catch (cleanupError) {
      throw new BrowserResourceCleanupError('Stagehand connection rollback could not be confirmed.',
        { cause: new AggregateError([error, cleanupError]) })
    }
    throw error
  } finally { globalThis.WebSocket = OriginalWebSocket }
  return {
    execute: (method, args, signal) => native.execute(method, args, signal),
    async close() {
      const errors: unknown[] = []
      try { await native.close() } catch (error) { errors.push(error) }
      try { await closeSockets() } catch (error) { errors.push(error) }
      if (errors.length > 0) throw new AggregateError(errors, 'Stagehand SDK or connection closure failed')
    },
  }
}
