/** Compare critical files in a final Linux portable archive with the assembled application. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join, resolve } from 'node:path'
import { list } from 'tar'

const PORTABLE_FILES = ['deepseek-harness-uncensored', 'resources/app.asar', 'resources/runtime/cli/bin/dsh-uncensored'] as const

interface PortableFingerprint {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  readonly executable: boolean
}

/**
 * Read the portable executable, ASAR and CLI launcher's bytes and file modes from a tarball.
 * @param archive - Final Linux portable archive.
 * @returns Verified file fingerprints relative to the archive's application directory.
 */
export async function readLinuxPortableFiles(archive: string): Promise<readonly PortableFingerprint[]> {
  const expected = new Set<string>(PORTABLE_FILES)
  const records: { root: string; path: string; type: string; size: number; bytes: number; sha256: string; executable: boolean }[] = []
  await list({ file: archive, strict: true, onReadEntry(entry) {
    const [root, ...segments] = entry.path.replace(/^\.\//u, '').split('/')
    const path = segments.join('/')
    if (root === undefined || !expected.has(path)) return
    const hash = createHash('sha256')
    const record = { root, path, type: entry.type, size: entry.size, bytes: 0, sha256: '', executable: ((entry.mode ?? 0) & 0o111) !== 0 }
    records.push(record)
    entry.on('data', (chunk) => { record.bytes += chunk.length; hash.update(chunk) })
    entry.once('end', () => { record.sha256 = hash.digest('hex') })
  } })
  if (records.length !== expected.size || new Set(records.map(record => record.path)).size !== expected.size) {
    throw new Error('Linux portable archive: required application files are missing or repeated')
  }
  const root = records[0]!.root
  if (root === '' || root === '.' || root === '..' || records.some(record => record.root !== root)) {
    throw new Error('Linux portable archive: expected one application directory')
  }
  for (const record of records) {
    if (record.type !== 'File' || record.bytes === 0 || record.bytes !== record.size || record.sha256 === '') {
      throw new Error(`Linux portable archive: invalid file ${record.path}`)
    }
    if (record.path !== 'resources/app.asar' && !record.executable) {
      throw new Error(`Linux portable archive: executable permission missing for ${record.path}`)
    }
  }
  return records.map(({ path, bytes, sha256, executable }) => ({ path, bytes, sha256, executable }))
}

/**
 * Verify the final portable archive contains the same executable, ASAR and CLI launcher as the assembled application.
 * @param archive - Final Linux portable archive.
 * @param application - Assembled application directory used by the packager.
 * @returns Completion after the critical files match.
 */
export async function verifyLinuxPortableArchive(archive: string, application: string): Promise<void> {
  for (const entry of await readLinuxPortableFiles(archive)) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(join(application, ...entry.path.split('/')))) hash.update(chunk)
    if (hash.digest('hex') !== entry.sha256) throw new Error(`Linux portable archive: assembled file differs for ${entry.path}`)
  }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const [archive, application] = process.argv.slice(2)
  if (archive === undefined || application === undefined || process.argv.length !== 4) {
    throw new Error('Linux portable archive: expected archive filename and assembled application directory')
  }
  await verifyLinuxPortableArchive(resolve(archive), resolve(application))
}
