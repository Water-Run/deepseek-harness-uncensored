/** Display metadata sealed into the installed application's manifest. */
import type { DesktopMessages } from './locale.ts'
import { formatDesktopMessage } from './locale.ts'

/**
 * Format distribution and source identity without guessing missing metadata.
 * @param manifest - Parsed installed package metadata.
 * @param version - Installed DSH runtime version.
 * @param messages - Active Desktop dictionary.
 * @returns Localized about-dialog details.
 */
export function desktopAboutDetails(manifest: unknown, version: string, messages: DesktopMessages): string {
  const record = typeof manifest === 'object' && manifest !== null ? manifest as Record<string, unknown> : {}
  const fork = typeof record.dshUncensored === 'object' && record.dshUncensored !== null
    ? record.dshUncensored as Record<string, unknown> : {}
  const purge = typeof fork.purge === 'object' && fork.purge !== null ? fork.purge as Record<string, unknown> : {}
  const text = (value: unknown) => typeof value === 'string' && value !== '' ? value : messages.aboutUnknown
  return formatDesktopMessage(messages.aboutDetails, {
    fork: text(fork.version ?? process.env.DSH_CLIENT_FORK_VERSION ?? version),
    upstream: text(fork.upstreamVersion ?? process.env.DSH_CLIENT_UPSTREAM_VERSION),
    commit: text(record.dshBuildCommit ?? process.env.DSH_CLIENT_COMMIT_HASH),
    date: text(record.dshBuildDate ?? process.env.DSH_CLIENT_COMMIT_DATE),
    purge: text(purge.commit ?? process.env.DSH_CLIENT_PURGE_COMMIT),
    purgeDate: text(purge.commitTime ?? process.env.DSH_CLIENT_PURGE_DATE),
    buildTime: text(process.env.DSH_CLIENT_BUILD_TIME),
  })
}
