/** Disposable CONNECT proxy for SSH route and shutdown checks. @module */
import { createServer } from 'node:http'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'
import { onTestFinished } from 'vitest'

/** @param options - Deliberate refusal, authentication or pending-handshake behavior. @returns Owned route and observations. */
export async function proxyFixture(options: { status?: number; authorization?: string; hold?: boolean } = {}) {
  const server = createServer()
  const sockets = new Map<Duplex, Promise<void>>()
  const entered = Promise.withResolvers<boolean>()
  const peerClosed = Promise.withResolvers<undefined>()
  const requests: { authority: string; authorization: string | undefined }[] = []
  let connections = 0
  function own(socket: Duplex) {
    socket.on('error', () => { socket.destroy() })
    sockets.set(socket, new Promise<void>((resolve) => { socket.once('close', () => { sockets.delete(socket); resolve() }) }))
    return socket
  }
  server.on('connection', (socket) => {
    connections++; own(socket)
    socket.once('close', () => { peerClosed.resolve(undefined) })
  })
  server.on('connect', (request, client, head) => {
    const authority = request.url ?? ''
    requests.push({ authority, authorization: request.headers['proxy-authorization'] })
    entered.resolve(true)
    if (options.hold) {
      client.once('end', () => { client.destroy() })
      client.resume()
      return
    }
    const status = options.authorization !== undefined && request.headers['proxy-authorization'] !== options.authorization
      ? 407 : options.status ?? 200
    if (status !== 200) { client.end(`HTTP/1.1 ${status} Refused\r\n\r\n`); return }
    const destination = new URL(`http://${authority}`)
    const upstream = own(connect({ host: destination.hostname, port: Number(destination.port) }))
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      client.pipe(upstream).pipe(client)
    })
    client.once('close', () => { upstream.destroy() })
    upstream.once('close', () => { client.destroy() })
  })
  onTestFinished(async () => {
    const closed = [...sockets.values()]
    for (const socket of sockets.keys()) socket.destroy()
    await Promise.all(closed)
    if (server.listening) await new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve() })
    })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Proxy listener has no IP port')
  return { config: { protocol: 'http' as const, host: '127.0.0.1', port: address.port },
    requests, entered: entered.promise, peerClosed: peerClosed.promise, connections: () => connections, open: () => sockets.size }
}
