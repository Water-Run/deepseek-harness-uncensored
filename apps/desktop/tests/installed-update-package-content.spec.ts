import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { WriteStream } from 'node:fs'
import { finished } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInstalledUpdateRun } from '../scripts/installed-update-qualification.ts'
import { prepareInstalledUpdateBootstrap } from '../scripts/prepare-installed-update-bootstrap.ts'
import { prepareInstalledUpdateApplication } from '../scripts/prepare-installed-update-application.ts'
import { verifyInstalledUpdatePackageContent } from '../scripts/installed-update-package-content.ts'
import { readDesktopRuntime, writeDesktopRuntime } from '../src/runtime-tree.ts'
import { runtimeFixture } from './runtime-fixture.ts'
import { validateInstalledUpdateArchivePaths, verifyInstalledUpdatePackage } from '../scripts/verify-installed-update-package.ts'

type ArchiveExecute = (tool: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<{
  stdout: string
  stderr: string
}>
const external = vi.hoisted(() => ({ archive: vi.fn<ArchiveExecute>(), signature: vi.fn() }))
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...actual, execFile: Object.assign(vi.fn(), { [promisify.custom]: external.archive }) }
})
vi.mock('../scripts/installed-update-signature.mjs', async original => ({
  ...await original<typeof import('../scripts/installed-update-signature.mjs')>(), verifyInstalledUpdateSignature: external.signature,
}))
vi.mock('../scripts/windows-sign.mjs', () => ({ resolveWindowsUpdatePublisher: () => 'CN=Fixture,O=Fixture,C=CN' }))
afterEach(() => { external.archive.mockReset(); external.signature.mockReset(); vi.restoreAllMocks() })

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
const { createPackageWithOptions, uncache } = builderRequire('@electron/asar') as {
  createPackageWithOptions: (source: string, destination: string, options: { unpack: string }) => Promise<WriteStream>
  uncache: (archive: string) => boolean
}
const versions = ['0.1.6-nightly.20260914.1', '0.1.6-nightly.20260914.2'] as const
const publisher = 'CN=Fixture,O=Fixture,C=CN'

async function fixture(body: (context: {
  manifest: string
  payload: string
  source: string
  version: string
  seal: () => Promise<void>
  resealRuntime: () => Promise<void>
}) => Promise<void>, version: string = versions[0]): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-package-content-'))
  const archive = join(root, 'payload/resources/app.asar')
  try {
    const run = await createInstalledUpdateRun(root, versions, { version: '0.1.5-rc.2', commit: 'a'.repeat(40), dirtyFiles: [] })
    const manifest = join(run.root, 'run.json')
    await prepareInstalledUpdateBootstrap(manifest)
    const source = join(root, 'source')
    await mkdir(join(source, 'lib'), { recursive: true })
    await mkdir(join(source, 'lib/welcome'), { recursive: true })
    await writeFile(join(source, 'lib/welcome/design-platform.css'), 'body { --fixture-token: white; }\n')
    await mkdir(join(source, 'renderer'))
    for (const name of ['main.js', 'preload-app.cjs', 'preload-mandatory.cjs', 'preload-update-dialog.cjs']) {
      await writeFile(join(source, 'lib', name), '// inert fixture\n')
    }
    await writeFile(join(source, 'renderer/index.html'), '<p>test</p>')
    await prepareInstalledUpdateApplication(manifest, source)
    await cp(join(run.root, 'application/files'), source, { recursive: true })
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: `dsh-update-test-${run.id}`, version,
      dshDesktopAppId: run.appId, main: 'qualification-bootstrap.mjs', type: 'module', dshDesktopUpdateChannel: 'nightly',
      dshMandatoryUpdatePolicy: { origin: 'https://policy.example.com', allowedPageOrigins: ['https://policy.example.com'],
        authentication: 'feishu-test', allowedAuthOrigins: ['https://login.example.com'] } }))
    for (const name of ['electron-updater', 'semver']) {
      await mkdir(join(source, 'node_modules', name), { recursive: true })
      await cp(require.resolve(`${name}/package.json`), join(source, 'node_modules', name, 'package.json'))
    }
    const dsh = join(run.root, version, 'dsh')
    const descriptor = runtimeFixture(dsh, version)
    await writeFile(join(dsh, 'tool.exe'), 'inert executable fixture')
    const reseal = (directory: string): void => {
      writeDesktopRuntime(directory, descriptor.release, descriptor.sharedPackages.map(entry => entry.name), { platform: 'win32', arch: 'x64' })
    }
    reseal(dsh)
    await cp(dsh, join(source, 'dsh'), { recursive: true })
    const payload = join(root, 'payload')
    await mkdir(join(payload, 'resources'), { recursive: true })
    await writeFile(join(payload, 'resources/app-update.yml'), JSON.stringify({ provider: 'generic', channel: 'nightly',
      url: run.feedBaseUrl, publisherName: [publisher],
      updaterCacheDirName: `dsh-update-test-${run.id}-updater` }))
    const seal = async () => {
      // ASAR 3 returns the output stream after end(), before its writes finish.
      const output = await createPackageWithOptions(source, archive, { unpack: '**/*.exe' })
      await finished(output, { cleanup: true })
      uncache(archive)
    }
    await seal()
    await body({ manifest, source, payload, version, seal, resealRuntime: async () => {
      reseal(join(source, 'dsh'))
      await seal()
    } })
  } finally {
    uncache(archive)
    await rm(root, { recursive: true, force: true })
  }
}

