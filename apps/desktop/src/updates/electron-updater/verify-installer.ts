/** Recheck the pending Windows installer before passing control to NSIS. */
import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import type { AppUpdater } from 'electron-updater'
import { DesktopUpdatePreparationError } from '../../update-error.ts'

/**
 * Verify the standalone installer against the SHA-512 bound to the updater's pending target.
 * A failed verification retires the in-memory target so retry revalidates the disk cache.
 * @param updater - Settled NSIS updater with automatic installation disabled.
 * @returns When the installer is readable and matches the checked feed digest.
 */
export async function verifyWindowsUpdateInstaller(updater: AppUpdater): Promise<void> {
  // Electron-updater exposes these properties at runtime but protects the helper in TypeScript.
  const internal = updater as object as { downloadedUpdateHelper: AppUpdater['downloadedUpdateHelper'] }
  const pending = internal.downloadedUpdateHelper
  const file = pending?.file
  const expectedHash = pending?.downloadedFileInfo?.sha512
  try {
    if (file == null || pending?.packageFile !== null || expectedHash === undefined) {
      throw new Error('desktop update: missing standalone installer metadata')
    }
    const handle = await open(file, 'r')
    try {
      if (!(await handle.stat()).isFile()) throw new Error('desktop update: pending installer is not a regular file')
      const hash = createHash('sha512')
      for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk)
      if (hash.digest('base64') !== expectedHash) throw new Error('desktop update: pending installer SHA-512 mismatch')
    } finally {
      await handle.close()
    }
  } catch (error) {
    internal.downloadedUpdateHelper = null
    throw new DesktopUpdatePreparationError('installer-integrity', 'desktop update: downloaded installer verification failed',
      error instanceof Error ? error.message : undefined)
  }
}
