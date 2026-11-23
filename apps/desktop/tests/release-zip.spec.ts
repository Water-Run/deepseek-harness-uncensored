/** Stored ZIP writer used by release packaging. */
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import extractZip from 'extract-zip'
import { expect, it, onTestFinished } from 'vitest'
import { writeStoredZip } from '../scripts/release-zip.ts'

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-zip-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

it('round-trips members through an independent reader', async () => {
  const root = await workspace()
  const small = join(root, 'small.txt')
  const emptyish = join(root, 'binary.bin')
  const payload = Buffer.from(Array.from({ length: 70000 }, (_unused, index) => index % 251))
  await writeFile(small, 'release zip payload\n')
  await writeFile(emptyish, payload)
  const archive = join(root, 'out.zip')

  const summary = await writeStoredZip([
    { source: small, name: 'README.txt' },
    { source: emptyish, name: 'nested/payload.bin' },
  ], archive)

  expect(summary.bytes).toBe((await stat(archive)).size)
  expect(summary.sha256).toMatch(/^[0-9A-F]{64}$/u)

  const extracted = join(root, 'unpacked')
  await extractZip(archive, { dir: extracted })
  expect(await readFile(join(extracted, 'README.txt'), 'utf8')).toBe('release zip payload\n')
  expect(Buffer.compare(await readFile(join(extracted, 'nested/payload.bin')), Buffer.from(payload))).toBe(0)
})

it('rejects an empty member list and a missing file', async () => {
  const root = await workspace()
  await expect(writeStoredZip([], join(root, 'out.zip'))).rejects.toThrow(/no entries/u)
  await expect(writeStoredZip([{ source: join(root, 'missing.txt'), name: 'missing.txt' }], join(root, 'out.zip')))
    .rejects.toThrow(/ENOENT/u)
})
