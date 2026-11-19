/** Verify a final Windows installer against its blockmap, optional update feed and SHA-256 manifest. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { load } from 'js-yaml'

interface FileDigest {
  readonly size: number
  readonly sha512: string
}

interface VerifiedWindowsInstaller {
  readonly digest: FileDigest
  readonly map: FileDigest
}

/**
 * Check the external blockmap against the final installer bytes without modifying either file.
 * @param installer - Installer to inventory, after any signing has finished.
 * @param blockmap - Blockmap to verify, which defaults to the adjacent installer sidecar.
 * @returns Installer size and SHA-512, plus the original blockmap's size and SHA-512.
 */
export async function verifyWindowsInstallerBlockmap(
  installer: string, blockmap = `${installer}.blockmap`,
): Promise<VerifiedWindowsInstaller> {
  const scratch = await mkdtemp(join(tmpdir(), 'dshu-blockmap-'))
  const generated = join(scratch, 'installer.blockmap')
  try {
    const bytes = await readFile(blockmap)
    const { size, sha512 } = await buildBlockMap(installer, 'gzip', generated)
    if (size === undefined) throw new Error('desktop installer: blockmap verification returned no installer size')
    const expected = gunzipSync(await readFile(generated))
    let actual: Buffer
    try {
      actual = gunzipSync(bytes, { maxOutputLength: expected.length })
    } catch (cause) {
      throw new Error('desktop installer: invalid external blockmap', { cause })
    }
    if (!actual.equals(expected)) throw new Error('desktop installer: external blockmap differs from the installer')
    return { digest: { size, sha512 }, map: { size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') } }
  } finally {
    await rm(generated, { force: true })
    await rmdir(scratch)
  }
}

function feedRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('desktop installer: invalid feed metadata')
  return value as Record<string, unknown>
}

/**
 * Bind a local Windows update feed and external blockmap to one final installer.
 * @param installer - Exact expected installer path after any signing completes.
 * @param feedPath - Update feed emitted by the builder.
 * @param version - Runtime version selected by the packaging caller.
 * @param blockmap - External blockmap, which defaults to the adjacent sidecar.
 * @returns Installer and blockmap digests, plus the original UTF-8 feed and its digest.
 */
export async function verifyWindowsInstallerUpdate(
  installer: string, feedPath: string, version: string, blockmap = `${installer}.blockmap`,
): Promise<VerifiedWindowsInstaller & { readonly feed: { readonly contents: string; readonly sha512: string } }> {
  const bytes = await readFile(feedPath)
  const contents = bytes.toString('utf8')
  if (!Buffer.from(contents).equals(bytes)) throw new Error('desktop installer: feed must use valid UTF-8')
  const metadata = feedRecord(load(contents))
  if (metadata.version !== version || !Array.isArray(metadata.files) || metadata.files.length !== 1 || 'packages' in metadata) {
    throw new Error('desktop installer: feed must describe exactly the selected version and installer')
  }
  const info = feedRecord(metadata.files[0])
  const filename = basename(installer)
  if (info.url !== filename || (metadata.path !== undefined && metadata.path !== filename)) {
    throw new Error('desktop installer: feed filename must identify the selected local Windows installer')
  }
  if (metadata.releaseDate !== undefined && (typeof metadata.releaseDate !== 'string'
    || !Number.isFinite(Date.parse(metadata.releaseDate)))) throw new Error('desktop installer: invalid feed release date')
  const verified = await verifyWindowsInstallerBlockmap(installer, blockmap)
  if (info.size !== verified.digest.size || info.sha512 !== verified.digest.sha512
    || (metadata.sha512 !== undefined && metadata.sha512 !== verified.digest.sha512)) {
    throw new Error('desktop installer: installer size or SHA-512 differs from the generated feed')
  }
  return { ...verified, feed: { contents, sha512: createHash('sha512').update(bytes).digest('base64') } }
}

/**
 * Check the uniquely named installer entry in a SHA-256 manifest against the bytes already verified for updates.
 * Windows filenames that differ only in casing count as duplicate entries.
 * @param installer - Installer path, with its exact public filename.
 * @param manifest - UTF-8 SHA-256 manifest using the sha256sum text or binary marker.
 * @param verified - Installer digest from blockmap verification.
 * @returns The matched lowercase hexadecimal SHA-256.
 */
export async function verifyWindowsInstallerChecksum(installer: string, manifest: string, verified: FileDigest): Promise<string> {
  const bytes = await readFile(manifest)
  const text = bytes.toString('utf8')
  if (!Buffer.from(text).equals(bytes)) throw new Error('desktop installer: SHA-256 manifest must use valid UTF-8')
  const filename = basename(installer)
  const windowsFilename = filename.toLowerCase()
  let selected: { name: string; sha256: string } | undefined
  for (const line of text.replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    if (line.trim() === '') continue
    const parsed = /^([0-9a-f]{64}) [ *](.+)$/iu.exec(line)
    if (parsed === null) throw new Error('desktop installer: malformed SHA-256 manifest entry')
    const entryName = parsed[2]!
    if (entryName.toLowerCase() !== windowsFilename) continue
    if (selected !== undefined) throw new Error('desktop installer: duplicate SHA-256 entry for the installer')
    selected = { name: entryName, sha256: parsed[1]!.toLowerCase() }
  }
  if (selected?.name !== filename) throw new Error('desktop installer: SHA-256 manifest omits the installer with the exact filename')
  const sha256 = createHash('sha256'), sha512 = createHash('sha512')
  for await (const chunk of createReadStream(installer)) {
    sha256.update(chunk)
    sha512.update(chunk)
  }
  if (sha512.digest('base64') !== verified.sha512) {
    throw new Error('desktop installer: installer changed after blockmap verification')
  }
  const actual = sha256.digest('hex')
  if (actual !== selected.sha256) throw new Error('desktop installer: installer SHA-256 differs from the manifest')
  return actual
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    feed: { type: 'string' }, version: { type: 'string' }, checksums: { type: 'string' },
  } })
  const [installer] = positionals
  if (installer === undefined || positionals.length !== 1) throw new Error('desktop installer: expected one installer filename')
  const { feed, version, checksums } = values
  if ((feed === undefined) !== (version === undefined)) throw new Error('desktop installer: --feed and --version must be supplied together')
  const path = resolve(installer)
  const verified: VerifiedWindowsInstaller & { readonly feed?: { readonly sha512: string } } = feed === undefined || version === undefined
    ? await verifyWindowsInstallerBlockmap(path)
    : await verifyWindowsInstallerUpdate(path, resolve(feed), version)
  if (checksums !== undefined) {
    const sha256 = await verifyWindowsInstallerChecksum(path, resolve(checksums), verified.digest)
    console.log(JSON.stringify({ installer: basename(path), ...verified.digest, sha256, blockmap: verified.map,
      ...feed !== undefined && verified.feed !== undefined ? { feed: { name: basename(feed), sha512: verified.feed.sha512 } } : {},
      verified: 'file-integrity-only' }))
  }
}
