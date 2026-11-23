/** RPM payload reading used by Linux packaging verification. */
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readLinuxRpmPayloadFiles } from '../scripts/verify-linux-rpm-archive.ts'

const APPLICATION_PREFIX = 'opt/DeepSeek Harness Uncensored/'
const TRAILER = 'TRAILER!!!'

interface FixtureEntry {
  readonly name: string
  readonly mode: number
  readonly data: string
}

function pad4(value: number): number {
  return (4 - (value % 4)) % 4
}

/** Assemble a newc cpio payload the way fpm writes the RPM body. */
function newcPayload(entries: readonly FixtureEntry[]): Buffer {
  const parts: Buffer[] = []
  for (const entry of [...entries, { name: TRAILER, mode: 0, data: '' }]) {
    const body = Buffer.from(entry.data, 'utf8')
    const name = Buffer.from(`${entry.name}\0`, 'utf8')
    const header = Buffer.from([
      '070701',
      '00000000',
      entry.mode.toString(16).padStart(8, '0'),
      '00000000',
      '00000000',
      '00000001',
      '00000000',
      body.length.toString(16).padStart(8, '0'),
      '00000000',
      '00000000',
      '00000000',
      '00000000',
      name.length.toString(16).padStart(8, '0'),
      '00000000',
    ].join(''), 'latin1')
    parts.push(header, name, Buffer.alloc(pad4(header.length + name.length)), body, Buffer.alloc(pad4(body.length)))
  }
  return Buffer.concat(parts)
}

function fingerprint(data: string): string {
  return createHash('sha256').update(Buffer.from(data, 'utf8')).digest('hex')
}

const applicationEntries: readonly FixtureEntry[] = [
  { name: `./${APPLICATION_PREFIX}deepseek-harness-uncensored`, mode: 0o100755, data: 'executable' },
  { name: `./${APPLICATION_PREFIX}resources/app.asar`, mode: 0o100644, data: 'asar payload' },
  { name: `./${APPLICATION_PREFIX}resources/runtime/cli/bin/dsh-uncensored`, mode: 0o100755, data: 'cli launcher' },
]

async function read(entries: readonly FixtureEntry[]) {
  return readLinuxRpmPayloadFiles(Readable.from([newcPayload(entries)]))
}

describe('Linux RPM payload', () => {
  it('indexes the executable, ASAR and CLI launcher by their application-relative paths', async () => {
    const files = await read(applicationEntries)
    expect(files.map(file => file.path)).toEqual([
      'deepseek-harness-uncensored', 'resources/app.asar', 'resources/runtime/cli/bin/dsh-uncensored',
    ])
    expect(files[0]).toMatchObject({ bytes: 10, sha256: fingerprint('executable'), executable: true })
    expect(files[1]).toMatchObject({ bytes: 12, sha256: fingerprint('asar payload'), executable: false })
    expect(files[2]).toMatchObject({ bytes: 12, sha256: fingerprint('cli launcher'), executable: true })
  })

  it('reads entries split across stream chunks', async () => {
    const payload = newcPayload(applicationEntries)
    const chunks = Array.from({ length: payload.length }, (_unused, index) => payload.subarray(index, index + 1))
    const files = await readLinuxRpmPayloadFiles(Readable.from(chunks))
    expect(files).toHaveLength(3)
    expect(files[1]?.sha256).toBe(fingerprint('asar payload'))
  })

  it('streams a large entry instead of buffering the whole payload', async () => {
    const big = 'x'.repeat(512 * 1024)
    const payload = newcPayload([
      { name: `./${APPLICATION_PREFIX}deepseek-harness-uncensored`, mode: 0o100755, data: 'executable' },
      { name: `./${APPLICATION_PREFIX}resources/app.asar`, mode: 0o100644, data: big },
      { name: `./${APPLICATION_PREFIX}resources/runtime/cli/bin/dsh-uncensored`, mode: 0o100755, data: 'cli launcher' },
    ])
    const chunks: Buffer[] = []
    for (let offset = 0; offset < payload.length; offset += 4096) chunks.push(payload.subarray(offset, offset + 4096))
    const files = await readLinuxRpmPayloadFiles(Readable.from(chunks))
    expect(files[1]).toMatchObject({ bytes: big.length, sha256: fingerprint(big) })
  })

  it('rejects a payload missing a required application file', async () => {
    await expect(read(applicationEntries.slice(0, 2))).rejects.toThrow(/required application files are missing/u)
  })

  it('rejects an executable without permission bits', async () => {
    const entries = [...applicationEntries]
    entries[0] = { ...entries[0]!, mode: 0o100644 }
    await expect(read(entries)).rejects.toThrow(/executable permission missing for deepseek-harness-uncensored/u)
  })

  it('rejects a payload without a cpio trailer', async () => {
    const truncated = newcPayload(applicationEntries)
    await expect(readLinuxRpmPayloadFiles(Readable.from([truncated.subarray(0, truncated.length - 120)])))
      .rejects.toThrow(/payload ends inside|no cpio trailer/u)
  })
})
