/** Public download layout and compatibility with the generic updater used by installed desktop apps. */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { gt, SemVer } from 'semver'
import { AppUpdater } from 'electron-updater/out/AppUpdater.js'
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js'
import { createClient } from 'electron-updater/out/providerFactory.js'
import { expect, it, onTestFinished } from 'vitest'
import { GithubInstallerProvider, installerUpdateInfo } from '../src/updates/github-release.ts'
import { stageGithubRelease } from '../scripts/stage-github-release.ts'
import { uncensoredUpdateConfig } from '../scripts/uncensored-update.mjs'

const version = '2026.11.24.0'
const name = (suffix: string): string => 'DSHU-' + version + '-' + suffix
const matrix = {
  'latest.yml': ['win-x64.exe'], 'latest-mac.yml': ['mac-arm64.zip'],
  'latest-linux.yml': ['linux-x64.deb', 'linux-x64.rpm'], 'latest-linux-arm64.yml': ['linux-arm64.deb'],
}
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'dshu-release-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const source = join(dir, 'collected'), out = join(dir, 'upload')
  await mkdir(source)
  async function save(filename: string, contents: string) {
    await writeFile(join(source, filename), contents)
    return { name: filename, bytes: Buffer.byteLength(contents), sha256: createHash('sha256').update(contents).digest('hex') }
  }
  const payloads = [...Object.values(matrix).flat(), 'mac-arm64.dmg']
  const receipts = await Promise.all(payloads.map(suffix => save(name(suffix), suffix)))
  const indexes = await Promise.all(Object.entries(matrix).map(async ([index, suffixes]) => {
    const files = suffixes.map(suffix => ({ url: name(suffix), sha512: createHash('sha512').update(suffix).digest('base64'), size: suffix.length }))
    return save(index, yaml.dump({ version: '2026.1124.0', files, path: files[0]!.url, sha512: files[0]!.sha512 }))
  }))
  const manifest = { schemaVersion: 1, kind: 'release-manifest', version, artifacts: receipts.filter(it => !it.name.endsWith('.zip')),
    auxiliary: receipts.filter(it => it.name.endsWith('.zip')), feeds: indexes }
  const writeManifest = () => writeFile(join(source, 'RELEASE-MANIFEST.json'), JSON.stringify(manifest))
  await writeManifest()
  await save('stale-test-build.exe', 'local only')
  return { source, out, manifest, writeManifest, save }
}

it('stages five installers from a collection without update metadata', async () => {
  const { source, out, manifest } = await fixture()
  await writeFile(join(source, 'RELEASE-MANIFEST.json'), JSON.stringify({ ...manifest, feeds: undefined, auxiliary: undefined }))
  await stageGithubRelease(source, out)
  const entries = (await readFile(join(out, 'upload-files.txt'), 'utf8')).trim().split('\n')
  expect(entries).toHaveLength(5)
  expect(entries.every(entry => entry.startsWith('installers/'))).toBe(true)
  expect(await readdir(out)).not.toContain('updates')
})

