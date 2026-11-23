/** Compare critical files in a Linux RPM package with the assembled application. */
import { execFile, spawn } from 'node:child_process'
import { createHash, type Hash } from 'node:crypto'
import { resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { promisify } from 'node:util'
import {
  compareLinuxArchiveFiles,
  LINUX_APPLICATION_DIRECTORY,
  LINUX_APPLICATION_FILES,
} from './verify-linux-portable-archive.ts'

const LABEL = 'Linux RPM package'
const APPLICATION_PREFIX = `${LINUX_APPLICATION_DIRECTORY}/`
const PACKAGE_NAME = 'deepseek-harness-uncensored'
const NEWC_MAGIC = '070701'
/** Fixed newc header: six magic bytes plus thirteen eight-character hexadecimal fields. */
const NEWC_HEADER_BYTES = 110
const NEWC_TRAILER = 'TRAILER!!!'
const LINUX_PACKAGE_ARCHITECTURES = new Set(['x86_64', 'aarch64'])

/** One application file read back from the RPM payload. */
interface RpmPayloadFingerprint {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  readonly executable: boolean
}

/** Identity the RPM metadata declares for the package it describes. */
export interface LinuxRpmIdentity {
  readonly name: string
  readonly version: string
  readonly release: string
  readonly arch: string
}

/** One payload entry being consumed; unwanted entries skip without hashing. */
interface EntryState {
  /** Application-relative path when the entry is required, undefined for a skipped entry. */
  readonly path: string | undefined
  readonly mode: number
  readonly hash: Hash | undefined
  remaining: number
  padding: number
  bytes: number
}

const run = promisify(execFile)

/**
 * Read the package identity from the RPM header without unpacking the payload.
 * @param archive - RPM package produced by Desktop packaging.
 * @returns Name, version, release and architecture the header declares.
 */
export async function queryLinuxRpmArchive(archive: string): Promise<LinuxRpmIdentity> {
  let stdout: string
  try {
    ({ stdout } = await run('rpm', ['-qp', '--queryformat', '%{NAME}\n%{VERSION}\n%{RELEASE}\n%{ARCH}\n', archive],
      { timeout: 60_000, windowsHide: true }))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${LABEL}: packaging verifies RPM metadata with the host rpm command. ${reason}`)
  }
  const [name, version, release, arch] = stdout.trim().split('\n')
  if (name === undefined || version === undefined || release === undefined || arch === undefined) {
    throw new Error(`${LABEL}: the package header has no complete name, version, release and architecture`)
  }
  return { name, version, release, arch }
}

/**
 * Open the uncompressed payload of an RPM package.
 * @param archive - RPM package produced by Desktop packaging.
 * @returns The payload stream; the caller consumes it to completion.
 */
function openRpmPayload(archive: string): Readable {
  const child = spawn('rpm2cpio', [archive], { windowsHide: true })
  const payload = child.stdout
  if (payload === null) throw new Error(`${LABEL}: rpm2cpio produced no payload stream`)
  child.once('error', (error: Error) => {
    payload.destroy(new Error(`${LABEL}: packaging reads RPM payloads with rpm2cpio. ${error.message}`))
  })
  let diagnostics = ''
  child.stderr.on('data', (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString('utf8')).slice(-4096) })
  child.once('close', (code) => {
    if (code === 0) return
    const detail = diagnostics.trim()
    payload.destroy(new Error(`${LABEL}: rpm2cpio exited with ${String(code)}${detail === '' ? '' : `: ${detail}`}`))
  })
  return payload
}

function entryFields(header: Buffer): number[] {
  const values: number[] = []
  for (let field = 0; field < 13; field += 1) {
    const start = 6 + field * 8
    const text = header.toString('latin1', start, start + 8)
    if (!/^[0-9a-f]{8}$/iu.test(text)) throw new Error(`${LABEL}: invalid cpio entry field`)
    values.push(Number.parseInt(text, 16))
  }
  return values
}

/**
 * Read the indexed application files from an RPM cpio payload without extracting it.
 * @param source - Newc payload stream.
 * @returns Fingerprints of every required application file.
 */
export async function readLinuxRpmPayloadFiles(source: Readable): Promise<readonly RpmPayloadFingerprint[]> {
  const wanted = new Map(LINUX_APPLICATION_FILES.map(path => [`./${APPLICATION_PREFIX}${path}`, path]))
  const found = new Map<string, RpmPayloadFingerprint>()
  let pending: Buffer = Buffer.alloc(0)
  let entry: EntryState | undefined
  let trailer = false
  for await (const chunk of source as AsyncIterable<Buffer>) {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk])
    for (;;) {
      if (entry !== undefined) {
        if (entry.remaining > 0) {
          const take = Math.min(entry.remaining, pending.length)
          if (take === 0) break
          if (entry.hash !== undefined) entry.hash.update(pending.subarray(0, take))
          entry.bytes += take
          entry.remaining -= take
          pending = pending.subarray(take)
          if (entry.remaining > 0) break
        }
        if (entry.padding > 0) {
          const skip = Math.min(entry.padding, pending.length)
          entry.padding -= skip
          pending = pending.subarray(skip)
          if (entry.padding > 0) break
        }
        if (entry.path !== undefined && entry.hash !== undefined) {
          found.set(entry.path, {
            path: entry.path, bytes: entry.bytes, sha256: entry.hash.digest('hex'), executable: (entry.mode & 0o111) !== 0,
          })
        }
        entry = undefined
        continue
      }
      if (pending.length < NEWC_HEADER_BYTES) break
      const header = pending.subarray(0, NEWC_HEADER_BYTES)
      if (header.toString('latin1', 0, 6) !== NEWC_MAGIC) throw new Error(`${LABEL}: the payload is not a newc cpio archive`)
      const fields = entryFields(header)
      const mode = fields[1]!
      const size = fields[6]!
      const nameSize = fields[11]!
      const nameEnd = NEWC_HEADER_BYTES + nameSize
      const dataStart = nameEnd + (4 - (nameEnd % 4)) % 4
      if (pending.length < dataStart) break
      const name = pending.toString('utf8', NEWC_HEADER_BYTES, nameEnd).replace(/\0+$/u, '')
      pending = pending.subarray(dataStart)
      if (name === NEWC_TRAILER) {
        trailer = true
        break
      }
      const path = wanted.get(name)
      entry = {
        path, mode, hash: path === undefined ? undefined : createHash('sha256'),
        remaining: size, padding: (4 - (size % 4)) % 4, bytes: 0,
      }
    }
    if (trailer) break
  }
  if (!trailer) {
    if (entry !== undefined) throw new Error(`${LABEL}: the payload ends inside ${entry.path ?? 'an entry'}`)
    throw new Error(`${LABEL}: the payload has no cpio trailer`)
  }
  if (found.size !== LINUX_APPLICATION_FILES.length) {
    const missing = LINUX_APPLICATION_FILES.filter(path => !found.has(path))
    throw new Error(`${LABEL}: required application files are missing from the payload: ${missing.join(', ')}`)
  }
  for (const record of found.values()) {
    if (record.bytes === 0) throw new Error(`${LABEL}: empty file ${record.path}`)
    if (record.path !== 'resources/app.asar' && !record.executable) {
      throw new Error(`${LABEL}: executable permission missing for ${record.path}`)
    }
  }
  return [...found.values()]
}

/**
 * Read critical file fingerprints from the assembled application's RPM package.
 * @param archive - RPM package produced by Desktop packaging.
 * @returns Verified file fingerprints relative to the package's application directory.
 */
export async function readLinuxRpmFiles(archive: string): Promise<readonly RpmPayloadFingerprint[]> {
  const identity = await queryLinuxRpmArchive(archive)
  if (identity.name !== PACKAGE_NAME) {
    throw new Error(`${LABEL}: the package is named ${JSON.stringify(identity.name)} instead of ${PACKAGE_NAME}`)
  }
  if (!LINUX_PACKAGE_ARCHITECTURES.has(identity.arch)) {
    throw new Error(`${LABEL}: unsupported package architecture ${JSON.stringify(identity.arch)}`)
  }
  const files = await readLinuxRpmPayloadFiles(openRpmPayload(archive))
  if (files.length !== LINUX_APPLICATION_FILES.length) throw new Error(`${LABEL}: expected ${LINUX_APPLICATION_FILES.length} application files`)
  return files
}

/**
 * Verify the RPM package's executable, ASAR and CLI launcher match the assembled application.
 * @param archive - Final RPM package.
 * @param application - Assembled application directory used by the packager.
 * @returns Completion after the three indexed files match.
 */
export async function verifyLinuxRpmArchive(archive: string, application: string): Promise<void> {
  const files = await readLinuxRpmFiles(archive)
  await compareLinuxArchiveFiles(files, application, LABEL)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const [archive, application] = process.argv.slice(2)
  if (archive === undefined || application === undefined || process.argv.length !== 4) {
    throw new Error(LABEL + ': expected package filename and assembled application directory')
  }
  await verifyLinuxRpmArchive(resolve(archive), resolve(application))
}
