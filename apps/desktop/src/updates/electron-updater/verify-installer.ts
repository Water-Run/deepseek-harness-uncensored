/** Recheck the pending Windows installer before passing control to NSIS. */
import { createHash } from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import type { AppUpdater } from 'electron-updater'
import { DesktopUpdatePreparationError } from '../../update-error.ts'

/**
 * Verify the standalone installer's publisher and SHA-512 again before handoff, including cached downloads.
 * A failed verification retires the in-memory target so retry revalidates the disk cache.
 * @param updater - Settled NSIS updater with automatic installation disabled.
 * @returns When the installer is readable and matches the checked feed digest.
 */
export async function verifyWindowsUpdateInstaller(updater: AppUpdater): Promise<void> {
  // Electron-updater's NSIS signature method uses the publisher from the installed configuration.
  const internal = updater as object as {
    downloadedUpdateHelper: AppUpdater['downloadedUpdateHelper']
    verifySignature(file: string): Promise<string | null>
  }
  const pending = internal.downloadedUpdateHelper
  const file = pending?.file
  const expectedHash = pending?.downloadedFileInfo?.sha512
  try {
    if (file == null || pending?.packageFile !== null || expectedHash === undefined) {
      throw new Error('desktop update: missing standalone installer metadata')
    }
    const handle = await open(file, 'r')
    try {
      const before = await handle.stat({ bigint: true })
      if (!before.isFile()) throw new Error('desktop update: pending installer is not a regular file')
      const signatureFailure = await internal.verifySignature(file)
      if (signatureFailure !== null) throw new Error(signatureFailure)
      const hash = createHash('sha512')
      for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk)
      if (hash.digest('base64') !== expectedHash) throw new Error('desktop update: pending installer SHA-512 mismatch')
      const after = await stat(file, { bigint: true })
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
        throw new Error('desktop update: pending installer changed during verification')
      }
    } finally {
      await handle.close()
    }
  } catch (error) {
    internal.downloadedUpdateHelper = null
    throw new DesktopUpdatePreparationError('installer-integrity', 'desktop update: downloaded installer verification failed',
      error instanceof Error ? error.message : undefined)
  }
}
