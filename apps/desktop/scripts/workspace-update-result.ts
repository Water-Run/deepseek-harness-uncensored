/** Completion evidence required before the workspace updater runner reports success. */
import { z } from 'zod'

const cases = [
  'real-workspace-preload-and-host',
  'native-menu-checking-and-current-without-download',
  'download-integrity-error-and-persistent-retry',
  'sidebar-retry-direct-download-and-separate-install-dialog',
  'new-task-during-idle-confirmation-refuses-install-and-preserves-work',
  'task-warning-deferral-preserves-work-and-ready-package',
  'mandatory-main-entry-block-retains-real-work-through-failure-and-clearance',
  'actual-host-teardown-timeout-refuses-installer',
  'non-graceful-stop-restores-host-and-requires-fresh-install-confirmation',
  'mandatory-stop-recovery-preserves-block-and-requires-fresh-install-confirmation',
] as const

const automated = z.object({
  realElectron: z.literal(true), realHostProcess: z.literal(true), realPreload: z.literal(true),
  compiledMainEntry: z.literal(true), installerExecuted: z.literal(false),
  cases: z.array(z.string()).refine(value => value.length === cases.length
    && new Set(value).size === cases.length && cases.every(name => value.includes(name)),
  'Workspace updater qualification did not complete every acceptance case.'),
})
const manual = z.object({
  installerExecuted: z.literal(false), interceptedInstallations: z.number().int().nonnegative(),
  phases: z.array(z.string()),
})

/**
 * Reject incomplete, malformed or incorrectly scoped qualification evidence.
 * @param value - JSON read from the selected result file after Electron exits.
 * @param interactive - Whether the operator selected the manual exercise.
 */
export function validateWorkspaceUpdateResult(value: unknown, interactive: boolean): void {
  if (interactive) manual.parse(value)
  else automated.parse(value)
}
