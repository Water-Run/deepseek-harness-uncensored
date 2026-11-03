/** Owned proxy fixture that forwards only to the selected local test origin. */
import { createServer, request, type ClientRequest } from 'node:http'
import { once } from 'node:events'
import type { Socket } from 'node:net'

/**
 * Start a private HTTP proxy and retain its requests until explicit shutdown.
 * @param targetOrigin The only target origin this fixture may contact.
 * @returns Listener URL, observed target URLs, and joined connection cleanup.
 */
export async function startBrowserProxy(targetOrigin: string): Promise<{
  url: string
  requests: Set<string>
  close(): Promise<void>
}> {
  const requests = new Set<string>()
  const active = new Map<ClientRequest, Promise<void>>()
  const sockets = new Map<Socket, Promise<void>>()
  const server = createServer((incoming, response) => {
    let target: URL
    try { target = new URL(incoming.url!) }
    catch { response.writeHead(400); response.end(); return }
    requests.add(target.href)
    if (target.origin !== targetOrigin) { response.writeHead(502); response.end(); return }
    const upstream = request(target, { method: incoming.method, agent: false }, (source) => {
      response.writeHead(source.statusCode!, source.headers)
      source.pipe(response)
    })
    active.set(upstream, new Promise<void>((resolve) => { upstream.once('close', () => { active.delete(upstream); resolve() }) }))
    upstream.on('error', () => { response.destroy() })
    incoming.on('aborted', () => { upstream.destroy() })
    incoming.pipe(upstream)
  })
  server.on('connect', (request, socket) => {
    requests.add(`CONNECT ${request.url ?? ''}`)
    // Chromium may reset rejected background HTTPS requests before reading the refusal.
    socket.on('error', () => { socket.destroy() })
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
  })
  server.on('connection', (socket) => {
    sockets.set(socket, new Promise<void>((resolve) => { socket.once('close', () => { sockets.delete(socket); resolve() }) }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Fixture proxy has no TCP listener')
  return {
    url: `http://127.0.0.1:${address.port}`, requests,
    async close() {
      const closing = new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
      server.closeAllConnections()
      const pending = [...active.values(), ...sockets.values()]
      for (const upstream of active.keys()) upstream.destroy()
      for (const socket of sockets.keys()) socket.destroy()
      await Promise.all([closing, ...pending])
    },
  }
}
