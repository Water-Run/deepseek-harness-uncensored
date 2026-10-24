/** Validate the installed fork's update source before constructing an Electron update provider. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { load } from 'js-yaml'

/** Supported public update providers for this repository. */
export type ForkUpdateSource =
  | { provider: 'github'; owner: 'Water-Run'; repo: 'deepseek-harness-uncensored' }
  | { provider: 'generic'; url: string }

/**
 * Read the installed update provider configuration for validation.
 * @returns Untrusted configuration; missing or malformed files reject.
 */
export async function readInstalledUpdateSource(): Promise<unknown> {
  return load(await readFile(join(process.resourcesPath, 'app-update.yml'), 'utf8'))
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
      return { provider: 'generic', url: url.href }
    }
  }
  throw new Error('desktop update: only this fork\'s public GitHub Releases can provide updates')
}
