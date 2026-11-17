import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { SshRpcPeer, RemoteOperationError } from '../src/protocol.ts'

describe('SSH helper protocol', () => {
  it('keeps rule receipts attached to their own concurrent result or refusal', async () => {
    const inbound = new PassThrough(), outbound = new PassThrough()
    const entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
    const slow: number[][] = [], refused: number[][] = [], plain: number[][] = []
    const server = new SshRpcPeer(outbound, inbound, 4096, 8, async (method, _raw, _signal, report) => {
      if (method === 'slow') { report([0]); entered.resolve(undefined); await release.promise; report([1, 0]); return 'completed' }
      if (method === 'refuse') { report([2]); throw new RemoteOperationError('Read-only file', 'TARGET_READ_ONLY') }
      return 'plain'
    })
    const client = new SshRpcPeer(inbound, outbound, 4096, 8)
    const pending = client.request('slow', {}, z.string(), undefined, (indexes) => { slow.push([...indexes]) })
    const settled = Promise.allSettled([pending])
    try {
      await entered.promise
      await expect(client.request('refuse', {}, z.string(), undefined, (indexes) => { refused.push([...indexes]) }))
        .rejects.toMatchObject({ code: 'TARGET_READ_ONLY', fileRules: [2] })
      await expect(client.request('plain', {}, z.string(), undefined, (indexes) => { plain.push([...indexes]) })).resolves.toBe('plain')
      release.resolve(undefined)
      await expect(pending).resolves.toBe('completed')
      expect(slow).toEqual([[0, 1]])
      expect(refused).toEqual([[2]])
      expect(plain).toEqual([[]])
    } finally { release.resolve(undefined); client.close(); server.close(); await settled }
  })

  it.each([-1, 128, 0.5])('rejects an invalid remote rule index %s before exposing a receipt', async (index) => {
    const inbound = new PassThrough(), outbound = new PassThrough()
    const server = new SshRpcPeer(outbound, inbound, 4096, 8, async (_method, _raw, _signal, report) => { report([index]); return null })
    const client = new SshRpcPeer(inbound, outbound, 4096, 8), report = vi.fn()
    try {
      await expect(client.request('read', {}, z.null(), undefined, report)).rejects.toBeInstanceOf(z.ZodError)
      expect(report).not.toHaveBeenCalled()
    } finally { client.close(); server.close() }
  })

  it('validates responses and retains typed operation errors', async () => {
    const inbound = new PassThrough()
    const outbound = new PassThrough()
    const server = new SshRpcPeer(outbound, inbound, 4096, 8, async (method, raw) => {
      if (method === 'write') throw Object.assign(new Error('stale'), { code: 'FS_STALE_VERSION' })
      return z.object({ value: z.string() }).parse(raw).value
    })
    const client = new SshRpcPeer(inbound, outbound, 4096, 8)
    try {
      await expect(client.request('echo', { value: 'a\0b\n中文' }, z.string())).resolves.toBe('a\0b\n中文')
      await expect(client.request('write', {}, z.null())).rejects.toMatchObject({ code: 'FS_STALE_VERSION', message: 'stale' })
      await expect(client.request('echo', { value: 'not a number' }, z.number())).rejects.toThrow()
    } finally { client.close(); server.close() }
  })

  it('rejects excessive lengths before waiting for the payload', async () => {
    const inbound = new PassThrough()
    const outbound = new PassThrough()
    const client = new SshRpcPeer(inbound, outbound, 64, 2)
    const closed = once(client, 'closed')
    const header = Buffer.alloc(4)
    header.writeUInt32BE(65)
    inbound.write(header)
    await expect(closed).resolves.toEqual([expect.objectContaining({ message: 'SSH helper sent an invalid frame length' })])
  })

  it('cancels an admitted operation without replaying it', async () => {
    const inbound = new PassThrough()
    const outbound = new PassThrough()
    const entered = Promise.withResolvers<undefined>()
    const aborted = Promise.withResolvers<undefined>()
    let calls = 0
    const server = new SshRpcPeer(outbound, inbound, 4096, 8, async (_method, _raw, signal) => {
      calls++
      signal.addEventListener('abort', () => { aborted.resolve(undefined) }, { once: true })
      entered.resolve(undefined)
      await aborted.promise
      return null
    })
    const client = new SshRpcPeer(inbound, outbound, 4096, 8)
    const controller = new AbortController()
    try {
      const response = client.request('mutate', {}, z.null(), controller.signal)
      const rejection = expect(response).rejects.toThrow('not rolled back')
      await entered.promise
      controller.abort()
      await rejection
      await aborted.promise
      expect(calls).toBe(1)
    } finally { client.close(); server.close() }
  })

  it('reports an unknown outcome when a connection disappears after admission', async () => {
    const inbound = new PassThrough()
    const outbound = new PassThrough()
    const entered = Promise.withResolvers<undefined>()
    const server = new SshRpcPeer(outbound, inbound, 4096, 8, async (_method, _raw, signal) => {
      entered.resolve(undefined)
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      return null
    })
    const client = new SshRpcPeer(inbound, outbound, 4096, 8)
    const pending = client.request('write', {}, z.null())
    const rejection = expect(pending).rejects.toThrow('unknown')
    await entered.promise
    client.close()
    server.close()
    await rejection
    expect(new RemoteOperationError('remote failure', 'FS_IO_ERROR').code).toBe('FS_IO_ERROR')
  })
})
