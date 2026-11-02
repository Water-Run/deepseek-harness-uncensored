/** Bounded binary frames for the private confined-command worker; target bytes remain opaque. @module */
import type { Writable } from 'node:stream'

/** Wire frame tags; separate data streams cannot forge lifecycle messages. */
export const NATIVE_FRAME = {
  launch: 1, stdin: 2, stdinEnd: 3, control: 4, controlEnd: 5, terminate: 6, configure: 7,
  stdout: 16, stderr: 17, controlOutput: 18, accepted: 19, exited: 20, failed: 21, streamClosed: 22, rangeExited: 23,
  terminalRequest: 32, terminalReply: 33, terminalOutput: 34, terminalExit: 35,
} as const

/** Maximum payload in one protocol frame, including JSON or encoded control data. */
export const NATIVE_FRAME_MAX_BYTES = 1024 * 1024

/** One private protocol frame, independent of stream chunk boundaries. */
export interface NativeFrame {
  tag: number
  data: Uint8Array
}

/** A broken private protocol invalidates the worker; it never authorizes further dispatch. */
export class NativeProtocolError extends Error {
  /** @param message - Protocol failure without target arguments or environment values. */
  constructor(message: string) { super(message); this.name = 'NativeProtocolError' }
}

/**
 * Encode a single frame as a tag, unsigned big-endian payload length, and opaque bytes.
 * @param frame - Payload with a protocol-defined tag; callers validate the direction and phase separately.
 * @returns One atomic stream write, bounded by the protocol payload limit plus five header bytes.
 */
export function encodeNativeFrame(frame: NativeFrame): Buffer {
  if (!Object.values<number>(NATIVE_FRAME).includes(frame.tag)) throw new NativeProtocolError('Unknown native frame tag.')
  if (frame.data.byteLength > NATIVE_FRAME_MAX_BYTES) throw new NativeProtocolError('Native frame exceeds its payload limit.')
  const bytes = Buffer.allocUnsafe(5 + frame.data.byteLength)
  bytes[0] = frame.tag
  bytes.writeUInt32BE(frame.data.byteLength, 1)
  bytes.set(frame.data, 5)
  return bytes
}

/**
 * Write one complete frame with stream backpressure; simultaneous callers cannot interleave frame bytes.
 * @param output - Worker transport whose owner handles error events and final closure.
 * @param frame - One bounded payload.
 * @returns Completion of this stream write; failures reject without retrying the payload.
 */
export function writeNativeFrame(output: Writable, frame: NativeFrame): Promise<void> {
  return writeNativeBytes(output, encodeNativeFrame(frame))
}

/**
 * Write bytes without leaving a waiter behind when the transport closes without a write callback.
 * @param output - Stream whose owner handles error events and closure.
 * @param bytes - One payload; callers await this promise before producing the next chunk.
 * @returns Write completion; close, callback failure, or synchronous failure rejects without replay.
 */
export function writeNativeBytes(output: Writable, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const closed = (): void => { finish(new NativeProtocolError('Native transport closed before write completion.')) }
    const finish = (error?: Error | null): void => {
      output.off('close', closed)
      if (error) reject(error); else resolve()
    }
    if (output.destroyed) { closed(); return }
    output.once('close', closed)
    try { output.write(bytes, finish) }
    catch (error) { output.off('close', closed); reject(new Error('Native transport write failed.', { cause: error })) }
  })
}

/**
 * Decode chunked worker output without accumulating an unbounded or repeatedly concatenated buffer.
 * @param input - Byte transport; callers own cancellation, deadlines, and transport closure.
 * @returns Complete frames; malformed headers, oversized payloads, and truncated EOF throw.
 */
export async function* readNativeFrames(input: AsyncIterable<Uint8Array>): AsyncGenerator<NativeFrame, undefined> {
  const header = Buffer.alloc(5)
  let headerUsed = 0, payloadUsed = 0
  let payload: Buffer | undefined
  for await (const chunk of input) {
    let offset = 0
    while (offset < chunk.byteLength) {
      if (payload === undefined) {
        const count = Math.min(5 - headerUsed, chunk.byteLength - offset)
        header.set(chunk.subarray(offset, offset + count), headerUsed)
        headerUsed += count; offset += count
        if (headerUsed < 5) continue
        if (!Object.values<number>(NATIVE_FRAME).includes(header.readUInt8(0))) throw new NativeProtocolError('Unknown native frame tag.')
        const length = header.readUInt32BE(1)
        if (length > NATIVE_FRAME_MAX_BYTES) throw new NativeProtocolError('Native frame exceeds its payload limit.')
        payload = Buffer.allocUnsafe(length)
      }
      const count = Math.min(payload.length - payloadUsed, chunk.byteLength - offset)
      payload.set(chunk.subarray(offset, offset + count), payloadUsed)
      payloadUsed += count; offset += count
      if (payloadUsed === payload.length) {
        const frame = { tag: header.readUInt8(0), data: payload }
        headerUsed = 0; payloadUsed = 0; payload = undefined
        yield frame
      }
    }
  }
  if (headerUsed !== 0 || payload !== undefined) throw new NativeProtocolError('Native transport ended within a frame.')
}
