/** CONNECT response framing at a real local proxy socket. @module */
import { createServer } from 'node:http'
import type { Socket } from 'node:net'
import { expect, it, onTestFinished } from 'vitest'
import { connectThrough } from '../src/upstream.ts'

it('preserves target bytes delivered with the CONNECT response headers', async () => {
  const server = createServer()
  const sockets = new Map<Socket, Promise<void>>()
  server.on('connection', (socket) => {
    socket.on('error', () => {}) // The client assertion owns transport failures.
    sockets.set(socket, new Promise<void>((resolve) => { socket.once('close', resolve) }))
  })
  server.on('connect', (_request, socket) => {
    socket.end('HTTP/1.1 200 Connection Established\r\n\r\nSSH-2.0-fixture\r\n')
  })
  onTestFinished(async () => {
    for (const socket of sockets.keys()) socket.destroy()
    await Promise.all(sockets.values())
    if (server.listening) await new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve() })
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Proxy listener did not bind an IP port')
  const { socket } = await connectThrough({ protocol: 'http', host: '127.0.0.1', port: address.port,
    username: '', password: undefined }, '127.0.0.1', 22, 5000)
  onTestFinished(async () => {
    if (socket.closed) return
    await new Promise<void>((resolve) => { socket.once('close', resolve); socket.destroy() })
  })
  const chunks: Uint8Array[] = []
  for await (const chunk of socket) {
    if (!(chunk instanceof Uint8Array)) throw new Error('Expected tunnel bytes')
    chunks.push(chunk)
  }
  expect(Buffer.concat(chunks).toString()).toBe('SSH-2.0-fixture\r\n')
})
