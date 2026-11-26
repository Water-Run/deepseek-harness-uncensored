import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Server } from 'node:http'
import { MacUpdater } from 'electron-updater/out/MacUpdater.js'
import { NoOpLogger, type DownloadUpdateOptions } from 'electron-updater/out/AppUpdater.js'
import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js'
import { CancellationToken } from 'electron-updater/out/types.js'
import { expect, it, onTestFinished } from 'vitest'
import { DmgMacUpdater, prepareMacUpdateArchive } from '../src/updates/electron-updater/mac-dmg.ts'
import { GithubInstallerProvider } from '../src/updates/github-release.ts'

async function cachedDmg(dir: string, original: Buffer, download: (target: URL, destination: string) => Promise<string>) {
  const name = 'DSHU-2026.11.25.0-mac-arm64.dmg'
  const url = new URL(name, 'https://example.invalid/releases/')
  const sha512 = createHash('sha512').update(original).digest('base64')
  const file = { url: url.href, sha512, size: original.length }
  const info = { version: '2026.1125.0', files: [file], path: url.href, sha512, releaseDate: '2026-11-25T00:00:00Z' }
  const cache = new DownloadedUpdateHelper(join(dir, 'release'))
  const cached = join(cache.cacheDirForPendingUpdate, name)
  await mkdir(cache.cacheDirForPendingUpdate, { recursive: true })
  await writeFile(cached, original)
  await cache.setDownloadedFile(cached, null, info, { url, info: file }, name, true)
  let feed: { url: string; headers: Record<string, string> } | undefined
  const updater = Object.assign(Object.create(DmgMacUpdater.prototype) as {
    doDownloadUpdate(options: DownloadUpdateOptions): Promise<string[]>
    server?: Server
  }, {
    downloadedUpdateHelper: cache, app: { baseCachePath: dir }, configOnDisk: { value: { updaterCacheDirName: 'release' } },
    autoInstallOnAppQuit: false, _logger: new NoOpLogger(), httpExecutor: { download },
    nativeUpdater: { setFeedURL(value: NonNullable<typeof feed>) { feed = value }, removeListener() {} },
  })
  onTestFinished(async () => {
    if (!updater.server?.listening) return
    const closed = once(updater.server, 'close')
    updater.server.close()
    updater.server.closeAllConnections()
    await closed
  })
  const provider = Object.create(GithubInstallerProvider.prototype) as GithubInstallerProvider
  const retry = () => updater.doDownloadUpdate({ updateInfoAndProvider: { info, provider },
    requestHeaders: {}, cancellationToken: new CancellationToken() })
  return { cached, retry, feed: () => feed }
}

it('requests a fresh DMG when the previously downloaded image is damaged before a retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dshu-mac-retry-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const h = await cachedDmg(dir, Buffer.from('original'), () => Promise.reject(new Error('fresh transfer requested')))
  await writeFile(h.cached, 'damaged!')
  await expect(h.retry()).rejects.toThrow('fresh transfer requested')
})

