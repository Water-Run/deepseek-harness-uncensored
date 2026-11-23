/** Local DSHU build numbering; no release credentials or remote storage are consulted. */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'semver'
import { calendarBuildVersion, displayProductVersion, parseCalendarVersion, runtimeProductVersion } from '@deepseek-ai/dsh-product-version/bootstrap'
import { desktopBuildVersionPrefix, validateDesktopBuildVersion } from './desktop-build-version.mjs'

/** Artifact name electron-builder writes for one build, on either platform; unsigned and unnotarized builds add a suffix. */
const ARTIFACT =
  /^deepseek-harness-uncensored-(?<version>.+)-(?:mac|win|linux)-(?:arm64|x64)(?:-unsigned|-unnotarized)?\.(?:exe|dmg|zip|deb|tar\.gz)$/u

const DELIVERY_ARTIFACT =
  /^DSHU-(?<version>\d{4}\.\d{2}\.\d{2}\.(?:0|[1-9]\d*))-core-.+-(?:win|linux|mac)-(?:arm64|x64)-[a-f0-9]+\.(?:exe|dmg|zip|deb|tar\.gz)$/u

/** Inputs that decide which versions are already taken. */
export interface DesktopBuildVersionSuggestionOptions {
  readonly productVersion: string
  /** Date segment to number within; defaults to today in Asia/Shanghai. */
  readonly date?: string
  /** Directory electron-builder writes installers into for this build. */
  readonly artifactsRoot: string
  /** Retained deliveries for this day, outside disposable build caches. */
  readonly deliveredArtifactsRoot?: string
}

/**
 * Format a date as the convention's segment.
 * @param date - Date to format.
 * @returns The date as `YYYYMMDD` in Asia/Shanghai.
 */
export function desktopBuildDateSegment(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const field = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value
  return `${field('year')}${field('month')}${field('day')}`
}

/**
 * Read the sequence numbers already used for one product version and date.
 * @param versions - Versions found in local artifact directories.
 * @param prefix - Everything a numbered build carries before its index.
 * @returns Every index present, unordered.
 */
function sequenceNumbers(versions: Iterable<string>, prefix: string): number[] {
  const numbers: number[] = []
  for (const version of versions) {
    if (!version.startsWith(prefix)) continue
    const index = version.slice(prefix.length)
    if (/^\d+$/u.test(index)) numbers.push(Number(index))
  }
  return numbers
}

/**
 * Read the versions one output directory already holds.
 * @param artifactsRoot - Directory electron-builder wrote installers into.
 * @returns Versions parsed from artifact names.
 */
async function localVersions(artifactsRoot: string): Promise<string[]> {
  const entries: string[] = await readdir(artifactsRoot).catch(emptyMissingDirectory)
  const runs = await readdir(join(artifactsRoot, 'runs'), { withFileTypes: true }).catch(emptyMissingDirectory)
  for (const run of runs) {
    if (run.isDirectory()) entries.push(...await readdir(join(artifactsRoot, 'runs', run.name)))
  }
  entries.push(...await readdir(join(artifactsRoot, 'closeout')).catch(emptyMissingDirectory))
  return entries.map(entry => ARTIFACT.exec(entry)?.groups?.version ?? DELIVERY_ARTIFACT.exec(entry)?.groups?.version)
    .filter((version): version is string => version !== undefined)
    .map(runtimeProductVersion).filter(version => parse(version) !== null)
}

function emptyMissingDirectory(error: unknown): never[] {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
  throw error
}

/**
 * Suggest the next build version for today, numbering after what is already taken.
 * @param options - Independent product version and local artifact directory.
 * @returns A validated build version whose index is free.
 */
export async function suggestDesktopBuildVersion(options: DesktopBuildVersionSuggestionOptions): Promise<string> {
  const day = options.date ?? desktopBuildDateSegment()
  const prefix = parseCalendarVersion(options.productVersion) === undefined
    ? `${desktopBuildVersionPrefix(options.productVersion)}${day}.`
    : calendarBuildVersion(day, 1).replace(/1$/u, '')
  const taken = await localVersions(options.artifactsRoot)
  if (options.deliveredArtifactsRoot !== undefined) taken.push(...await localVersions(options.deliveredArtifactsRoot))
  const calendar = parseCalendarVersion(options.productVersion)
  const candidates = calendar === undefined ? taken : taken.filter(version => parseCalendarVersion(version) !== undefined)
  const used = sequenceNumbers(candidates, prefix)
  // Calendar days number from 0, and the checkout's own product version is the
  // floor for its day. Legacy semantic builds keep their positive numbering.
  const ownDay = calendar !== undefined && prefix === desktopBuildVersionPrefix(options.productVersion)
  const minimum = calendar === undefined ? 1 : ownDay ? calendar.sequence : 0
  const next = Math.max(minimum, used.length === 0 ? 0 : Math.max(...used) + 1)
  const suggestion = validateDesktopBuildVersion(`${prefix}${String(next)}`, options.productVersion)
  const display = displayProductVersion(suggestion)
  const displayPrefix = calendar === undefined ? prefix : display.slice(0, display.lastIndexOf('.') + 1)
  process.stdout.write(`desktop package: numbering ${display} after ${String(used.length)} local DSHU artifact${used.length === 1 ? '' : 's'} for ${displayPrefix}*\n`)
  return suggestion
}
