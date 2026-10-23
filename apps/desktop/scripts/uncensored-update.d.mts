import type { DesktopAutoUpdateTarget } from './desktop-auto-update-environment.mjs'

/**
 * Resolve the fork's GitHub release feed without upstream credentials.
 * @param platform - Target operating system.
 * @param arch - Target architecture.
 * @returns The release destination shared by packaging and its release record.
 */
export function uncensoredUpdateConfig(platform: NodeJS.Platform, arch: string): {
  environment: 'github'
  channel: 'latest'
  target: DesktopAutoUpdateTarget
  publicUrl: string
}
