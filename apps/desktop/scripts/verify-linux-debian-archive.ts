/** Check critical files in the Linux Debian package without installing it. */
import { spawn } from 'node:child_process'
import { open, type FileHandle } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { getPath7za } from 'app-builder-lib/out/toolsets/7zip.js'
import { compareLinuxArchiveFiles, LINUX_APPLICATION_DIRECTORY, readLinuxArchiveFiles } from './verify-linux-portable-archive.ts'

const LABEL = 'Linux Debian package'
const APPLICATION_PREFIX = `${LINUX_APPLICATION_DIRECTORY}/`
const AR_MAGIC = Buffer.from('!<arch>\n')

async function dataMember(file: FileHandle): Promise<{ start: number; end: number; xz: boolean }> {
  const magic = Buffer.alloc(AR_MAGIC.length)
  const identifying = await file.read(magic, 0, magic.length, 0)
  if (identifying.bytesRead !== magic.length || !magic.equals(AR_MAGIC)) throw new Error(LABEL + ': invalid archive signature')
  const { size } = await file.stat()
  const header = Buffer.alloc(60)
  let offset = magic.length
  while (offset + header.length <= size) {
    const read = await file.read(header, 0, header.length, offset)
    const sizeField = header.toString('latin1', 48, 58).trim()
    if (read.bytesRead !== header.length || header[58] !== 0x60 || header[59] !== 0x0a || !/^\d+$/u.test(sizeField)) {
      throw new Error(LABEL + ': invalid member header')
    }
    const bytes = Number(sizeField)
    const start = offset + header.length
    if (bytes > size - start) throw new Error(LABEL + ': member exceeds the package size')
    const name = header.toString('latin1', 0, 16).trim().replace(/\/$/u, '')
    if (name === 'data.tar' || name === 'data.tar.gz' || name === 'data.tar.xz') {
      if (bytes === 0) throw new Error(LABEL + ': empty data member')
      return { start, end: start + bytes - 1, xz: name === 'data.tar.xz' }
    }
    offset = start + bytes + bytes % 2
  }
  throw new Error(LABEL + ': expected a tar, gzip or XZ data member')
}

async function readXzData(source: Readable, tool: string): ReturnType<typeof readLinuxArchiveFiles> {
  const child = spawn(tool, ['x', '-txz', '-si', '-so', '-bd', '-bso0', '-bsp0', '-bse2'], { windowsHide: true })
  let diagnostics = ''
  child.stderr.on('data', (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString('utf8')).slice(-16384) })
  const closed = new Promise<void>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0 && signal === null) resolveExit()
      else reject(new Error(LABEL + ': XZ reader failed: ' + (diagnostics.trim() || String(code ?? signal))))
    })
  })
  const work = [
    readLinuxArchiveFiles(child.stdout, LABEL, APPLICATION_PREFIX),
    closed,
    pipeline(source, child.stdin),
  ] as const
  try {
    const [files] = await Promise.all(work)
    return files
  } catch (error) {
    child.kill()
    await Promise.allSettled(work)
    throw error
  }
}

/**
 * Read critical file fingerprints from the assembled application's Debian package.
 * @param archive - Debian package produced by Desktop packaging.
 * @returns Verified file fingerprints relative to the package's application directory.
 */
export async function readLinuxDebianFiles(archive: string): ReturnType<typeof readLinuxArchiveFiles> {
  const file = await open(archive, 'r')
  try {
    const { start, end, xz } = await dataMember(file)
    const tool = xz ? await getPath7za() : undefined
    const source = file.createReadStream({ start, end, autoClose: false })
    return await (tool === undefined
      ? readLinuxArchiveFiles(source, LABEL, APPLICATION_PREFIX)
      : readXzData(source, tool))
  } finally { await file.close() }
}

/**
 * Verify the Debian package's executable, ASAR and CLI launcher match the assembled application.
 * @param archive - Final Debian package.
 * @param application - Assembled application directory used by the packager.
 * @returns Completion after the three indexed files match.
 */
export async function verifyLinuxDebianArchive(archive: string, application: string): Promise<void> {
  await compareLinuxArchiveFiles(await readLinuxDebianFiles(archive), application, LABEL)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const [archive, application] = process.argv.slice(2)
  if (archive === undefined || application === undefined || process.argv.length !== 4) {
    throw new Error(LABEL + ': expected package filename and assembled application directory')
  }
  await verifyLinuxDebianArchive(resolve(archive), resolve(application))
}
