/** GitHub Releases status for this fork. Official DeepSeek and COS hosts are not update sources. */

/** Observable update state. A failed or offline check is never reported as current. */
export type ReleasePhase = 'checking' | 'latest' | 'available' | 'failed' | 'offline'

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
export const FORK_RELEASES_URL = `https://${FORK_RELEASE_HOST}${FORK_RELEASE_PATH}?per_page=20`

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
  if (host !== FORK_RELEASE_HOST || !parsed.pathname.startsWith(FORK_RELEASE_PATH)) {
    throw new Error('update discovery only reads this repository on GitHub')
  }
}

interface VersionParts {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: string | undefined
}

function versionParts(value: string): VersionParts | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(value.trim())
  if (match === null) return undefined
  return {
    major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]),
    prerelease: match[4],
  }
}

function compareIdentifier(left: string, right: string): number {
  const leftNumber = /^\d+$/u.test(left) ? Number(left) : undefined
  const rightNumber = /^\d+$/u.test(right) ? Number(right) : undefined
  if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber
  if (leftNumber !== undefined) return -1
  if (rightNumber !== undefined) return 1
  return left < right ? -1 : left > right ? 1 : 0
}

function compareRelease(left: VersionParts, right: VersionParts): number {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  if (left.patch !== right.patch) return left.patch - right.patch
  if (left.prerelease === right.prerelease) return 0
  if (left.prerelease === undefined) return 1
  if (right.prerelease === undefined) return -1
  const leftParts = left.prerelease.split('.')
  const rightParts = right.prerelease.split('.')
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === rightPart) continue
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    const compared = compareIdentifier(leftPart, rightPart)
    if (compared !== 0) return compared
  }
  return 0
}

function severity(current: VersionParts, next: VersionParts): ReleaseSeverity {
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
  let best: { readonly parts: VersionParts; readonly release: ReleaseRecord } | undefined
  for (const release of releases) {
    const parts = versionParts(release.version)
    if (parts === undefined) continue
    if ((parts.prerelease !== undefined || release.prerelease) && currentParts.prerelease === undefined) continue
    if (best === undefined || compareRelease(parts, best.parts) > 0) best = { parts, release }
  }
  if (best === undefined) return { phase: 'failed', message: 'no-release' }
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
 * @returns A notice that never calls a failed check current.
 */
export async function loadForkRelease(fetchImpl: typeof fetch, current: string): Promise<ReleaseNotice> {
  try {
    assertForkReleaseUrl(FORK_RELEASES_URL)
    const response = await fetchImpl(FORK_RELEASES_URL, {
      headers: { accept: 'application/vnd.github+json' },
    })
    if (!response.ok) return { phase: 'failed', message: `http-${response.status}` }
    const body: unknown = await response.json()
    if (!Array.isArray(body)) return { phase: 'failed', message: 'invalid-body' }
    const releases: ReleaseRecord[] = []
    for (const entry of body) {
      if (typeof entry !== 'object' || entry === null) continue
      const record = entry as { tag_name?: unknown; prerelease?: unknown; html_url?: unknown }
      if (typeof record.tag_name !== 'string' || typeof record.html_url !== 'string') continue
      releases.push({ version: record.tag_name, prerelease: record.prerelease === true, url: record.html_url })
    }
    return classifyReleases(current, releases)
  } catch (error) {
    const offline = error instanceof TypeError || (error instanceof Error && /network|fetch|offline/iu.test(error.message))
    return { phase: offline ? 'offline' : 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}
