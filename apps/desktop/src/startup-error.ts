/** Serializable Desktop failure diagnostics. */

/** Installed Desktop resources must be repaired before Host startup can continue. */
export class DesktopApplicationFilesError extends Error {
  /** @param cause - Failure reading or validating a built-in application resource. */
  constructor(cause: unknown) {
    super(`desktop runtime: application files could not be loaded\n${desktopErrorState(cause).message}`, { cause })
    this.name = 'DesktopApplicationFilesError'
  }
}

/**
 * Preserve nested diagnostics when sending failures to a renderer.
 * @param error - Startup or runtime failure.
 * @returns Serializable error state.
 */
export function desktopErrorState(error: unknown): { phase: 'error'; message: string } {
  const message = error instanceof AggregateError
    ? [error.message, ...error.errors.map(item => desktopErrorState(item).message)].join('\n')
    : error instanceof Error ? error.message : String(error)
  return { phase: 'error', message }
}
