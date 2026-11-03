/** Local DSHU build numbering; no release credentials or remote storage are consulted. */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'semver'
import { desktopBuildVersionPrefix, validateDesktopBuildVersion } from './desktop-build-version.mjs'

/** Artifact name electron-builder writes for one build, on either platform; unsigned and unnotarized builds add a suffix. */
const ARTIFACT =
  /(?:^|\/)deepseek-harness-uncensored-(?<version>.+)-(?:mac|win)-(?:arm64|x64)(?:-unsigned|-unnotarized)?\.(?:exe|dmg|zip)$/u

/** Inputs that decide which versions are already taken. */
export interface DesktopBuildVersionSuggestionOptions {
  readonly productVersion: string
  /** Date segment to number within; defaults to today where the build runs. */
  readonly date?: string
  /** Directory electron-builder writes installers into for this build. */
  readonly artifactsRoot: string
}

/**
 * Format a date as the convention's segment.
 * @param date - Date to format.
 * @returns The date as `YYYYMMDD` in the build host's own time zone.
 */
export function desktopBuildDateSegment(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${String(date.getFullYear())}${month}${String(date.getDate()).padStart(2, '0')}`
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
  return entries.map(entry => ARTIFACT.exec(entry)?.groups?.version)
    .filter((version): version is string => version !== undefined && parse(version) !== null)
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
  const prefix = `${desktopBuildVersionPrefix(options.productVersion)}${options.date ?? desktopBuildDateSegment()}.`
  const taken = await localVersions(options.artifactsRoot)
  const used = sequenceNumbers(taken, prefix)
  const next = used.length === 0 ? 1 : Math.max(...used) + 1
  const suggestion = validateDesktopBuildVersion(`${prefix}${String(next)}`, options.productVersion)
  process.stdout.write(`desktop package: numbering ${suggestion} after ${String(used.length)} local DSHU artifact${used.length === 1 ? '' : 's'} for ${prefix}*\n`)
  return suggestion
}
