/** Debugger disconnection cannot revoke arbitrary effects admitted to the Host realm. */
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import WebSocket from 'ws'
import { startInspector } from '../src/host/bridge/controller.ts'

it('a Host callback admitted by evaluation still runs after the debugger Worker closes', async () => {
  const handle = await startInspector({ port: 0, captureFetch: false })
  const gate = Promise.withResolvers<undefined>()
  const observed = Promise.withResolvers<undefined>()
  const key = `__dshu_inspector_probe_${randomUUID()}`
  let socket: WebSocket | undefined
  let closed: Promise<void> | undefined
  try {
    Reflect.defineProperty(globalThis, key, { configurable: true, value: {
      gate: gate.promise, mark: () => { observed.resolve(undefined) },
    } })
    socket = new WebSocket(handle.endpoint.webSocketDebuggerUrl)
    closed = new Promise<void>((resolve) => { socket!.once('close', () => { resolve() }) })
    const response = Promise.withResolvers<unknown>()
    socket.on('message', (data) => {
      try {
        const payload = Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? Buffer.from(data) : data
        const message: unknown = JSON.parse(payload.toString('utf8'))
        if (typeof message === 'object' && message !== null && 'id' in message && message.id === 1) response.resolve(message)
      } catch (error) { response.reject(error) }
    })
    socket.on('error', (error) => { response.reject(error) })
    await new Promise<void>((resolve, reject) => {
      socket!.once('open', () => { resolve() })
      socket!.once('error', reject)
    })
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `(() => { const probe = globalThis[${JSON.stringify(key)}]; probe.gate.then(probe.mark); return 'armed'; })()`,
      returnByValue: true,
    } }))
    expect(await response.promise).toMatchObject({ id: 1, result: { result: { value: 'armed' } } })
    socket.close()
    await closed
    await handle.close()
    gate.resolve(undefined)
    await observed.promise
  } finally {
    gate.resolve(undefined)
    try {
      socket?.terminate()
      if (closed !== undefined) await closed
    } finally {
      try { await handle.close() }
      finally { Reflect.deleteProperty(globalThis, key) }
    }
  }
})
