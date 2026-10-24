/**
 * Typed failures of the memory domain. A durable-format problem keeps the
 * domain closed instead of rebuilding or clearing user data, so every storage
 * failure reaches the caller as `storage-unavailable` with its cause intact.
 * @module @deepseek-ai/dsh-memory/src/error
 */

import type { MemoryId } from './types.ts'

/** Reasons a memory operation fails. */
export type MemoryErrorCode =
  | 'not-found'
  | 'conflict'
  | 'invalid'
  | 'storage-unavailable'

/** Structured memory failure; callers branch on {@link MemoryError.code}. */
export class MemoryError extends Error {
  override readonly name: string = 'MemoryError'

  /**
   * @param code - machine-readable reason.
   * @param message - actionable description for the operator.
   * @param options - standard error options carrying the root cause.
   */
  constructor(
    readonly code: MemoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

/** A version-checked write lost to a concurrent edit; the caller must re-read and retry. */
export class MemoryConflictError extends MemoryError {
  override readonly name: string = 'MemoryConflictError'

  /**
   * @param memoryId - the record the caller edited.
   * @param expectedVersion - the revision the caller read.
   * @param currentVersion - the stored revision that won.
   */
  constructor(
    readonly memoryId: MemoryId,
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      'conflict',
      `memory '${memoryId}' changed since it was read (expected version ${String(expectedVersion)}, `
      + `stored version ${String(currentVersion)})`,
    )
  }
}
