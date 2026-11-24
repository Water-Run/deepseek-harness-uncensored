import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { MacUpdater } from 'electron-updater/out/MacUpdater.js'
import { expect, it, onTestFinished } from 'vitest'
import { prepareMacUpdateArchive } from '../src/updates/electron-updater/mac-dmg.ts'

it.each(['ready', 'duplicate', 'signature', 'archive', 'detach'] as const)('handles the signed bundle and volume on %s', async (outcome) => {
  const dir = await mkdtemp(join(tmpdir(), 'dshu-mac-fixture-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const dmg = join(dir, 'installer.dmg')
  let mount = ''
  const calls: string[] = []
  const run = async (tool: string, args: string[]) => {
    calls.push(tool.split('/').at(-1) + ' ' + args[0])
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
