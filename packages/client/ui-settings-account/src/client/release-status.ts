/** GitHub Releases status for this fork. Official DeepSeek and COS hosts are not update sources. */
import { compare, parse, type SemVer } from 'semver'

/** Observable update state. A failed or offline check is never reported as current. */
export type ReleasePhase = 'checking' | 'latest' | 'available' | 'unpublished' | 'failed' | 'offline'

/** How strongly a newer release should be announced. */
export type ReleaseSeverity = 'patch' | 'minor' | 'major'

/** One published GitHub release after the response has been read. */
export interface ReleaseRecord {
  readonly version: string
  readonly prerelease: boolean
  readonly url: string
}

/** What the About page and startup reminder may show. */
export interface ReleaseNotice {
  readonly phase: ReleasePhase
  readonly severity?: ReleaseSeverity
  readonly version?: string
  readonly url?: string
  readonly message?: string
}

const FORK_RELEASE_HOST = 'api.github.com'
const FORK_RELEASE_PATH = '/repos/Water-Run/deepseek-harness-uncensored/releases'

/** Releases API for this repository. No other host is an update source. */
export const FORK_RELEASES_URL = `https://${FORK_RELEASE_HOST}${FORK_RELEASE_PATH}?per_page=100`

/**
 * Reject official and object-storage hosts before any update request is sent.
 * @param url - Candidate update or release URL.
 */
export function assertForkReleaseUrl(url: string): void {
  const parsed = new URL(url)
  const host = parsed.host.toLowerCase()
  if (host === 'download.deepseek.com' || host === 'myqcloud.com' || host.endsWith('.myqcloud.com')) {
    throw new Error('this fork does not use the official DeepSeek or COS update host')
  }
  if (parsed.origin !== `https://${FORK_RELEASE_HOST}` || parsed.username !== '' || parsed.password !== ''
    || parsed.hash !== '' || parsed.pathname !== FORK_RELEASE_PATH) {
    throw new Error('update discovery only reads this repository on GitHub')
  }
}

function versionParts(value: string): SemVer | undefined {
  return parse(value.trim().replace(/^(?:desktop|dshu)-/u, '')) ?? undefined
}

function compareRelease(left: SemVer, right: SemVer): number { return compare(left, right) }

function severity(current: SemVer, next: SemVer): ReleaseSeverity {
  if (next.major !== current.major) return 'major'
  if (next.minor !== current.minor) return 'minor'
  return 'patch'
}

/**
 * Compare published releases with the running version.
 * A prerelease is ignored unless the running build is itself a prerelease.
 * No successful comparison can describe a transport failure as up to date.
 * @param current - Running product version.
 * @param releases - Releases returned by GitHub.
 * @returns The notice to display.
 */
export function classifyReleases(current: string, releases: readonly ReleaseRecord[]): ReleaseNotice {
  const currentParts = versionParts(current)
  if (currentParts === undefined) return { phase: 'failed', message: 'unrecorded-version' }
  let best: { readonly parts: SemVer; readonly release: ReleaseRecord } | undefined
  for (const release of releases) {
    const parts = versionParts(release.version)
    if (parts === undefined) continue
    if ((parts.prerelease.length > 0 || release.prerelease) && currentParts.prerelease.length === 0) continue
    if (best === undefined || compareRelease(parts, best.parts) > 0) best = { parts, release }
  }
  if (best === undefined) return { phase: 'unpublished', message: 'no-release' }
  if (compareRelease(best.parts, currentParts) <= 0) return { phase: 'latest', version: current }
  return {
    phase: 'available',
    severity: severity(currentParts, best.parts),
    version: best.release.version,
    url: best.release.url,
  }
}

/**
 * Read this repository's releases. Network loss is offline. Any other failure stays failed.
 * @param fetchImpl - HTTP implementation, replaceable in tests.
 * @param current - Running product version.
 * @param options - Caller cancellation and deployment request deadline.
 * @returns A notice that never calls a failed check current.
 */
export async function loadForkRelease(
  fetchImpl: typeof fetch, current: string, options: { signal?: AbortSignal; timeoutMs: number },
): Promise<ReleaseNotice> {
  if (versionParts(current) === undefined) return { phase: 'failed', message: 'unrecorded-version' }
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new DOMException('Release check timed out.', 'TimeoutError')) }, options.timeoutMs)
  const signal = options.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, options.signal])
  try {
    signal.throwIfAborted()
    const releases: ReleaseRecord[] = []
    let page: string | undefined = FORK_RELEASES_URL
    const visited = new Set<string>()
    while (page !== undefined) {
      assertForkReleaseUrl(page)
      if (visited.has(page)) return { phase: 'failed', message: 'repeated-release-page' }
      visited.add(page)
      const response: Response = await fetchImpl(page, { headers: { accept: 'application/vnd.github+json' }, signal, redirect: 'error' })
      if (!response.ok) return { phase: 'failed', message: `http-${response.status}` }
      const body: unknown = await response.json()
      signal.throwIfAborted()
      if (!Array.isArray(body)) return { phase: 'failed', message: 'invalid-body' }
      for (const entry of body) {
        if (typeof entry !== 'object' || entry === null) return { phase: 'failed', message: 'invalid-body' }
        const record = entry as { tag_name?: unknown; prerelease?: unknown; html_url?: unknown; draft?: unknown }
        if (record.draft === true) continue
        if (typeof record.tag_name !== 'string' || typeof record.html_url !== 'string' || typeof record.prerelease !== 'boolean') return { phase: 'failed', message: 'invalid-body' }
        const url = new URL(record.html_url)
        if (url.origin !== 'https://github.com' || url.username !== '' || url.password !== ''
        || !url.pathname.startsWith('/Water-Run/deepseek-harness-uncensored/releases/tag/')) return { phase: 'failed', message: 'invalid-release-link' }
        releases.push({ version: record.tag_name, prerelease: record.prerelease, url: record.html_url })
      }
      const link = response.headers.get('link') ?? ''
      page = /<([^>]+)>;\s*rel="next"/u.exec(link)?.[1]
      if (page === undefined && /rel="next"/u.test(link)) return { phase: 'failed', message: 'invalid-release-page' }
    }
    return classifyReleases(current, releases)
  } catch (error) {
    if (signal.aborted) return { phase: 'failed', message: controller.signal.aborted ? 'timeout' : 'cancelled' }
    return { phase: error instanceof TypeError ? 'offline' : 'failed', message: 'release-check-failed' }
  } finally { clearTimeout(timer) }
}
