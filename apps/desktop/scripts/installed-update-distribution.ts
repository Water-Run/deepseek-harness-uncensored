/** Validate local qualification payload bytes and prepare separate binary and fixed-feed operations. */
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { readInstalledUpdateRun } from './installed-update-qualification.ts'
import { verifyWindowsInstallerUpdate } from './verify-windows-installer-blockmap.ts'

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
  const filename = installedUpdateArtifactName(version)
  const installer = await binaryPath(directory, filename, run.feedBaseUrl)
  const blockmap = await binaryPath(directory, `${filename}.blockmap`, run.feedBaseUrl)
  const { digest, map, feed } = await verifyWindowsInstallerUpdate(installer.path, join(directory, feedName), version, blockmap.path)
  if (digest.size !== installer.size) throw new Error('installed update: installer size changed during verification')
  if (map.size !== blockmap.size) throw new Error('installed update: external blockmap size changed during verification')
  return { version, releaseTag: run.releaseTag, binaries: [{ ...installer, sha512: digest.sha512 }, { ...blockmap, ...map }],
    feed: { ...feed, name: feedName, url: new URL(feedName, run.feedBaseUrl).href },
    verified: 'file-integrity-only', publicationAuthorized: false }
}