describe('installed update archive contents', () => {
  it.each(versions)('reads real ASAR and runtime inventories for %s without claiming installation', async (version) => {
    await fixture(async ({ manifest, payload }) => {
      expect(await verifyInstalledUpdatePackageContent(manifest, version, payload, publisher)).toMatchObject({
        version, applicationFiles: 8, dependenciesFrozen: false, installed: false,
        resignedExecutables: [join(payload, 'resources/app.asar.unpacked/dsh/tool.exe')],
      })
    }, version)
  })

  it.each(['name', 'version', 'dshDesktopAppId', 'main', 'type', 'dshDesktopUpdateChannel', 'dshMandatoryUpdatePolicy'])(
    'rejects mismatched packaged %s', async (field) => {
      await fixture(async ({ manifest, source, payload, version, seal }) => {
        const path = join(source, 'package.json')
        const data = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
        data[field] = 'wrong'
        await writeFile(path, JSON.stringify(data))
        await seal()
        await expect(verifyInstalledUpdatePackageContent(manifest, version, payload, publisher))
          .rejects.toThrow(field === 'dshMandatoryUpdatePolicy' ? 'desktop policy' : 'identity')
      })
    })

  it.each(['changed', 'missing', 'additional', 'credential-file'])(
    'rejects %s application content from the archive', async (failure) => {
      await fixture(async ({ manifest, source, payload, version, seal }) => {
        if (failure === 'missing') await rm(join(source, 'lib/main.js'))
        else await writeFile(join(source, failure === 'changed' ? 'lib/main.js'
          : failure === 'additional' ? 'renderer/unrecorded.js' : '.env.windows'), 'inert unexpected bytes')
        await seal()
        await expect(verifyInstalledUpdatePackageContent(manifest, version, payload, publisher)).rejects.toThrow()
      })
    })

  it.each(['url', 'channel', 'provider', 'updaterCacheDirName', 'publisherName'])(
    'rejects mismatched packaged update %s', async (field) => {
      await fixture(async ({ manifest, payload, version }) => {
        const path = join(payload, 'resources/app-update.yml')
        const data = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
        data[field] = field === 'publisherName' ? [publisher, 'CN=Other'] : 'wrong'
        await writeFile(path, JSON.stringify(data))
        await expect(verifyInstalledUpdatePackageContent(manifest, version, payload, publisher)).rejects.toThrow('packaged feed')
      })
    })

  it('rejects an updater package whose version differs from the verifier', async () => {
    await fixture(async ({ manifest, source, payload, version, seal }) => {
      await writeFile(join(source, 'node_modules/electron-updater/package.json'), '{"name":"electron-updater","version":"0.0.0"}')
      await seal()
      await expect(verifyInstalledUpdatePackageContent(manifest, version, payload, publisher)).rejects.toThrow('updater dependency')
    })
  })

  it('accepts only the builder transformation of runtime dependency manifests', async () => {
    await fixture(async ({ manifest, source, payload, version, seal }) => {
      const preparedRoot = join(dirname(manifest), version, 'dsh')
      const packagePath = 'node_modules/@deepseek-ai/dsh/package.json'
      const preparedPath = join(preparedRoot, packagePath)
      const data = JSON.parse(await readFile(preparedPath, 'utf8')) as Record<string, unknown>
      data.scripts = { test: 'inert' }
      data.bugs = { url: 'https://example.com/issues' }
      await writeFile(preparedPath, JSON.stringify(data))
      const descriptor = readDesktopRuntime(preparedRoot)
      writeDesktopRuntime(preparedRoot, descriptor.release, descriptor.sharedPackages.map(entry => entry.name),
        { platform: 'win32', arch: 'x64' })
      await cp(join(preparedRoot, 'desktop-runtime.json'), join(source, 'dsh/desktop-runtime.json'))
      const packagedPath = join(source, 'dsh', packagePath)
      const packaged = { ...data }
      delete packaged.scripts
      delete packaged.bugs
      await writeFile(packagedPath, JSON.stringify(packaged, null, 2))
      await seal()
      await expect(verifyInstalledUpdatePackageContent(manifest, version, payload, publisher)).resolves.toMatchObject({ version })
      packaged.version = '0.0.0'
      await writeFile(packagedPath, JSON.stringify(packaged, null, 2))
      await seal()
      await expect(verifyInstalledUpdatePackageContent(manifest, version, payload, publisher)).rejects.toThrow('runtime bytes differ')
    })
  })

  it.each(['unsealed', 'resealed-change', 'resealed-addition'])(
    'rejects %s runtime content even when metadata is regenerated', async (failure) => {
      await fixture(async ({ manifest, source, payload, version, seal, resealRuntime }) => {
        await writeFile(join(source, 'dsh', failure === 'resealed-addition' ? 'extra.js' : 'package.json'), '{}')
        if (failure !== 'unsealed') await resealRuntime()
        else await seal()
        await expect(verifyInstalledUpdatePackageContent(manifest, version, payload, publisher)).rejects.toThrow()
      })
    })

  it('identifies changed executable resources for separate signature verification', async () => {
    await fixture(async ({ manifest, source, payload, version, resealRuntime }) => {
      const executable = join(payload, 'resources/app.asar.unpacked/dsh/tool.exe')
      await writeFile(join(source, 'dsh/tool.exe'), 'inert changed executable, not a signature')
      await resealRuntime()
      expect((await verifyInstalledUpdatePackageContent(manifest, version, payload, publisher)).resignedExecutables).toEqual([executable])
    })
  })
})

