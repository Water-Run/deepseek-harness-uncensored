/** Discover signed-build inputs in the latest public DSHU release. */
import { parseCalendarVersion } from '@deepseek-ai/dsh-product-version/bootstrap'
import type { CustomPublishOptions, UpdateInfo } from 'builder-util-runtime'
import type { AppUpdater, ResolvedUpdateFileInfo } from 'electron-updater'
import { Provider, type ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider.js'
import { gt } from 'semver'
import { z } from 'zod'

const repository = 'Water-Run/deepseek-harness-uncensored'
const releaseSchema = z.object({
  tag_name: z.string(), published_at: z.string().datetime(), draft: z.literal(false), prerelease: z.literal(false),
  body: z.string().nullable(), assets: z.array(z.object({
    name: z.string(), size: z.number().int().positive(), state: z.string(),
    browser_download_url: z.string(), digest: z.string().nullable().optional(),
  })),
})
const hashes = z.array(z.object({
  name: z.string(), size: z.number().int().positive(),
  sha512: z.string().regex(/^[A-Za-z0-9+/]{85}[AQgw]==$/u), sha256: z.string().regex(/^[a-f0-9]{64}$/u),
}))

/**
 * Select tag-pinned installer URLs for one GitHub release.
 * @param document - Raw JSON returned by the public latest release endpoint.
 * @param installedVersion - Local runtime version used to exclude downgrades.
 * @param platform - Platform of the installed application.
 * @param arch - Architecture of the installed application.
 * @returns Update metadata for electron-updater, including size and SHA-512 for each target.
 */
export function installerUpdateInfo(document: unknown, installedVersion: string,
  platform: ProviderRuntimeOptions['platform'], arch: string): UpdateInfo {
  const release = releaseSchema.parse(document)
  const version = parseCalendarVersion(release.tag_name.slice(1))
  if (!version || release.tag_name !== 'v' + version.display) throw new Error('desktop update: invalid DSHU release tag')
  const info = { version: version.runtime, releaseDate: release.published_at }
  if (!gt(version.runtime, installedVersion)) return { ...info, files: [], path: '', sha512: '' }
  const markers = [...(release.body ?? '').matchAll(/^<!-- dshu-installers-v1 (.+) -->$/gmu)]
  const marker = markers[0]?.[1]
  if (markers.length !== 1 || marker === undefined) throw new Error('desktop update: expected one installer checksum list in the release notes')
  const receipts = hashes.parse(JSON.parse(marker))
  const target = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux'
  let extensions: string[]
  if (target === 'win' && arch === 'x64') extensions = ['exe']
  else if (target === 'mac' && arch === 'arm64') extensions = ['dmg']
  else if (target === 'linux' && arch === 'x64') extensions = ['deb', 'rpm']
  else if (target === 'linux' && arch === 'arm64') extensions = ['deb']
  else throw new Error('desktop update: unsupported installer target ' + target + '-' + arch)
  const files = extensions.map((extension) => {
    const name = ['DSHU', version.display, target, arch].join('-') + '.' + extension
    const entries = receipts.filter(item => item.name === name)
    const assets = release.assets.filter(item => item.name === name)
    const asset = assets[0], receipt = entries[0]
    const url = 'https://github.com/' + repository + '/releases/download/' + release.tag_name + '/' + name
    if (assets.length !== 1 || entries.length !== 1 || !asset || !receipt || asset.state !== 'uploaded'
      || asset.size !== receipt.size || asset.browser_download_url !== url || asset.digest !== 'sha256:' + receipt.sha256) {
      throw new Error('desktop update: release asset and installer checksums disagree for ' + name)
    }
    return { url, size: receipt.size, sha512: receipt.sha512 }
  })
  const primary = files[0]
  if (!primary) throw new Error('desktop update: no installer for the selected target')
  return { ...info, files, path: primary.url, sha512: primary.sha512 }
}

/** Resolve only tag-pinned installers for the checked public release and running platform. */
export class GithubInstallerProvider extends Provider<UpdateInfo> {
  constructor(_options: CustomPublishOptions, private readonly updater: AppUpdater, private readonly runtime: ProviderRuntimeOptions) {
    super({ ...runtime, isUseMultipleRangeRequest: false })
  }

  override async getLatestVersion(): Promise<UpdateInfo> {
    const url = new URL('https://api.github.com/repos/' + repository + '/releases/latest')
    const raw = await this.httpRequest(url, { Accept: 'application/vnd.github+json', 'User-Agent': 'DSHU-Desktop-Updater' })
    return installerUpdateInfo(JSON.parse(raw ?? 'null'), this.updater.currentVersion.version, this.runtime.platform, process.arch)
  }

  override resolveFiles(info: UpdateInfo): ResolvedUpdateFileInfo[] {
    return info.files.map(file => ({ url: new URL(file.url), info: file }))
  }
}
