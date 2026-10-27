/** Typed registry and configuration failures. @module */

/** Error categories with distinct handling; none authorize fallback execution. */
export type TargetProtectionErrorCode = 'invalid' | 'conflict' | 'busy' | 'unsupported-version' | 'unrecognized-store' | 'unavailable'

/** Failed configuration or durable access, preserving an underlying diagnostic cause. */
export class TargetProtectionError extends Error {
  /**
   * @param code - Stable handling category.
   * @param message - Credential-free diagnostic.
   * @param options - Underlying failure when available.
   */
  constructor(readonly code: TargetProtectionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TargetProtectionError'
  }
}
