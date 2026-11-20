/** Localized update preparation failures with separately displayed diagnostics. */
import { DESKTOP_UPDATE_ERROR_CODES, type DesktopUpdatePreparationFailureKind, type DesktopUpdateState } from './ipc.ts'

/**
 * Attach the whitelisted machine code for a failure whose message names one.
 *
 * Qualification evidence and the renderer both consume this state, so classification happens once
 * at the main boundary: only codes listed by `DESKTOP_UPDATE_ERROR_CODES` are ever emitted, and the
 * journal keeps refusing to parse free text of its own.
 * @param state - Main-process-owned update state.
 * @returns The same state, with `errorCode` filled in when its message names a listed code.
 */
export function withUpdateErrorCode(state: DesktopUpdateState): DesktopUpdateState {
  if (state.phase !== 'error' || state.errorCode !== undefined) return state
  const message = state.message ?? ''
  const errorCode = DESKTOP_UPDATE_ERROR_CODES.find(code => message.includes(code))
  return errorCode === undefined ? state : { ...state, errorCode }
}

/** Only explicitly safe main-process facts may be exposed as technical details. */
export class DesktopUpdatePreparationError extends Error {
  /**
   * @param kind - Stable preparation cause shared by native and Web presentations.
   * @param message - Locale-owned recovery guidance.
   * @param technicalDetails - Main-owned facts, excluding raw subprocess output and credentials.
   */
  constructor(readonly kind: DesktopUpdatePreparationFailureKind, message: string, readonly technicalDetails?: string) { super(message) }
}

/**
 * Preserve current download diagnostics; never infer a cause from an older cleanup failure.
 * @param error - Rejected updater download or filesystem error.
 * @returns Structured filesystem cause when supplied by the failing operation.
 */
export function downloadFailureDetails(error: unknown): Pick<DesktopUpdateState, 'downloadFailure' | 'technicalDetails'> {
  if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'string') return {}
  const code = error.code
  const kind = code === 'ENOSPC' ? 'space' : ['EACCES', 'EPERM', 'EROFS'].includes(code) ? 'permission' : code === 'EBUSY' ? 'busy' : undefined
  const path = 'path' in error && typeof error.path === 'string' ? error.path : undefined
  const destination = 'dest' in error && typeof error.dest === 'string' ? error.dest : undefined
  return {
    ...(kind === undefined ? {} : { downloadFailure: kind }),
    technicalDetails: [code, error.message, path, destination].filter(value => value !== undefined).join('\n'),
  }
}
