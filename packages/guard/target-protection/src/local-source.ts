/** Bounded local policy-data acquisition. @module */
import { open } from 'node:fs/promises'
import { TargetProtectionError } from './errors.ts'

/**
 * Read one local source without allocating beyond its configured byte cap.
 * @param path - Source file or file URL.
 * @param maxBytes - Maximum accepted bytes, supplied by validated deployment configuration.
 * @param signal - Acquisition cancellation.
 * @returns Complete file bytes; the descriptor is closed on every outcome.
 */
export async function readLocalSource(path: string | URL, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted()
  const file = await open(path, 'r')
  const chunks: Buffer[] = []
  let length = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = Buffer.alloc(Math.min(65536, maxBytes - length + 1))
      const { bytesRead } = await file.read(chunk)
      if (bytesRead === 0) break
      length += bytesRead
      if (length > maxBytes) throw new TargetProtectionError('unavailable', 'Local policy source exceeds the configured size limit.')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    return Buffer.concat(chunks, length)
  } finally { await file.close() }
}
