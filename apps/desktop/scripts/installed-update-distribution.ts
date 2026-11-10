/** Validate local qualification payload bytes and prepare separate binary and fixed-feed operations. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
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

async function binary(path: string, name: string, base: string): Promise<InstalledUpdateBinary> {
  const file = await stat(path)
  if (!file.isFile() || file.size === 0) throw new Error('installed update: missing or empty binary material')
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return { path, name, url: new URL(name, base).href, size: file.size, sha512: hash.digest('base64') }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('installed update: invalid feed metadata')
  return value as Record<string, unknown>
}

/**
 * Check the generated YAML against installer bytes and retain the same bytes for the fixed GitHub feed.
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
  const installer = await binary(join(directory, filename), filename, run.feedBaseUrl)
  if (info.size !== installer.size || info.sha512 !== installer.sha512
    || (metadata.sha512 !== undefined && metadata.sha512 !== installer.sha512)) {
    throw new Error('installed update: installer size or SHA-512 differs from the generated feed')
  }
  const blockmapName = `${filename}.blockmap`
  const blockmap = await binary(join(directory, blockmapName), blockmapName, run.feedBaseUrl)
  if (metadata.releaseDate !== undefined && (typeof metadata.releaseDate !== 'string'
    || !Number.isFinite(Date.parse(metadata.releaseDate)))) throw new Error('installed update: invalid feed release date')
  return { version, releaseTag: run.releaseTag, binaries: [installer, blockmap],
    feed: { name: feedName, url: new URL(feedName, run.feedBaseUrl).href, contents,
      sha512: createHash('sha512').update(bytes).digest('base64') },
    verified: 'file-integrity-only', publicationAuthorized: false }
}
