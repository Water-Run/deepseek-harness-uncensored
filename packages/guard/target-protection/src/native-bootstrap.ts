/** Identity handshake preceding every workload or source-loader instruction. @module */
import type { Readable } from 'node:stream'
import type { WindowsProcessIdentity } from '@deepseek-ai/dsh-win32-process'
import { z } from 'zod'
import { NativeProtocolError } from './native-protocol.ts'

/**
 * Consume one bounded startup line, leaving the paused stream for the framed protocol.
 * @param stream - Exclusively owned stdout of the trusted bootstrap.
 * @param nonce - Per-launch random token supplied only by the launching owner.
 * @param pid - Root process id reported by the native launcher.
 * @param signal - Owner's startup deadline and cancellation.
 * @returns Identity to verify against an opened Windows process handle before sending the admission byte.
 */
export async function readNativeBootstrapIdentity(
  stream: Readable, nonce: string, pid: number, signal: AbortSignal,
): Promise<WindowsProcessIdentity> {
  signal.throwIfAborted()
  const schema = z.object({ nonce: z.literal(nonce), pid: z.literal(pid), creationTime: z.string().regex(/^[0-9]{1,20}$/) }).strict()
  return new Promise((resolve, reject) => {
    const buffer = Buffer.alloc(4096)
    let used = 0
    const cleanup = (): void => {
      stream.pause()
      stream.off('data', data); stream.off('end', ended); stream.off('close', ended); stream.off('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const failed = (error: Error): void => { cleanup(); reject(error) }
    const ended = (): void => { failed(new NativeProtocolError('Native bootstrap ended before identification.')) }
    const aborted = (): void => { failed(new Error('Native bootstrap was cancelled.', { cause: signal.reason })) }
    const data = (chunk: Buffer): void => {
      if (used + chunk.byteLength > buffer.length) { failed(new NativeProtocolError('Native bootstrap identity is too large.')); return }
      buffer.set(chunk, used); used += chunk.byteLength
      const newline = buffer.subarray(0, used).indexOf(10)
      if (newline < 0) return
      cleanup()
      try {
        if (newline !== used - 1) throw new NativeProtocolError('Unexpected data before native admission.')
        const parsed = schema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, newline))))
        if (!parsed.success) throw new NativeProtocolError('Native bootstrap identity does not match its launcher.')
        const creationTime = BigInt(parsed.data.creationTime)
        if (pid <= 0 || creationTime <= 0n || creationTime > 0xffff_ffff_ffff_ffffn) throw new NativeProtocolError('Invalid native process identity.')
        resolve({ pid, creationTime })
      } catch (error) { reject(new Error('Invalid bootstrap identity.', { cause: error })) }
    }
    stream.on('data', data); stream.once('end', ended); stream.once('close', ended); stream.once('error', failed)
    signal.addEventListener('abort', aborted, { once: true })
    if (stream.destroyed || stream.readableEnded) ended()
  })
}
