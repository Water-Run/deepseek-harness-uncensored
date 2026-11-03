/** Environment variable selecting optional policy-service deployment settings. */
export const DESKTOP_AUTO_UPDATE_ENV: 'DSH_DESKTOP_AUTO_UPDATE_ENV'
/** Supported policy-service deployment. */
export type DesktopAutoUpdateEnvironment = 'test' | 'production'
/** Supported Desktop release target. */
export type DesktopAutoUpdateTarget = 'mac-arm64' | 'mac-x64' | 'win-x64'

/**
 * Resolve optional policy-service deployment settings, defaulting to test.
 * @param env Packaging settings.
 * @returns Validated deployment name.
 */
export function resolveDesktopAutoUpdateEnvironment(env: NodeJS.ProcessEnv): DesktopAutoUpdateEnvironment
/**
 * Resolve a supported platform and architecture to its release target.
 * @param platform Target platform.
 * @param arch Target architecture.
 * @returns Release target.
 */
export function resolveDesktopAutoUpdateTarget(platform: NodeJS.Platform, arch: string): DesktopAutoUpdateTarget
/**
 * Return the local completion record filename.
 * @param target Supported release target.
 * @returns Filename beside build artifacts.
 */
export function desktopBuildRecordFilename(target: DesktopAutoUpdateTarget): string
/**
 * Return the channel metadata filename.
 * @param version Desktop semantic version.
 * @param platform Target platform.
 * @param channel Selected channel, defaulting to nightly.
 * @returns Metadata filename.
 */
export function desktopUpdateMetadataFilename(version: string, platform: NodeJS.Platform, channel?: 'nightly' | 'latest'): string
/**
 * Resolve the packaged channel, defaulting to nightly.
 * @param env Packaging settings.
 * @returns Validated channel.
 */
export function resolveDesktopUpdateChannel(env: NodeJS.ProcessEnv): 'nightly' | 'latest'
