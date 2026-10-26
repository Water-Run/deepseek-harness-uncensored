/** System hostname lookup with bounded caller lifetime; late OS results are discarded. @module */
import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'

/**
 * Resolve an exact rule hostname through the host's normal resolver, including hosts-file aliases.
 * @param host - Canonical hostname without credentials or port.
 * @param signal - Cancels the wait; an already started OS lookup may finish unused.
 * @returns All addresses supplied by the resolver.
 */
export function resolveRuleHost(host: string, signal: AbortSignal): Promise<LookupAddress[]> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      const reason: unknown = signal.reason
      reject(reason instanceof Error ? reason : new Error('Target address lookup cancelled.', { cause: reason }))
    }
    signal.addEventListener('abort', abort, { once: true })
    void lookup(host, { all: true, order: 'verbatim' }).then(resolve, reject)
      .finally(() => { signal.removeEventListener('abort', abort) })
  })
}
