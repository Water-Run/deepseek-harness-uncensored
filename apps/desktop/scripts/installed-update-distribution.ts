/** Validate local qualification payload bytes and prepare separate binary and fixed-feed operations. */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, rmdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { load } from 'js-yaml'
import { readInstalledUpdateRun } from './installed-update-qualification.ts'

/** A local immutable object, with its final test-only destination and digest. */
export interface InstalledUpdateBinary {
  readonly path: string
  readonly name: string
  readonly url: string
  readonly size: number
  readonly sha512: string
}

/** File integrity does not establish signature, application identity, or authority to publish. */
export interface InstalledUpdateDistribution {
  readonly version: string
  readonly releaseTag: string
  readonly binaries: readonly InstalledUpdateBinary[]
  readonly feed: { readonly name: string; readonly url: string; readonly contents: string; readonly sha512: string }
  readonly verified: 'file-integrity-only'
  readonly publicationAuthorized: false
}

/**
 * Name the Windows x64 installer used by both the qualification builder and its feed checker.
 * @param version Version selected from the validated qualification run.
 * @returns GitHub asset filename.
 */
export function installedUpdateArtifactName(version: string): string {
  return `dshu-qualification-${version}-win-x64.exe`
}

async function binaryPath(directory: string, name: string, base: string) {
  const path = join(directory, name)
  const file = await stat(path)
  if (!file.isFile() || file.size === 0) throw new Error('installed update: missing or empty binary material')
  return { path, name, url: new URL(name, base).href, size: file.size }
}

async function inspectInstaller(installer: string, blockmap: string) {
  const scratch = await mkdtemp(join(tmpdir(), 'dshu-blockmap-'))
  const generated = join(scratch, 'installer.blockmap')
  try {
    const digest = await buildBlockMap(installer, 'gzip', generated)
    const expected = gunzipSync(await readFile(generated))
    const bytes = await readFile(blockmap)
    let actual: Buffer
    try {
      actual = gunzipSync(bytes, { maxOutputLength: expected.length })
    } catch (cause) {
      throw new Error('installed update: invalid external blockmap', { cause })
    }
    if (!actual.equals(expected)) throw new Error('installed update: external blockmap differs from the installer')
    return { digest, map: { size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') } }
  } finally {
    await rm(generated, { force: true })
    await rmdir(scratch)
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('installed update: invalid feed metadata')
  return value as Record<string, unknown>
}

/**
 * Check the generated YAML and external blockmap against installer bytes.
 * @param manifest Original qualification run.json; test identity and destinations are revalidated.
 * @param version One of the run's two versions, never a version inferred from YAML.
 * @returns Read-only binary and feed plans; no credentials, network, signing, or installation are involved.
 */
export async function planInstalledUpdateDistribution(manifest: string, version: string): Promise<InstalledUpdateDistribution> {
  const run = await readInstalledUpdateRun(manifest)
  if (!run.versions.includes(version)) throw new Error('installed update: version is outside the qualification run')
  const directory = join(run.root, version, 'installer')
  const feedName = 'nightly.yml'
  const bytes = await readFile(join(directory, feedName))
  const contents = bytes.toString('utf8')
  if (!Buffer.from(contents).equals(bytes)) throw new Error('installed update: feed must use valid UTF-8')
  const metadata = record(load(contents))
  if (metadata.version !== version || !Array.isArray(metadata.files) || metadata.files.length !== 1 || 'packages' in metadata) {
    throw new Error('installed update: feed must describe exactly the selected version and installer')
  }
  const info = record(metadata.files[0])
  const filename = installedUpdateArtifactName(version)
  if (info.url !== filename || (metadata.path !== undefined && metadata.path !== filename)) {
    throw new Error('installed update: feed filename must identify the selected local Windows installer')
  }
  const installer = await binaryPath(directory, filename, run.feedBaseUrl)
  const blockmap = await binaryPath(directory, `${filename}.blockmap`, run.feedBaseUrl)
  const { digest, map } = await inspectInstaller(installer.path, blockmap.path)
  if (digest.size !== installer.size || info.size !== installer.size || info.sha512 !== digest.sha512
    || (metadata.sha512 !== undefined && metadata.sha512 !== digest.sha512)) {
    throw new Error('installed update: installer size or SHA-512 differs from the generated feed')
  }
  if (map.size !== blockmap.size) throw new Error('installed update: external blockmap size changed during verification')
  if (metadata.releaseDate !== undefined && (typeof metadata.releaseDate !== 'string'
    || !Number.isFinite(Date.parse(metadata.releaseDate)))) throw new Error('installed update: invalid feed release date')
  return { version, releaseTag: run.releaseTag, binaries: [{ ...installer, sha512: digest.sha512 }, { ...blockmap, ...map }],
    feed: { name: feedName, url: new URL(feedName, run.feedBaseUrl).href, contents,
      sha512: createHash('sha512').update(bytes).digest('base64') },
    verified: 'file-integrity-only', publicationAuthorized: false }
}
