/** Closed RPC peers ignore buffered input even when the carrier owns readable shutdown. @module */
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SshRpcPeer } from '../../src/protocol.ts'

class CarrierOwnedStream extends PassThrough {
  override destroy(): this { return this }
}

it('does not dispatch a frame arriving after peer closure', async () => {
  const input = new CarrierOwnedStream(), output = new PassThrough(), calls: string[] = []
  const peer = new SshRpcPeer(input, output, 4096, 8, (method) => { calls.push(method); return Promise.resolve(null) })
  try {
    peer.close()
    const ended = once(input, 'end')
    const body = Buffer.from(JSON.stringify({ type: 'request', id: randomUUID(), method: 'late', params: {} }))
    const size = Buffer.alloc(4); size.writeUInt32BE(body.length)
    input.end(Buffer.concat([size, body]))
    await ended
    expect(calls).toEqual([])
  } finally {
    peer.close(); PassThrough.prototype.destroy.call(input); output.destroy()
  }
})
