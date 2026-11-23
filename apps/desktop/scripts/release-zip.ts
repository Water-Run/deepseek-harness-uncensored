/**
 * Write a stored (uncompressed) ZIP archive.
 * Release installers are already compressed containers, so deflating them would cost CPU for no size gain;
 * storing keeps the archive cheap to produce and lets the bytes be read back without a decompressor.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'

/** One file the archive carries. */
export interface ReleaseZipEntry {
  /** Absolute source path. */
  readonly source: string
  /** Path the entry carries inside the archive, using `/` separators. */
  readonly name: string
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50
/** UTF-8 names, so the archive needs no code-page guessing. */
const UTF8_NAME_FLAG = 0x0800

/** Incremental CRC-32 (IEEE 802.3) over the bytes already written. */
class Crc32 {
  private state = 0xffffffff

  /** Add bytes to the running checksum. */
  update(chunk: Buffer): void {
    for (const byte of chunk) this.state = CRC_TABLE[(this.state ^ byte) & 0xff]! ^ (this.state >>> 8)
  }

  /** Finish and return the checksum. */
  digest(): number {
    return (this.state ^ 0xffffffff) >>> 0
  }
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

/**
 * Convert a modification time into the MS-DOS date and time fields a ZIP header carries.
 * @param time - Milliseconds since the epoch.
 * @returns The packed date in the high half and the packed time in the low half.
 */
function dosTimestamp(time: number): { date: number; time: number } {
  const at = new Date(time)
  const year = Math.max(1980, at.getFullYear())
  return {
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (Math.floor(at.getSeconds() / 2) & 0x1f),
  }
}

interface ScannedEntry extends ReleaseZipEntry {
  readonly bytes: number
  readonly crc: number
  readonly modified: number
  readonly nameBytes: Buffer
}

async function scan(entry: ReleaseZipEntry): Promise<ScannedEntry> {
  const file = await stat(entry.source)
  if (!file.isFile() || file.size === 0) throw new Error(`release zip: ${entry.source} is not a nonempty file`)
  const crc = new Crc32()
  for await (const chunk of createReadStream(entry.source)) crc.update(chunk as Buffer)
  return { ...entry, bytes: file.size, crc: crc.digest(), modified: file.mtimeMs, nameBytes: Buffer.from(entry.name, 'utf8') }
}

/**
 * Write one stored ZIP archive.
 * Each member is read twice: once for its CRC, once to copy its bytes, so peak memory stays one chunk.
 * @param entries - Files to store, in archive order.
 * @param destination - Archive path to create.
 * @returns The archive's SHA-256 and byte length.
 */
export async function writeStoredZip(entries: readonly ReleaseZipEntry[], destination: string): Promise<{ bytes: number; sha256: string }> {
  if (entries.length === 0) throw new Error('release zip: no entries')
  if (entries.length > 0xffff) throw new Error('release zip: more than 65535 members requires ZIP64')
  const scanned: ScannedEntry[] = []
  for (const entry of entries) scanned.push(await scan(entry))
  const total = scanned.reduce((sum, entry) => sum + entry.bytes, 0)
  if (scanned.some(entry => entry.bytes > 0xffffffff) || total > 0xffffffff) {
    throw new Error('release zip: more than 4 GiB requires ZIP64')
  }

  const targets: { offset: number; entry: ScannedEntry }[] = []
  let offset = 0
  const handle = await open(destination, 'w')
  try {
    for (const entry of scanned) {
      const stamp = dosTimestamp(entry.modified)
      const header = Buffer.alloc(30)
      header.writeUInt32LE(LOCAL_HEADER, 0)
      header.writeUInt16LE(20, 4)
      header.writeUInt16LE(UTF8_NAME_FLAG, 6)
      header.writeUInt16LE(0, 8)
      header.writeUInt16LE(stamp.time, 10)
      header.writeUInt16LE(stamp.date, 12)
      header.writeUInt32LE(entry.crc, 14)
      header.writeUInt32LE(entry.bytes, 18)
      header.writeUInt32LE(entry.bytes, 22)
      header.writeUInt16LE(entry.nameBytes.length, 26)
      header.writeUInt16LE(0, 28)
      await handle.write(header)
      await handle.write(entry.nameBytes)
      targets.push({ offset, entry })
      for await (const chunk of createReadStream(entry.source)) await handle.write(chunk as Buffer)
      offset += 30 + entry.nameBytes.length + entry.bytes
    }

    const centralStart = offset
    for (const { offset: localOffset, entry } of targets) {
      const stamp = dosTimestamp(entry.modified)
      const header = Buffer.alloc(46)
      header.writeUInt32LE(CENTRAL_HEADER, 0)
      header.writeUInt16LE(20, 4)
      header.writeUInt16LE(20, 6)
      header.writeUInt16LE(UTF8_NAME_FLAG, 8)
      header.writeUInt16LE(0, 10)
      header.writeUInt16LE(stamp.time, 12)
      header.writeUInt16LE(stamp.date, 14)
      header.writeUInt32LE(entry.crc, 16)
      header.writeUInt32LE(entry.bytes, 20)
      header.writeUInt32LE(entry.bytes, 24)
      header.writeUInt16LE(entry.nameBytes.length, 28)
      header.writeUInt16LE(0, 30)
      header.writeUInt16LE(0, 32)
      header.writeUInt16LE(0, 34)
      header.writeUInt16LE(0, 36)
      header.writeUInt32LE(0, 38)
      header.writeUInt32LE(localOffset, 42)
      await handle.write(header)
      await handle.write(entry.nameBytes)
      offset += 46 + entry.nameBytes.length
    }
    const centralSize = offset - centralStart

    const end = Buffer.alloc(22)
    end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(scanned.length, 8)
    end.writeUInt16LE(scanned.length, 10)
    end.writeUInt32LE(centralSize, 12)
    end.writeUInt32LE(centralStart, 16)
    end.writeUInt16LE(0, 20)
    await handle.write(end)
  } finally {
    await handle.close()
  }

  const digest = createHash('sha256')
  for await (const chunk of createReadStream(destination)) digest.update(chunk as Buffer)
  const { size } = await stat(destination)
  return { bytes: size, sha256: digest.digest('hex').toUpperCase() }
}
