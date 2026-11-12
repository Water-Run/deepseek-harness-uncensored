/** The installed CLI uses the shared pnpm distribution with Electron's package-operation environment. */

import { delimiter, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'
import { runDesktopCli } from '../../desktop-host/src/cli.ts'
import { runtimeArchivePath } from '../../desktop-host/src/runtime-archive.ts'
import { stagehandExtensionEnvironment } from '../../desktop-host/src/browser-extension.ts'

vi.mock('@deepseek-ai/dsh/lib/bin.js', () => ({ runCli: vi.fn() }))
vi.mock('../../desktop-host/src/browser-extension.ts', () => ({
  stagehandExtensionEnvironment: vi.fn(() => ({ STAGEHAND_EXTENSION_DIRECTORY_PATH: '/bundled-extension' })),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

it.each(['system-bin', undefined])('dispatches with bundled pnpm when PATH is %s', async (path) => {
  vi.stubEnv('PATH', path)
  vi.stubEnv('STAGEHAND_EXTENSION_DIRECTORY_PATH', undefined)
  vi.stubEnv('DSH_PRIMARY_RUNTIME', '/inherited-runtime')
  vi.stubEnv('DSH_REA_NODE_PATH', '/inherited-node')
  const runtime = join('Application 中文 with spaces', 'resources', 'app.asar', 'dsh')
  const support = join('Application 中文 with spaces', 'resources', 'runtime')
  const primaryRuntime = join(support, 'primary-runtime')
  vi.mocked(runCli).mockImplementationOnce(async () => {
    expect(process.env.DSH_PRIMARY_RUNTIME).toBe(primaryRuntime)
    expect(process.env.DSH_REA_NODE_PATH).toBe(join(primaryRuntime, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node'))
    expect(process.env.STAGEHAND_EXTENSION_DIRECTORY_PATH).toBe('/bundled-extension')
  })

  await runDesktopCli(runtime, support)

  expect(stagehandExtensionEnvironment).toHaveBeenCalledExactlyOnceWith(runtime)
  expect(runCli).toHaveBeenCalledExactlyOnceWith({
    manageDesktopProfile: true,
    packageManager: {
      command: process.execPath,
      args: ['--expose-internals', join(support, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
        PATH: `${join(support, 'bin')}${delimiter}${path ?? ''}`,
      },
    },
  })
})

it('locates the archive of an ASAR-contained runtime and leaves a prepared runtime without one', () => {
  const resources = join('Application 中文', 'resources')
  expect(runtimeArchivePath(join(resources, 'app.asar', 'dsh'))).toBe(join(resources, 'app.asar'))
  expect(runtimeArchivePath(join(resources, 'app.asar.unpacked', 'dsh'))).toBeUndefined()
  expect(runtimeArchivePath(join(resources, 'dsh'))).toBeUndefined()
})
