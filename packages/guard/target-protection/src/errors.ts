/** Typed registry and configuration failures. @module */
import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Audit failures distinguish requests not started from completed requests requiring remote-state verification. */
export type TargetAuditErrorCode = 'TARGET_AUDIT_UNAVAILABLE' | 'TARGET_AUDIT_UNCONFIRMED'

/** A remote file request cannot obtain its required audit acknowledgement; no rollback is implied. */
export class TargetAuditError extends HarnessError {
  /** @param code - Whether execution was stopped before dispatch or its final acknowledgement is unavailable.
   * @param message - Credential-free recovery instructions. @param options - Original storage, Session or cleanup failure. */
  constructor(code: TargetAuditErrorCode, message: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'TargetAuditError'
  }
}

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
