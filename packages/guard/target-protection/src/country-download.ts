/** Owner-triggered acquisition from the fixed DB-IP Country Lite distribution. @module */
import { TargetProtectionError } from '@deepseek-ai/dsh-target-protection'
import { fetch } from 'undici'

function monthAt(time: number, offset: number): string {
  const date = new Date(time)
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 7)
}

/**
 * Download the current UTC month, falling back one month only if it has not been published.
 * Requests inherit the process-owned Host dispatcher without closing it.
 * @param now - Time at which the owner requested the check.
 * @param maxBytes - Hard cap on the streamed response body.
 * @param signal - Combined request, provider and download deadline.
 * @returns The complete candidate bytes and requested UTC month.
 */
export async function downloadCountry(now: number, maxBytes: number, signal: AbortSignal): Promise<{ bytes: Buffer; month: string }> {
  const request = { redirect: 'error' as const, signal }
  for (const offset of [0, -1]) {
    const month = monthAt(now, offset)
    const response = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`, request)
    if (!response.ok || response.body === null || Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel()
      if (offset === 0 && response.status === 404) continue
      throw new TargetProtectionError('unavailable', 'DB-IP country data could not be downloaded within the size limit.')
    }
    const reader = response.body.getReader()
    const chunks: Buffer[] = []
    let length = 0
    try {
      for (;;) {
        request.signal.throwIfAborted()
        const next = await reader.read()
        if (next.done) return { bytes: Buffer.concat(chunks, length), month }
        const bytes: unknown = next.value
        if (!(bytes instanceof Uint8Array)) throw new TargetProtectionError('unavailable', 'DB-IP country download did not return binary data.')
        length += bytes.byteLength
        if (length > maxBytes) throw new TargetProtectionError('unavailable', 'DB-IP country download exceeds the size limit.')
        chunks.push(Buffer.from(bytes))
      }
    } finally {
      try { await reader.cancel() }
      finally { reader.releaseLock() }
    }
  }
  throw new TargetProtectionError('unavailable', 'DB-IP has no available country release.')
}