it('reads the latest release metadata and verifies each platform installer from the five-asset upload', async () => {
  const { source, out, manifest } = await fixture()
  await stageGithubRelease(source, out)
  const base = 'https://github.com/Water-Run/deepseek-harness-uncensored/releases/download/v' + version + '/'
  const assets = manifest.artifacts.map(file => ({
    name: file.name, size: file.bytes, state: 'uploaded', digest: 'sha256:' + file.sha256, browser_download_url: base + file.name,
  }))
  const release = { tag_name: 'v' + version, published_at: '2026-11-24T00:00:00Z', draft: false, prerelease: false,
    body: await readFile(join(out, 'release-notes.md'), 'utf8'), assets }
  for (const [platform, arch, expected] of [
    ['win32', 'x64', ['win-x64.exe']], ['darwin', 'arm64', ['mac-arm64.dmg']],
    ['linux', 'x64', ['linux-x64.deb', 'linux-x64.rpm']], ['linux', 'arm64', ['linux-arm64.deb']],
  ] as const) {
    const info = installerUpdateInfo(release, '2026.1123.0', platform, arch)
    expect(info.files.map(file => file.url)).toEqual(expected.map(suffix => base + name(suffix)))
    for (const file of info.files) {
      const bytes = await readFile(join(out, 'installers', file.url.slice(base.length)))
      expect(createHash('sha512').update(bytes).digest('base64')).toBe(file.sha512)
      expect(bytes.length).toBe(file.size)
    }
  }
  const requested: string[] = []
  const executor: ElectronHttpExecutor = Object.assign(Object.create(ElectronHttpExecutor.prototype), {
    request(options: { hostname: string; path: string }) {
      requested.push(options.hostname + options.path)
      return Promise.resolve(JSON.stringify(release))
    },
  })
  const updater: AppUpdater = Object.assign(Object.create(AppUpdater.prototype), { currentVersion: new SemVer('2026.1123.0') })
  const platform = process.arch === 'arm64' ? 'darwin' : 'win32'
  const client = createClient({ provider: 'custom', updateProvider: GithubInstallerProvider }, updater,
    { isUseMultipleRangeRequest: true, executor, platform })
  const resolved = client.resolveFiles(await client.getLatestVersion())
  expect(requested).toEqual(['api.github.com/repos/Water-Run/deepseek-harness-uncensored/releases/latest'])
  expect(resolved[0]?.url.href).toBe(base + name(platform === 'darwin' ? 'mac-arm64.dmg' : 'win-x64.exe'))
  expect(client.isUseMultipleRangeRequest).toBe(false)
  const check = (change: object) => installerUpdateInfo({ ...release, ...change }, '2026.1123.0', 'win32', 'x64')
  const installer = assets.find(asset => asset.name.endsWith('.exe'))!
  for (const change of [{ body: null }, { body: release.body + release.body }, { prerelease: true }, { draft: true },
    { tag_name: 'v2026.11.24.1' }, { assets: [] }, { assets: [installer, installer] },
    { assets: [{ ...installer, browser_download_url: 'https://example.invalid/update.exe' }] },
    { assets: [{ ...installer, size: installer.size + 1 }] }, { assets: [{ ...installer, digest: null }] },
    { assets: [{ ...installer, state: 'starter' }] }]) expect(() => check(change)).toThrow()
  for (const current of ['2026.1124.0', '2026.1125.0']) {
    expect(installerUpdateInfo({ ...release, body: null }, current, 'win32', 'x64').files).toEqual([])
  }
  expect(() => installerUpdateInfo(release, '2026.1123.0', 'darwin', 'x64')).toThrow('unsupported installer')
})