it.runIf(process.platform === 'darwin')('serves a signed app from a re-downloaded image and reuses the intact DMG on retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dshu-native-dmg-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const run = promisify(execFile)
  const volume = join(dir, 'volume'), contents = join(volume, 'Notes.app', 'Contents')
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await copyFile('/usr/bin/true', join(contents, 'MacOS', 'Notes'))
  await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>org.dshu.test.notes</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>Notes</string>
<key>CFBundleVersion</key><string>1</string>
</dict></plist>`)
  await run('/usr/bin/codesign', ['--force', '--sign', '-', join(volume, 'Notes.app')])
  const dmg = join(dir, 'release.dmg')
  await run('/usr/bin/hdiutil', ['create', '-fs', 'HFS+', '-format', 'UDZO', '-srcfolder', volume, dmg])
  let transfers = 0
  const image = await readFile(dmg)
  const h = await cachedDmg(dir, image, async (_url, destination) => {
    transfers++
    await copyFile(dmg, destination)
    return destination
  })
  await writeFile(h.cached, Buffer.alloc(image.length))
  await h.retry()
  expect(transfers).toBe(1)
  await h.retry()
  expect(transfers).toBe(1)
  const feed = h.feed()
  if (!feed) throw new Error('Missing Squirrel.Mac feed')
  const entry = await (await fetch(feed.url, { headers: feed.headers })).json() as { url: string }
  const response = await fetch(entry.url)
  expect(response.status).toBe(200)
  const zip = join(dir, 'received.zip'), extracted = join(dir, 'received')
  await writeFile(zip, Buffer.from(await response.arrayBuffer()))
  await run('/usr/bin/ditto', ['-x', '-k', zip, extracted])
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', join(extracted, 'Notes.app')])
  expect(await readFile(join(extracted, 'Notes.app', 'Contents', 'MacOS', 'Notes'))).toEqual(await readFile(join(contents, 'MacOS', 'Notes')))
}, 120_000)

it.each(['ready', 'duplicate', 'signature', 'archive', 'detach'] as const)('handles the signed bundle and volume on %s', async (outcome) => {
  const dir = await mkdtemp(join(tmpdir(), 'dshu-mac-fixture-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const dmg = join(dir, 'installer.dmg')
  let mount = ''
  const calls: string[] = []
  const run = async (tool: string, args: string[]) => {
    calls.push([tool.split('/').at(-1), args[0]].join(' '))
    if (args[0] === 'attach') {
      expect(args.slice(1, 4)).toEqual(['-readonly', '-nobrowse', '-mountpoint'])
      expect(args.at(-1)).toBe(dmg)
      mount = args[4]!
      onTestFinished(() => rm(mount, { recursive: true, force: true }))
      await mkdir(join(mount, 'DSHU.app'))
      if (outcome === 'duplicate') await mkdir(join(mount, 'Other.app'))
    } else if (args[0] === 'detach') {
      expect(args[1]).toBe(mount)
      if (outcome === 'detach') throw new Error('detach failed')
      await rm(mount, { recursive: true })
    } else if (tool.endsWith('codesign')) {
      expect(args).toEqual(['--verify', '--deep', '--strict', join(mount, 'DSHU.app')])
      if (outcome === 'signature') throw new Error('signature failed')
    } else {
      expect(args.slice(0, -1)).toEqual(['-c', '-k', '--sequesterRsrc', '--keepParent', join(mount, 'DSHU.app')])
      if (outcome === 'archive') throw new Error('archive failed')
      await writeFile(args.at(-1)!, 'signed archive')
    }
  }
  if (outcome !== 'ready') {
    await expect(prepareMacUpdateArchive(dmg, run)).rejects.toThrow()
    expect(calls.at(-1)).toBe('hdiutil detach')
    await expect(readFile(join(dir, 'squirrel-update.zip'))).rejects.toMatchObject({ code: 'ENOENT' })
    if (outcome === 'signature') expect(calls.some(call => call.startsWith('ditto'))).toBe(false)
    return
  }
  const archive = await prepareMacUpdateArchive(dmg, run)
  expect(archive.size).toBe(Buffer.byteLength('signed archive'))
  expect(calls).toEqual(['hdiutil attach', 'codesign --verify', 'ditto -c', 'hdiutil detach'])

  // Exercise the pinned MacUpdater's authenticated native feed with the converted archive.
  let feed: { url: string; headers: Record<string, string> } | undefined
  type NativeFeed = { server?: Server; updateDownloaded: (...args: object[]) => Promise<string[]> }
  const library = Object.assign(Object.create(MacUpdater.prototype) as NativeFeed, {
    nativeUpdater: { setFeedURL(value: NonNullable<typeof feed>) { feed = value }, removeListener() {} },
    autoInstallOnAppQuit: false, dispatchUpdateDownloaded() {}, _logger: { info() {}, warn() {}, debug() {} },
  })
  onTestFinished(async () => {
    if (!library.server?.listening) return
    const closed = once(library.server, 'close')
    library.server.close()
    library.server.closeAllConnections()
    await closed
  })
  await library.updateDownloaded({ info: { size: archive.size }, url: new URL('https://example.invalid/installer.dmg') },
    { downloadedFile: archive.path })
  if (!feed) throw new Error('Missing Squirrel.Mac feed')
  expect((await fetch(feed.url)).status).toBe(401)
  const entry = await (await fetch(feed.url, { headers: feed.headers })).json() as { url: string }
  const response = await fetch(entry.url)
  expect(response.headers.get('content-length')).toBe(String(archive.size))
  expect(await response.text()).toBe('signed archive')
})
