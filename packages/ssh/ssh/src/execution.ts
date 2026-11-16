/** Connection selection before allocating execution-owned SSH resources. @module */
import type { SshService } from './index.ts'

/**
 * Resolve an execution-specific connection before allocating remote resources.
 * Selection failures propagate without fallback. Keep the returned service through resource cleanup.
 * @param service - Fixed connection or provider with an execution selector.
 * @returns The selected connection, or the fixed service when no selector is installed.
 */
export function resolveSshExecution(service: SshService): SshService {
  return service.captureExecution === undefined ? service : service.captureExecution()
}
