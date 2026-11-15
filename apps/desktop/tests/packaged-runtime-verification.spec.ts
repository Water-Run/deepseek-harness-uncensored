import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { verifyElectronNotices } from '../scripts/verify-runtime-archive.ts'
import { runtimeFixture } from './runtime-fixture.ts'
import { verifyDesktopRuntime as verifyRuntimeFiles, writeDesktopRuntime } from '../src/runtime-tree.ts'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { inc } from 'semver'

const { verifyDesktopRuntime } = vi.hoisted(() => ({
  verifyDesktopRuntime: vi.fn<(root: string, expected: string) => Promise<void>>(async () => undefined),
}))
// The hook imports the built tree, which a clean checkout has not produced; this is the path it resolves.
vi.mock('/apps/desktop/lib/types/runtime-tree.js', () => ({ verifyDesktopRuntime }))
vi.mock('../scripts/windows-asar-unpack.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/windows-asar-unpack.mjs')>(),
  verifyWindowsAsarUnpack: async () => undefined,
}))

const ENVIRONMENT = {
  DSH_DESKTOP_APP_ID: 'com.example.installer',
  DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
  DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
  DSH_DESKTOP_TARGET_PLATFORM: 'win32',
  DSH_DESKTOP_TARGET_ARCH: 'x64',
  DSH_DESKTOP_UNSIGNED: '1',
  DOWNLOAD_TEST_ORIGIN: 'https://desktop-updates.example.com',
  DOWNLOAD_TEST_RELEASE_ID: '0123456789abcdef0123456789abcdef',
}

const CONTEXT = { appOutDir: 'out', packager: { getResourcesDir: () => 'out/resources' } }

/**
 * Run the packaging hook that verifies the bundled runtime.
 * @returns The version that hook required the runtime to declare.
 */
async function requiredRuntimeVersion(preparedRuntime?: string, preparedRuntimeVersion?: string): Promise<unknown> {
  verifyDesktopRuntime.mockClear()
  const config = createElectronBuilderConfig(ENVIRONMENT, 'win32', 'x64', preparedRuntime, preparedRuntimeVersion)
  await config.afterPack(CONTEXT as never)
  return verifyDesktopRuntime.mock.calls[0]?.[1]
}

describe('packaged runtime verification', () => {
  it('requires the product version when the target tree supplies the runtime', async () => {
    const productVersion = (JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string }).version
    expect(await requiredRuntimeVersion()).toBe(productVersion)
  })

  it('requires the version installed-update qualification wrote into its private runtime', async () => {
    // Qualification rewrites the runtime's own version, so comparing against the product version would always fail.
    expect(await requiredRuntimeVersion('/qualification/dsh', '0.1.6-alpha.2.20260921.1')).toBe('0.1.6-alpha.2.20260921.1')
  })

  it('requires the runtime and application to carry the same selected build version', async () => {
    const productVersion = (JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string }).version
    const buildVersion = inc(productVersion, 'patch')!
    verifyDesktopRuntime.mockClear()
    const config = createElectronBuilderConfig({ ...ENVIRONMENT, DSH_DESKTOP_BUILD_VERSION: buildVersion }, 'win32', 'x64')
    expect(config.extraMetadata).toMatchObject({ version: buildVersion })
    await config.afterPack(CONTEXT as never)
    expect(verifyDesktopRuntime.mock.calls[0]?.[1]).toBe(buildVersion)
  })

  it('rejects a base-version runtime when packaging a newer build', async () => {
    const root = await mkdtemp(join(tmpdir(), 'stale-desktop-runtime-'))
    onTestFinished(() => rm(root, { recursive: true, force: true }))
    const productVersion = (JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version
    const fixture = runtimeFixture(root, productVersion)
    writeDesktopRuntime(root, fixture.release, fixture.sharedPackages.map(item => item.name), { platform: 'win32', arch: 'x64' })
    verifyDesktopRuntime.mockImplementationOnce(async (path, version) => { await verifyRuntimeFiles(path, version, { platform: 'win32', arch: 'x64' }) })
    const config = createElectronBuilderConfig({ ...ENVIRONMENT, DSH_DESKTOP_BUILD_VERSION: inc(productVersion, 'patch')! }, 'win32', 'x64', root)
    await expect(config.afterPack(CONTEXT as never)).rejects.toThrow('is not the expected')
  })
})

it('requires both nonempty Electron notices to match the prepared distribution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-electron-notices-'))
  onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const distribution = join(root, 'distribution')
  const application = join(root, 'application')
  await Promise.all([mkdir(distribution), mkdir(application)])
  const electron = 'Electron license text\n'
  const chromium = '<html>Chromium notice text</html>\n'
  const packagedElectron = join(application, 'LICENSE.electron.txt')
  const packagedChromium = join(application, 'LICENSES.chromium.html')
  await Promise.all([
    writeFile(join(distribution, 'LICENSE'), electron),
    writeFile(join(distribution, 'LICENSES.chromium.html'), chromium),
    writeFile(packagedElectron, electron),
    writeFile(packagedChromium, chromium),
  ])
  await expect(verifyElectronNotices(distribution, application)).resolves.toBeUndefined()
  await writeFile(packagedChromium, 'changed')
  await expect(verifyElectronNotices(distribution, application)).rejects.toThrow('LICENSES.chromium.html')
  await unlink(packagedElectron)
  await expect(verifyElectronNotices(distribution, application)).rejects.toMatchObject({ code: 'ENOENT' })
  await Promise.all([writeFile(packagedElectron, ''), writeFile(join(distribution, 'LICENSE'), '')])
  await expect(verifyElectronNotices(distribution, application)).rejects.toThrow('LICENSE.electron.txt')
})
