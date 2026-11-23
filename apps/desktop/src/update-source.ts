/** Validate the installed fork's update source before constructing an Electron update provider. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { load } from 'js-yaml'

/** Supported public update providers for this repository. */
export type ForkUpdateSource =
  | { provider: 'github'; owner: 'Water-Run'; repo: 'deepseek-harness-uncensored' }
  | { provider: 'generic'; url: string; useMultipleRangeRequest: false }

// The Windows packager escapes literal separators and spaces in the certificate attributes.
const PUBLISHER_ATTRIBUTE = String.raw`(?:[^\s\p{Cc}\\",;+]|\\[\da-fA-F]{2})+`
const WINDOWS_PUBLISHER = new RegExp(`^CN=${PUBLISHER_ATTRIBUTE},O=${PUBLISHER_ATTRIBUTE},C=[A-Za-z]{2}$`, 'u')

/**
 * Read the installed update configuration and require the packaged Windows publisher identity.
 * @param resourcesDirectory - Directory containing app-update.yml.
 * @param platform - Platform of the installed package.
 * @returns Untrusted configuration; missing or malformed files reject.
 */
export async function readInstalledUpdateSource(resourcesDirectory = process.resourcesPath, platform = process.platform): Promise<unknown> {
  const configuration = load(await readFile(join(resourcesDirectory, 'app-update.yml'), 'utf8'))
  if (platform === 'win32') {
    const publisher = typeof configuration === 'object' && configuration !== null && 'publisherName' in configuration
      ? configuration.publisherName : undefined
    const name: unknown = Array.isArray(publisher) && publisher.length === 1 ? publisher[0] : publisher
    // A signed build declares its publisher and must declare it correctly. An unsigned build declares
    // none: electron-updater then skips installer signature checks and the feed's SHA-512 is the only
    // binding, which is why the feed may only come from this fork's HTTPS release assets.
    if (name !== undefined && (typeof name !== 'string' || !WINDOWS_PUBLISHER.test(name))) {
      throw new Error('desktop update: installed Windows publisher must specify one CN, O, and C')
    }
  }
  return configuration
}

/**
 * Permit only this fork's public GitHub releases, preserving the installed generic feed path.
 * @param value - Parsed app-update.yml or a test-supplied configuration.
 * @returns Validated options safe to pass to setFeedURL before checking.
 */
export function forkUpdateSource(value: unknown): ForkUpdateSource {
  if (typeof value !== 'object' || value === null || !('provider' in value)) throw new Error('desktop update: invalid update source')
  if (value.provider === 'github' && 'owner' in value && value.owner === 'Water-Run'
    && 'repo' in value && value.repo === 'deepseek-harness-uncensored'
    && (!('host' in value) || value.host === 'github.com')
    && (!('protocol' in value) || value.protocol === 'https')
    && (!('private' in value) || value.private !== true)) {
    return { provider: 'github', owner: 'Water-Run', repo: 'deepseek-harness-uncensored' }
  }
  if (value.provider === 'generic' && 'url' in value && typeof value.url === 'string') {
    const url = new URL(value.url)
    if (url.protocol === 'https:' && url.hostname === 'github.com' && url.port === ''
      && url.username === '' && url.password === '' && url.search === '' && url.hash === ''
      && /^\/Water-Run\/deepseek-harness-uncensored\/releases\/(?:latest\/download|download\/[^/]+)\/?$/u.test(url.pathname)) {
      // GitHub's release asset CDN accepts single ranges and rejects multipart requests.
      return { provider: 'generic', url: url.href, useMultipleRangeRequest: false }
    }
  }
  throw new Error('desktop update: only this fork\'s public GitHub Releases can provide updates')
}
