/** Compare critical files in a final Linux portable archive with the assembled application. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { list } from 'tar'

/** Application files every Linux package must carry, relative to the application directory. */
export const LINUX_APPLICATION_FILES = ['deepseek-harness-uncensored', 'resources/app.asar', 'resources/runtime/cli/bin/dsh-uncensored'] as const

/** Install directory the packaged application occupies inside a Linux system package. */
export const LINUX_APPLICATION_DIRECTORY = 'opt/DeepSeek Harness Uncensored'

interface PortableFingerprint {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  readonly executable: boolean
}

/**
 * Read the executable, ASAR and CLI launcher's bytes and file modes from a Linux application payload.
 * @param source - Tar or gzip stream owned by the verifier.
 * @param label - Artifact description used in diagnostics.
 * @param applicationPrefix - Required application directory followed by a slash, or undefined for one portable root.
 * @returns Verified file fingerprints relative to the archive's application directory.
 */
export async function readLinuxArchiveFiles(
  source: Readable, label: string, applicationPrefix?: string,
): Promise<readonly PortableFingerprint[]> {
  const expected = new Set<string>(LINUX_APPLICATION_FILES)
  const records: { root: string; path: string; type: string; size: number; bytes: number; sha256: string; executable: boolean }[] = []
  await pipeline(source, list({ strict: true, onReadEntry(entry) {
    const name = entry.path.replace(/^\.\//u, '')
    const prefix = applicationPrefix ?? name.slice(0, name.indexOf('/') + 1)
    if (prefix === '' || !name.startsWith(prefix)) return
    const path = name.slice(prefix.length)
    if (!expected.has(path)) return
    const root = prefix.slice(0, -1)
    const hash = createHash('sha256')
    const record = { root, path, type: entry.type, size: entry.size, bytes: 0, sha256: '', executable: ((entry.mode ?? 0) & 0o111) !== 0 }
    records.push(record)
    entry.on('data', (chunk) => { record.bytes += chunk.length; hash.update(chunk) })
    entry.once('end', () => { record.sha256 = hash.digest('hex') })
  } }))
  if (records.length !== expected.size || new Set(records.map(record => record.path)).size !== expected.size) {
    throw new Error(`${label}: required application files are missing or repeated`)
  }
  const root = records[0]!.root
  if (root === '' || root === '.' || root === '..' || records.some(record => record.root !== root)) {
    throw new Error(`${label}: expected one application directory`)
  }
  for (const record of records) {
    if (record.type !== 'File' || record.bytes === 0 || record.bytes !== record.size || record.sha256 === '') {
      throw new Error(`${label}: invalid file ${record.path}`)
    }
    if (record.path !== 'resources/app.asar' && !record.executable) {
      throw new Error(`${label}: executable permission missing for ${record.path}`)
    }
  }
  return records.map(({ path, bytes, sha256, executable }) => ({ path, bytes, sha256, executable }))
}

/**
 * Read critical file fingerprints from a final Linux portable archive.
 * @param archive - Final Linux portable archive.
 * @returns Verified file fingerprints relative to the archive's application directory.
 */
export function readLinuxPortableFiles(archive: string): Promise<readonly PortableFingerprint[]> {
  return readLinuxArchiveFiles(createReadStream(archive), 'Linux portable archive')
}

/**
 * Compare archived file bytes with the assembled Linux application.
 * @param files - Verified fingerprints from the archive reader.
 * @param application - Assembled application directory used by the packager.
 * @param label - Artifact description used in diagnostics.
 * @returns Completion after all indexed files match.
 */
export async function compareLinuxArchiveFiles(files: readonly PortableFingerprint[], application: string, label: string): Promise<void> {
  for (const entry of files) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(join(application, ...entry.path.split('/')))) hash.update(chunk)
    if (hash.digest('hex') !== entry.sha256) throw new Error(`${label}: assembled file differs for ${entry.path}`)
  }
}

/**
 * Verify the final portable archive contains the same executable, ASAR and CLI launcher as the assembled application.
 * @param archive - Final Linux portable archive.
 * @param application - Assembled application directory used by the packager.
 * @returns Completion after the critical files match.
 */
export async function verifyLinuxPortableArchive(archive: string, application: string): Promise<void> {
  await compareLinuxArchiveFiles(await readLinuxPortableFiles(archive), application, 'Linux portable archive')
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const [archive, application] = process.argv.slice(2)
  if (archive === undefined || application === undefined || process.argv.length !== 4) {
    throw new Error('Linux portable archive: expected archive filename and assembled application directory')
  }
  await verifyLinuxPortableArchive(resolve(archive), resolve(application))
}
