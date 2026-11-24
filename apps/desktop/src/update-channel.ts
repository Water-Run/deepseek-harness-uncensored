/** Resolve the update channel sealed into the installed application manifest. */
import type { DesktopUpdatePreferences } from './settings-file.ts'

/** Installer-owned channel, independent of release version and upload environment. */
export type DesktopUpdateChannel = DesktopUpdatePreferences['channel']

/**
 * Read the packaged update feed. DSHU manifests without a feed use the public release index.
 * @param manifest Parsed application manifest.
 * @returns The public channel, including for manifests carrying the former nightly setting.
 */
export function desktopUpdateChannel(manifest: unknown): DesktopUpdateChannel {
  if (typeof manifest !== 'object' || manifest === null) throw new Error('desktop update: invalid application manifest')
  if (!('dshDesktopUpdateChannel' in manifest)) return 'latest'
  const channel = manifest.dshDesktopUpdateChannel
  if (channel !== 'nightly' && channel !== 'latest') throw new Error('desktop update: invalid packaged channel')
  return 'latest'
}
