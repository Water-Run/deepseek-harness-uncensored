/** Prepare a release DMG for the signed Squirrel.Mac installation path. */
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rename, rm, rmdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { MacUpdater } from 'electron-updater/out/MacUpdater.js'
import type { DownloadUpdateOptions } from 'electron-updater/out/AppUpdater.js'
import type { ResolvedUpdateFileInfo, UpdateDownloadedEvent } from 'electron-updater'
import type { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js'
import { GithubInstallerProvider } from '../github-release.ts'

const run = promisify(execFile)

/**
 * Convert the single signed app in a read-only DMG into the archive consumed by the native updater.
 * @param dmg - Downloaded installer whose digest matched the published release.
 * @param execute - Apple system tools, replaceable for filesystem and failure-path tests.
 * @returns The prepared archive in the updater's private pending directory and its byte length.
 */
export async function prepareMacUpdateArchive(dmg: string, execute: (program: string, args: string[]) => Promise<unknown> = run):
Promise<{ path: string; size: number }> {
  const mount = await mkdtemp(join(tmpdir(), 'dshu-update-volume-'))
  const work = await mkdtemp(join(dirname(dmg), 'dshu-update-')).catch(async (error) => { await rmdir(mount); throw error })
  const temporary = join(work, 'update.zip'), path = join(dirname(dmg), 'squirrel-update.zip')
  try {
    await execute('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg])
    try {
      const apps = (await readdir(mount, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.endsWith('.app'))
      const app = apps[0]
      if (apps.length !== 1 || !app) throw new Error('desktop update: expected one application in the release DMG')
      const bundle = join(mount, app.name)
      await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
      await execute('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundle, temporary])
    } finally { await execute('/usr/bin/hdiutil', ['detach', mount]) }
    const { size } = await stat(temporary)
    if (size <= 0) throw new Error('desktop update: macOS application archive is empty')
    await rename(temporary, path)
    return { path, size }
  } finally {
    await rm(work, { recursive: true, force: true })
    // Never recursively remove a volume if detaching it failed.
    await rmdir(mount).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT' && error.code !== 'EBUSY' && error.code !== 'ENOTEMPTY') throw error
    })
  }
}

/** Use the pinned updater's download cache, native signature checks and restart handshake for a DMG-only release. */
export class DmgMacUpdater extends MacUpdater {
  protected override async doDownloadUpdate(options: DownloadUpdateOptions): Promise<string[]> {
    const { info, provider } = options.updateInfoAndProvider
    if (!(provider instanceof GithubInstallerProvider)) return super.doDownloadUpdate(options)
    const [file] = provider.resolveFiles(info)
    if (!file?.url.pathname.endsWith('.dmg')) throw new Error('desktop update: macOS release has no DMG')
    // electron-updater 6.x owns the authenticated loopback server and its native update state.
    const native = this as object as {
      httpExecutor: ElectronHttpExecutor
      updateDownloaded(file: ResolvedUpdateFileInfo, event: UpdateDownloadedEvent): Promise<string[]>
    }
    return this.executeDownload({
      fileExtension: 'dmg', fileInfo: file, downloadUpdateOptions: options,
      task: (destination, downloadOptions) => native.httpExecutor.download(file.url, destination, downloadOptions),
      done: async (event) => {
        const archive = await prepareMacUpdateArchive(event.downloadedFile)
        if (options.cancellationToken.cancelled) throw new Error('desktop update: macOS update was cancelled')
        // Squirrel consumes the local ZIP and verifies the replacement against the installed app's signature.
        await native.updateDownloaded({ ...file, info: { ...file.info, size: archive.size } }, { ...event, downloadedFile: archive.path })
      },
    })
  }
}
