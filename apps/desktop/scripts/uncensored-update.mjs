/** Public GitHub release feed shared by packaging and release records. */
import { resolveDesktopAutoUpdateTarget } from './desktop-auto-update-environment.mjs'

/**
 * Resolve the fork's update feed without upstream deployment credentials.
 * @param {NodeJS.Platform} platform - Packaged operating system.
 * @param {string} arch - Packaged architecture.
 * @returns {{ environment: 'github', channel: 'latest', target: string, publicUrl: string }} Release destination.
 */
export function uncensoredUpdateConfig(platform, arch) {
  return {
    environment: 'github', channel: 'latest', target: resolveDesktopAutoUpdateTarget(platform, arch),
    publicUrl: 'https://github.com/Water-Run/deepseek-harness-uncensored/releases/latest/download/',
  }
}
