/** Recheck the pending Windows installer before passing control to NSIS. */
import { createHash } from 'node:crypto'
import { open, realpath, rm, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import { DesktopUpdatePreparationError } from '../../update-error.ts'

/**
 * Verify the standalone installer's publisher and SHA-512 again before handoff, including cached downloads.
 * A failed verification retires the in-memory target and the owned pending cache index.
 * @param updater - Settled NSIS updater with automatic installation disabled.
 * @returns The absolute installer path after publisher, identity and digest checks.
 */
export async function verifyWindowsUpdateInstaller(updater: AppUpdater): Promise<string> {
  // Electron-updater's NSIS signature method uses the publisher from the installed configuration.
  const internal = updater as object as {
    downloadedUpdateHelper: AppUpdater['downloadedUpdateHelper']
    verifySignature(file: string): Promise<string | null>
  }
  const pending = internal.downloadedUpdateHelper
  const file = pending?.file
  const expectedHash = pending?.downloadedFileInfo?.sha512
  try {
    if (file == null || !isAbsolute(file) || pending?.packageFile !== null || expectedHash === undefined) {
      throw new Error('desktop update: missing standalone installer metadata')
    }
    if (pending.downloadedFileInfo?.isAdminRightsRequired === true) {
      throw new Error('desktop update: the release requires an elevated installer')
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
    return file
  } catch (error) {
    internal.downloadedUpdateHelper = null
    let details = error instanceof Error ? error.message : undefined
    if (pending != null) {
      try {
        const directory = pending.cacheDirForPendingUpdate
        const canonical = await realpath(directory)
        if (canonical.toLowerCase() !== resolve(directory).toLowerCase()) {
          throw new Error('desktop update: pending cache directory is redirected')
        }
        // Leave the payload in place. Without the index, the updater downloads to a temporary file and replaces it.
        await rm(join(canonical, 'update-info.json'), { force: true })
      } catch (cleanupError) {
        if (!(cleanupError instanceof Error && 'code' in cleanupError && cleanupError.code === 'ENOENT')) {
          const reason = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          details = [details, `desktop update: could not retire the pending cache index: ${reason}`].filter(Boolean).join('\n')
        }
      }
    }
    throw new DesktopUpdatePreparationError('installer-integrity', 'desktop update: downloaded installer verification failed',
      details)
  }
}
