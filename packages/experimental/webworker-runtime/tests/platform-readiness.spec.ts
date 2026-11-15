/** A failed real WASM engine prevents image activation and settles queued requests. */
import { expect, it, vi } from 'vitest'
import { createWorkerHost } from '../src/worker-host.ts'
import { initializeSqlite } from '../src/node/sqlite-engine.ts'
import type { TunnelOutboundFrame } from '../src/transport/frames.ts'

it('reports SQLite initialization failure before installing process globals or dispatching requests', async () => {
  const originalProcess = globalThis.process
  const frames: TunnelOutboundFrame[] = []
  const requestListener = vi.fn(async () => () => {})
  const host = createWorkerHost({
    image: new Uint8Array(),
    staticModules: {},
    channel: { postMessage: (frame) => { frames.push(frame) } },
    requestListener,
    initializePlatform: () => initializeSqlite(new Uint8Array([0, 1, 2])),
  })
  host.handleMessage({ t: 'req', id: 1, method: 'GET', url: 'http://localhost/__boot__', headers: {} })
  try {
    await expect(host.start()).rejects.toThrow()
    expect(host.vfs).toBeUndefined()
    expect(host.modules).toBeUndefined()
    expect(globalThis.process).toBe(originalProcess)
    expect(requestListener).not.toHaveBeenCalled()
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ t: 'res', id: 1, status: 503 })
    host.handleMessage({ t: 'req', id: 2, method: 'GET', url: 'http://localhost/__boot__', headers: {} })
    expect(frames[1]).toMatchObject({ t: 'res', id: 2, status: 503 })
  } finally { await host.stop() }
})