it('stages ten bridge assets and explains the previous channel setting', async () => {
  const { source, out } = await fixture()
  await stageGithubRelease(source, out, true)
  expect(await readdir(join(out, 'installers'))).toHaveLength(5)
  const uploads = (await readFile(join(out, 'upload-files.txt'), 'utf8')).trim().split('\n')
  expect(uploads).toHaveLength(10)
  for (const entry of uploads) expect(await readFile(join(out, entry.split('#')[0]!))).not.toHaveLength(0)
  expect(uploads.join('\n')).not.toContain('stale')
  const notes = await readFile(join(out, 'release-notes.md'), 'utf8')
  expect(notes.match(/\/releases\/download\//gu)).toHaveLength(5)
  expect(notes).not.toMatch(/\.zip|\.yml/u)
  expect(notes).toContain('切回「正式版」')
  expect(uploads.join('\n')).not.toContain('nightly')
  await expect(stageGithubRelease(source, out, true)).rejects.toThrow('new output directory')
})

it.each(['extra payload', 'wrong bytes', 'wrong feed hash', 'wrong version', 'missing RPM', 'foreign URL', 'wrong legacy path'])(
  'withholds the upload directory on %s', async (problem) => {
    const { source, out, manifest, writeManifest, save } = await fixture()
    if (problem === 'extra payload') manifest.auxiliary.push(await save('debug.zip', 'debug'))
    else if (problem === 'wrong bytes') await writeFile(join(source, name('win-x64.exe')), 'bad-x64.exe')
    else {
      const index = 'latest-linux.yml'
      const body = await readFile(join(source, index), 'utf8')
      const feed = yaml.load(body) as { version: string; path: string; files: { url: string; sha512: string }[] }
      if (problem === 'wrong feed hash') feed.files[1]!.sha512 = 'mismatch'
      if (problem === 'wrong version') feed.version = '2026.1123.0'
      if (problem === 'missing RPM') feed.files.pop()
      if (problem === 'foreign URL') feed.files[1]!.url = 'https://example.invalid/file.rpm'
      if (problem === 'wrong legacy path') feed.path = '../file.deb'
      manifest.feeds[manifest.feeds.findIndex(it => it.name === index)] = await save(index, yaml.dump(feed))
    }
    await writeManifest()
    await expect(stageGithubRelease(source, out, true)).rejects.toThrow()
    await expect(readdir(out)).rejects.toMatchObject({ code: 'ENOENT' })
  },
)

it('resolves the bridge after an old installation selects the public channel', async () => {
  const { source, out } = await fixture()
  await stageGithubRelease(source, out, true)
  const require = createRequire(process.env.DSH_RELEASED_DESKTOP_MANIFEST ?? import.meta.url)
  const { GenericProvider }: typeof import('electron-updater/out/providers/GenericProvider.js') = require('electron-updater/out/providers/GenericProvider.js')
  const { findFile }: typeof import('electron-updater/out/providers/Provider.js') = require('electron-updater/out/providers/Provider.js')
  const paths = new Map<string, string>()
  for (const folder of ['installers', 'updates']) {
    for (const filename of await readdir(join(out, folder))) paths.set('/releases/latest/download/' + filename, join(out, folder, filename))
  }
  const server = createServer((request, response) => {
    const file = paths.get(request.url ?? '')
    if (file === undefined) { response.writeHead(404).end(); return }
    void readFile(file).then((bytes) => { response.end(bytes) }, () => { response.writeHead(500).end() })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const previous = process.env.TEST_UPDATER_ARCH
  try {
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Missing release fixture port')
    const readAsset = async (url: URL) => {
      expect(url.origin).toBe('https://github.com')
      const path = url.pathname.slice('/Water-Run/deepseek-harness-uncensored'.length)
      const response = await fetch(new URL(path, 'http://127.0.0.1:' + address.port))
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return response
    }
    for (const [platform, arch, extension] of [
      ['win32', 'x64', 'exe'], ['darwin', 'arm64', 'zip'], ['linux', 'x64', 'deb'], ['linux', 'x64', 'rpm'], ['linux', 'arm64', 'deb'],
    ] as const) {
      process.env.TEST_UPDATER_ARCH = arch
      const { channel: packagedChannel, publicUrl: base } = uncensoredUpdateConfig(platform, arch)
      expect(packagedChannel).toBe('latest')
      expect(base).toBe('https://github.com/Water-Run/deepseek-harness-uncensored/releases/latest/download/')
      for (const channel of ['nightly', 'latest']) {
        // Keep the release provider's URL selection and exercise both index and payload requests on loopback.
        const client = Object.create(GenericProvider.prototype) as InstanceType<typeof GenericProvider>
        Object.assign(client, { configuration: { channel }, updater: { channel, isAddNoCacheQuery: false },
          baseUrl: new URL(base), runtimeOptions: { platform },
          httpRequest: async (url: URL) => { expect(url.href.startsWith(base)).toBe(true); return (await readAsset(url)).text() } })
        if (channel === 'nightly') {
          await expect(client.getLatestVersion()).rejects.toThrow('404')
          continue
        }
        const update = await client.getLatestVersion()
        expect(update.version).toBe('2026.1124.0')
        expect(gt(update.version, '2026.1123.0')).toBe(true)
        const file = findFile(client.resolveFiles(update), extension)
        const suffix = (platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'linux') + '-' + arch + '.' + extension
        expect(file?.url.href).toBe(base + name(suffix))
        const bytes = Buffer.from(await (await readAsset(file!.url)).arrayBuffer())
        expect(createHash('sha512').update(bytes).digest('base64')).toBe(file?.info.sha512)
      }
    }
    for (const index of Object.keys(matrix)) paths.delete('/releases/latest/download/' + index)
    await expect(readAsset(new URL('latest.yml', uncensoredUpdateConfig('win32', 'x64').publicUrl))).rejects.toThrow('404')
  } finally {
    if (previous === undefined) delete process.env.TEST_UPDATER_ARCH
    else process.env.TEST_UPDATER_ARCH = previous
    const closed = once(server, 'close')
    server.close()
    server.closeAllConnections()
    await closed
  }
})
