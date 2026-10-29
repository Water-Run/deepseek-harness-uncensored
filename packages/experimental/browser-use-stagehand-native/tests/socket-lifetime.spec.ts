/** Socket handshakes complete before a Worker reports native closure. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { openWithOwnedSockets } from '../src/socket-lifetime.ts'

class Socket extends EventTarget {
  static latest: Socket | undefined
  static readonly CLOSED = 3
  static readonly CLOSING = 2
  readyState = 1
  close = vi.fn(() => { this.readyState = 2 })
  constructor() { super(); Socket.latest = this }
  finish(): void { this.readyState = 3; this.dispatchEvent(new Event('close')) }
}
afterEach(() => { Socket.latest = undefined; vi.unstubAllGlobals() })

it('restores the global constructor after initialization and waits for peer close after SDK drainage', async () => {
  vi.stubGlobal('WebSocket', Socket)
  let socket: Socket | undefined
  const drained = vi.fn(async () => {})
  const runtime = await openWithOwnedSockets(async () => {
    new globalThis.WebSocket('ws://fixture')
    socket = Socket.latest
    return { execute: async () => 'owned', close: drained }
  })
  expect(globalThis.WebSocket).toBe(Socket)
  expect(await runtime.execute('tabs', { action: 'list' })).toBe('owned')
  let closed = false
  const closing = runtime.close().then(() => { closed = true })
  try {
    await vi.waitFor(() => { expect(socket?.close).toHaveBeenCalledOnce() })
    expect(drained).toHaveBeenCalledOnce(); expect(closed).toBe(false)
  } finally { socket?.finish(); await closing }
})

it('restores the constructor and awaits socket cleanup before reporting initialization failure', async () => {
  vi.stubGlobal('WebSocket', Socket)
  let socket: Socket | undefined
  const opening = openWithOwnedSockets(async () => {
    new globalThis.WebSocket('ws://fixture')
    socket = Socket.latest
    throw new Error('SDK initialization failed')
  })
  const outcome = opening.catch((error: unknown) => error)
  try { await vi.waitFor(() => { expect(socket?.close).toHaveBeenCalledOnce() }) }
  finally { socket?.finish(); await outcome }
  expect(await outcome).toMatchObject({ message: 'SDK initialization failed' })
  expect(globalThis.WebSocket).toBe(Socket)
})

it('accepts a closed socket whose close event has not yet been delivered', async () => {
  vi.stubGlobal('WebSocket', Socket)
  const runtime = await openWithOwnedSockets(async () => {
    new globalThis.WebSocket('ws://fixture')
    return { execute: async () => undefined, close: async () => { Socket.latest!.readyState = 3 } }
  })
  await runtime.close()
  expect(Socket.latest?.close).not.toHaveBeenCalled()
  Socket.latest?.finish()
})

it('waits for an already-closing connection without sending another close', async () => {
  vi.stubGlobal('WebSocket', Socket)
  const runtime = await openWithOwnedSockets(async () => {
    new globalThis.WebSocket('ws://fixture')
    return { execute: async () => undefined, close: async () => { Socket.latest?.close() } }
  })
  const closing = runtime.close()
  try { await vi.waitFor(() => { expect(Socket.latest?.close).toHaveBeenCalledTimes(1) }) }
  finally { Socket.latest?.finish(); await closing }
})

it('closes sockets after SDK drainage fails and preserves the failure', async () => {
  vi.stubGlobal('WebSocket', Socket)
  const runtime = await openWithOwnedSockets(async () => {
    new globalThis.WebSocket('ws://fixture')
    return { execute: async () => undefined, close: async () => { throw new Error('SDK drain failed') } }
  })
  const closing = runtime.close().catch((error: unknown) => error)
  try { await vi.waitFor(() => { expect(Socket.latest?.close).toHaveBeenCalledOnce() }) }
  finally { Socket.latest?.finish() }
  expect(await closing).toMatchObject({ errors: [expect.objectContaining({ message: 'SDK drain failed' })] })
})

it('reports unconfirmed connection rollback and restores the constructor', async () => {
  vi.stubGlobal('WebSocket', Socket)
  await expect(openWithOwnedSockets(async () => {
    new globalThis.WebSocket('ws://fixture')
    Socket.latest?.close.mockImplementation(() => { throw new Error('Socket close failed') })
    throw new Error('SDK initialization failed')
  })).rejects.toMatchObject({ code: 'BROWSER_SHUTDOWN_UNCONFIRMED' })
  expect(globalThis.WebSocket).toBe(Socket)
  Socket.latest?.finish()
})

it('reports a connection close failure after the SDK has drained', async () => {
  vi.stubGlobal('WebSocket', Socket)
  const runtime = await openWithOwnedSockets(async () => {
    new globalThis.WebSocket('ws://fixture')
    Socket.latest?.close.mockImplementation(() => { throw new Error('Socket close failed') })
    return { execute: async () => undefined, close: async () => {} }
  })
  await expect(runtime.close()).rejects.toMatchObject({ errors: [expect.objectContaining({ message: 'Socket close failed' })] })
  Socket.latest?.finish()
})
