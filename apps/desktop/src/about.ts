/** Display metadata sealed into the installed application's manifest. */
import { displayProductVersion } from '@deepseek-ai/dsh-product-version'
import type { DesktopMessages } from './locale.ts'
import { formatDesktopMessage } from './locale.ts'

/**
 * Format distribution and source identity without guessing missing metadata.
 * @param manifest - Parsed installed package metadata.
 * @param version - Installed Desktop shell version.
 * @param messages - Active Desktop dictionary.
 * @returns Localized about-dialog details.
 */
export function desktopAboutDetails(manifest: unknown, version: string, messages: DesktopMessages): string {
  const record = typeof manifest === 'object' && manifest !== null ? manifest as Record<string, unknown> : {}
  const fork = typeof record.dshUncensored === 'object' && record.dshUncensored !== null
    ? record.dshUncensored as Record<string, unknown> : {}
  const purge = typeof fork.purge === 'object' && fork.purge !== null ? fork.purge as Record<string, unknown> : {}
  const rea = typeof fork.rea === 'object' && fork.rea !== null ? fork.rea as Record<string, unknown> : {}
  const text = (value: unknown) => typeof value === 'string' && value !== '' ? value : messages.aboutUnknown
  return formatDesktopMessage(messages.aboutDetails, {
    fork: displayProductVersion(text(record.dshDisplayVersion ?? fork.version ?? process.env.DSH_CLIENT_FORK_VERSION ?? version)),
    upstream: text(fork.upstreamVersion ?? process.env.DSH_CLIENT_UPSTREAM_VERSION),
    upstreamCommit: text(fork.upstreamCommit ?? process.env.DSH_CLIENT_UPSTREAM_COMMIT),
    commit: text(record.dshBuildCommit ?? process.env.DSH_CLIENT_SOURCE_COMMIT ?? process.env.DSH_CLIENT_COMMIT_HASH),
    date: text(record.dshBuildDate ?? process.env.DSH_CLIENT_COMMIT_DATE),
    purge: text(purge.commit ?? process.env.DSH_CLIENT_PURGE_COMMIT),
    purgeDate: text(purge.commitTime ?? process.env.DSH_CLIENT_PURGE_DATE),
    purgeVersion: text(purge.version ?? process.env.DSH_CLIENT_PURGE_VERSION),
    purgeRepository: text(purge.repository ?? process.env.DSH_CLIENT_PURGE_REPO),
    buildTime: text(record.dshBuildTime ?? process.env.DSH_CLIENT_BUILD_TIME),
    rea: text(rea.version ?? process.env.DSH_CLIENT_REA_VERSION),
    reaCommit: text(rea.commit ?? process.env.DSH_CLIENT_REA_COMMIT),
    reaDate: text(rea.commitTime ?? process.env.DSH_CLIENT_REA_DATE),
    reaRepository: text(rea.repository ?? process.env.DSH_CLIENT_REA_REPOSITORY),
  })
}
