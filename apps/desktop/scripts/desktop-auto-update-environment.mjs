/** Update channels, supported targets and local record names shared by Desktop. */
import { valid } from 'semver'

/** Environment variable selecting optional policy-service deployment settings. */
export const DESKTOP_AUTO_UPDATE_ENV = 'DSH_DESKTOP_AUTO_UPDATE_ENV'
const UPDATE_TARGETS = new Set(['mac-arm64', 'mac-x64', 'win-x64', 'linux-x64'])

/**
 * Resolve the channel embedded in the installer; omitted local settings retain nightly.
 * @param {NodeJS.ProcessEnv} env Packaging settings.
 * @returns {'nightly' | 'latest'} Validated channel.
 */
export function resolveDesktopUpdateChannel(env) {
  const channel = env.DSH_DESKTOP_UPDATE_CHANNEL || 'nightly'
  if (channel !== 'nightly' && channel !== 'latest') throw new Error('desktop auto-update: invalid update channel')
  return channel
}

/**
 * Select optional policy-service settings without assigning an upload destination.
 * @param {NodeJS.ProcessEnv} env Packaging environment.
 * @returns {'test' | 'production'} Validated deployment name.
 */
export function resolveDesktopAutoUpdateEnvironment(env) {
  const value = env[DESKTOP_AUTO_UPDATE_ENV]?.trim() || 'test'
  if (value !== 'test' && value !== 'production') {
    throw new Error(`desktop auto-update: ${DESKTOP_AUTO_UPDATE_ENV} must be "test" or "production"`)
  }
  return value
}

/**
 * Resolve a supported platform and architecture to its release target.
 * @param {NodeJS.Platform} platform Target Node.js platform.
 * @param {string} arch Target Node.js architecture.
 * @returns {'mac-arm64' | 'mac-x64' | 'win-x64' | 'linux-x64'} Release target.
 */
export function resolveDesktopAutoUpdateTarget(platform, arch) {
  const os = platform === 'darwin' ? 'mac' : platform === 'win32' || platform === 'win' ? 'win' : platform
  const target = `${os}-${arch}`
  if (!UPDATE_TARGETS.has(target)) throw new Error(`desktop auto-update: unsupported target ${target}`)
  return target
}

/**
 * Return the local completion record filename for a packaged target.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64' | 'linux-x64'} target Supported release target.
 * @returns {string} Filename stored beside electron-builder artifacts.
 */
export function desktopBuildRecordFilename(target) {
  if (!UPDATE_TARGETS.has(target)) throw new Error(`desktop auto-update: unsupported target ${target}`)
  return `${target}-release.json`
}

/**
 * Return the electron-builder channel metadata filename for a version.
 * @param {string} version Desktop semantic version.
 * @param {NodeJS.Platform} platform Target platform.
 * @param {'nightly' | 'latest'} channel Selected channel, defaulting to nightly.
 * @returns {string} Channel metadata filename.
 */
export function desktopUpdateMetadataFilename(version, platform, channel = 'nightly') {
  if (valid(version) === null) throw new Error(`desktop auto-update: invalid Desktop version ${JSON.stringify(version)}`)
  if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') throw new Error(`desktop auto-update: unsupported metadata platform ${platform}`)
  resolveDesktopUpdateChannel({ DSH_DESKTOP_UPDATE_CHANNEL: channel })
  return `${channel}${platform === 'darwin' ? '-mac' : platform === 'linux' ? '-linux' : ''}.yml`
}
