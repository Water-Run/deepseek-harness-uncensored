/** Native framing preserves binary streams and rejects partial or excessive worker messages. @module */
import { Writable } from 'node:stream'
import { expect, it, vi } from 'vitest'
import { encodeNativeFrame, readNativeFrames, writeNativeFrame, NATIVE_FRAME, NATIVE_FRAME_MAX_BYTES } from '../src/native-protocol.ts'
import type { NativeFrame } from '../src/native-protocol.ts'

async function* chunks(parts: Uint8Array[]) { yield* parts }
async function decode(parts: Uint8Array[]) {
  const frames: NativeFrame[] = []
  for await (const frame of readNativeFrames(chunks(parts))) frames.push(frame)
  return frames
}

it('round trips binary, multibyte JSON and empty EOF frames at every split point', async () => {
  const frames = [
    { tag: NATIVE_FRAME.launch, data: Buffer.from(JSON.stringify({ text: '命令 ✨' })) },
    { tag: NATIVE_FRAME.stdout, data: Buffer.from([0, 10, 255, 13, 128]) },
    { tag: NATIVE_FRAME.stdinEnd, data: Buffer.alloc(0) },
    { tag: NATIVE_FRAME.stderr, data: Buffer.from('error') },
    { tag: NATIVE_FRAME.controlEnd, data: Buffer.alloc(0) },
  ]
  const bytes = Buffer.concat(frames.map(encodeNativeFrame))
  for (let split = 0; split <= bytes.length; split++) {
    expect(await decode([bytes.subarray(0, split), bytes.subarray(split)])).toEqual(frames)
  }
  expect(await decode([...bytes].map(byte => Uint8Array.of(byte)))).toEqual(frames)
  expect(await decode([])).toEqual([])
})

it('accepts the exact maximum payload', async () => {
  const frame = { tag: NATIVE_FRAME.control, data: Buffer.alloc(NATIVE_FRAME_MAX_BYTES, 0xa5) }
  expect(await decode([encodeNativeFrame(frame)])).toEqual([frame])
})

it.each([0, 8, 255, 256, -1, 1.5, NaN])('rejects an undefined outgoing tag %s', (tag) => {
  expect(() => encodeNativeFrame({ tag, data: Buffer.alloc(0) })).toThrow('Unknown native frame tag')
})

it('rejects an oversized outgoing payload and incoming advertised size before allocating it', async () => {
  expect(() => encodeNativeFrame({ tag: NATIVE_FRAME.launch, data: Buffer.alloc(NATIVE_FRAME_MAX_BYTES + 1) }))
    .toThrow('payload limit')
  const header = Buffer.alloc(5); header[0] = NATIVE_FRAME.stdout; header.writeUInt32BE(0xffff_ffff, 1)
  await expect(decode([header])).rejects.toThrow('payload limit')
})

it('rejects undefined incoming tags', async () => {
  await expect(decode([Buffer.alloc(5)])).rejects.toThrow('Unknown native frame tag')
})

it.each([1, 4, 5, 6, 8])('rejects EOF after %s bytes of an incomplete frame', async (length) => {
  const frame = encodeNativeFrame({ tag: NATIVE_FRAME.stdout, data: Buffer.from('data') })
  await expect(decode([frame.subarray(0, length)])).rejects.toThrow('ended within a frame')
})

it('does not mix concurrent writes and waits for each write callback', async () => {
  const writes: Buffer[] = [], callbacks: (() => void)[] = []
  const output = new Writable({ write(chunk: Buffer, _encoding, callback) { writes.push(chunk); callbacks.push(callback) } })
  const first = { tag: NATIVE_FRAME.stdout, data: Buffer.from('first') }
  const second = { tag: NATIVE_FRAME.stderr, data: Buffer.from('second') }
  let settled = false
  const writing = Promise.all([writeNativeFrame(output, first), writeNativeFrame(output, second)]).then(() => { settled = true })
  expect(settled).toBe(false)
  expect(writes).toHaveLength(1)
  callbacks.shift()!()
  expect(writes).toHaveLength(2)
  callbacks.shift()!()
  await writing
  expect(await decode(writes)).toEqual([first, second])
  output.end()
})

it('propagates write failure without retrying or hiding the owned error event', async () => {
  const failure = new Error('transport closed'), reported: Error[] = []
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(failure) } })
  output.on('error', error => reported.push(error))
  await expect(writeNativeFrame(output, { tag: NATIVE_FRAME.stdin, data: Buffer.from('input') })).rejects.toBe(failure)
  expect(reported).toEqual([failure])
})

it('settles a backpressured write when a transport closes without invoking its callback', async () => {
  const output = new Writable({ write() { /* The transport has not acknowledged this write. */ } })
  const pending = writeNativeFrame(output, { tag: NATIVE_FRAME.stdin, data: Buffer.from('input') })
  output.destroy()
  await expect(pending).rejects.toThrow('closed before write completion')
  expect(output.listenerCount('close')).toBe(0)
  await expect(writeNativeFrame(output, { tag: NATIVE_FRAME.stdin, data: Buffer.alloc(0) })).rejects.toThrow('closed')
})

it('removes the close listener if writing throws synchronously', async () => {
  const output = new Writable({ write(_chunk, _encoding, callback) { callback() } })
  const failure = new Error('write rejected')
  const spy = vi.spyOn(output, 'write').mockImplementationOnce(() => { throw failure })
  await expect(writeNativeFrame(output, { tag: NATIVE_FRAME.stdin, data: Buffer.alloc(0) }))
    .rejects.toMatchObject({ cause: failure })
  expect(output.listenerCount('close')).toBe(0)
  spy.mockRestore(); output.destroy()
})
