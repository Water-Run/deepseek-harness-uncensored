/** Start the verified per-user Windows updater without waiting for installation to finish. */
import { spawn } from 'node:child_process'
import { once } from 'node:events'

/**
 * Start an approved standalone installer as a detached process.
 * @param file - Exact local installer path returned by verification.
 * @returns Completion after the OS has created the installer process.
 */
export async function launchWindowsUpdateInstaller(file: string): Promise<void> {
  const installer = spawn(file, ['--updated', '/S', '--force-run'], {
    detached: true, stdio: 'ignore', windowsHide: true,
  })
  await once(installer, 'spawn')
  installer.unref()
}