describe('installed update verification records', () => {
  it('accepts relative Windows archive entries', () => {
    expect(validateInstalledUpdateArchivePaths('Path = resources\r\nFolder = +\r\n\r\nPath = resources\\app.asar\r\nFolder = -\r\n'))
      .toEqual(['resources', 'resources/app.asar'])
  })

  it.each(['../escape', '/absolute', 'C:\\absolute', 'file:stream', 'a//b', 'a/./b', 'a/../b', 'CON', 'NUL.txt',
    'name.', 'name ', 'a\\..\\b', 'a\u0000b', 'a?b'])(
    'rejects unsafe extraction path %j', (path) => {
      expect(() => validateInstalledUpdateArchivePaths(`Path = ${path}\n`)).toThrow('unsafe path')
    })

  it.each(['', 'Path = a\nPath = A\n', 'Path = a\nSymbolic Link = ../outside\n', 'Path = a\nHard Link = b\n'])(
    'rejects missing, duplicate, or link entries %j', (listing) => {
      expect(() => validateInstalledUpdateArchivePaths(listing)).toThrow()
    })

  it.each(['success', 'signature', 'outer-unsafe', 'winshell', 'missing-notice', 'changed-notice', 'changed-stdutils', 'changed-uac',
    'unsafe-path', 'extraction', 'content', 'changed-input'])(
    'retains %s evidence and stops later stages after failure', async (failure) => {
      await fixture(async ({ manifest, payload, version }) => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const root = join(manifest, '..')
        const output = join(root, version, 'installer')
        await mkdir(output)
        const name = `dshu-qualification-${version}-win-x64.exe`
        const bytes = Buffer.from('inert installer fixture, never executed')
        const installer = join(output, name)
        await writeFile(installer, bytes)
        const staged = join(output, '.nsis-directory-installer')
        await mkdir(staged)
        const notices = [
          ['nsis-installer-COPYING.txt', 'nsis-installer-COPYING.txt'],
          ['7zip-installer-LICENSE.txt', 'LICENSE.txt'],
          ['7zip-installer-COPYING.txt', 'COPYING'],
          ['UAC-0.2.4c-LICENSE.txt', 'UAC-0.2.4c-LICENSE.txt'],
        ] as const
        for (const [notice, source] of notices) await writeFile(join(staged, source), notice)
        const stdUtilsArchive = 'StdUtils-1.14-sources.tbz2'
        await writeFile(join(staged, stdUtilsArchive), 'pinned source archive')
        await writeFile(join(staged, 'StdUtils.dll'), 'pinned binary')
        await writeFile(join(staged, 'UAC.dll'), 'pinned UAC binary')
        await buildBlockMap(installer, 'gzip', join(output, `${name}.blockmap`))
        await writeFile(join(output, 'nightly.yml'), JSON.stringify({ version,
          files: [{ url: name, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') }] }))
        const certificate = join(root, 'public.cer')
        const tool = join(root, 'reviewed-archive.exe')
        await writeFile(certificate, 'inert public certificate, parser substituted')
        await writeFile(tool, 'inert archive tool, process substituted')
        external.signature.mockResolvedValue({ valid: true, timestamped: true })
        if (failure === 'signature') external.signature.mockRejectedValueOnce(new Error('fixture signature failure'))
        external.archive.mockImplementation(async (command, args, options) => {
          expect(command).toBe(tool)
          expect(Object.keys(options.env).some(key => /KEY|SECRET|TOKEN|PASSWORD/iu.test(key))).toBe(false)
          const inner = join(options.cwd, 'nsis', '$PLUGINSDIR', 'app-64.7z')
          if (args.includes('-tNsis')) {
            expect(args[args.indexOf('--') + 1]).toBe(installer)
            const entries = ['$PLUGINSDIR\\app-64.7z', ...notices.map(([notice]) => notice),
              '$PLUGINSDIR\\StdUtils.dll', stdUtilsArchive, '$PLUGINSDIR\\UAC.dll']
            if (args[0] === 'l') {
              if (failure === 'missing-notice') entries.splice(entries.indexOf('UAC-0.2.4c-LICENSE.txt'), 1)
              if (failure === 'outer-unsafe') entries.push('../outside')
              if (failure === 'winshell') entries.push('$PLUGINSDIR\\WinShell.dll')
              return { stdout: entries.map(path => `Path = ${path}\n`).join(''), stderr: '' }
            }
            const target = args.find(arg => arg.startsWith('-o'))!.slice(2)
            expect(target).toBe(join(options.cwd, 'nsis'))
            expect(args.slice(args.indexOf('--') + 2)).toEqual(entries)
            await mkdir(join(target, '$PLUGINSDIR'))
            await writeFile(inner, 'inert inner archive')
            for (const [notice] of notices) await writeFile(join(target, notice), failure === 'changed-notice' ? 'changed' : notice)
            await writeFile(join(target, '$PLUGINSDIR', 'StdUtils.dll'), failure === 'changed-stdutils' ? 'changed' : 'pinned binary')
            await writeFile(join(target, '$PLUGINSDIR', 'UAC.dll'), failure === 'changed-uac' ? 'changed' : 'pinned UAC binary')
            await writeFile(join(target, stdUtilsArchive), 'pinned source archive')
            return { stdout: '', stderr: '' }
          }
          expect(args).toContain('-t7z')
          expect(args.at(-1)).toBe(inner)
          if (args[0] === 'l') return { stdout: `Path = ${failure === 'unsafe-path' ? '../outside' : 'resources/app.asar'}\n`, stderr: '' }
          if (failure === 'extraction') throw new Error('fixture extraction failure')
          const target = args.find(arg => arg.startsWith('-o'))!.slice(2)
          expect(target).toBe(join(options.cwd, 'payload'))
          await cp(payload, target, { recursive: true })
          if (failure === 'content') await writeFile(join(target, 'resources/app-update.yml'), '{}')
          if (failure === 'changed-input') await writeFile(installer, 'modified installer')
          return { stdout: '', stderr: '' }
        })
        const operation = verifyInstalledUpdatePackage(manifest, version, certificate, tool)
        if (failure === 'success') await expect(operation).resolves.toMatch(/result\.json$/u)
        else await expect(operation).rejects.toThrow()
        const { readdir } = await import('node:fs/promises')
        const checks = await readdir(join(root, version, 'verification'))
        expect(checks).toHaveLength(1)
        const record = join(root, version, 'verification', checks[0]!)
        const result = JSON.parse(await readFile(join(record, 'result.json'), 'utf8')) as Record<string, unknown>
        expect(result).toMatchObject({ version, passed: failure === 'success', installerExecuted: false, published: false,
          manualChecks: ['installer-registration', 'startup', 'upgrade', 'data-retention'] })
        const stage = { success: 'complete', signature: 'installer-signature', 'outer-unsafe': 'outer-archive-paths', winshell: 'outer-archive-paths',
          'missing-notice': 'outer-archive-paths', 'changed-notice': 'installer-notices',
          'changed-stdutils': 'installer-notices', 'changed-uac': 'installer-notices', 'unsafe-path': 'archive-paths',
          extraction: 'extraction', content: 'payload-content', 'changed-input': 'unchanged-inputs' }[failure]
        expect(result.stage).toBe(stage)
        const archiveCalls: Record<string, number> = { signature: 0, 'outer-unsafe': 1, winshell: 1, 'missing-notice': 1,
          'changed-notice': 2, 'changed-stdutils': 2, 'changed-uac': 2, 'unsafe-path': 3 }
        expect(external.archive).toHaveBeenCalledTimes(archiveCalls[failure] ?? 4)
        if (failure === 'success') {
          expect(result.outerArchiveEntries).toBe(8)
          expect(result.archiveEntries).toBe(1)
          expect(result.installerNotices).toEqual(notices.map(([notice]) => ({
            name: notice, bytes: Buffer.byteLength(notice), sha256: createHash('sha256').update(notice).digest('hex'),
          })))
          expect(result.stdUtils).toMatchObject({
            version: '1.14',
            source: { name: stdUtilsArchive, sha256: createHash('sha256').update('pinned source archive').digest('hex') },
            binary: { name: '$PLUGINSDIR/StdUtils.dll', sha256: createHash('sha256').update('pinned binary').digest('hex') },
          })
          expect(result.uac).toMatchObject({
            version: '0.2.4c',
            binary: { name: '$PLUGINSDIR/UAC.dll', sha256: createHash('sha256').update('pinned UAC binary').digest('hex') },
          })
        }
        expect(external.signature).toHaveBeenCalledTimes(['success', 'changed-input'].includes(failure) ? 3 : 1)
        expect(await readFile(join(record, 'events.jsonl'), 'utf8')).toContain(`"stage":"${stage}"`)
      })
    })
})
