/** The installed CLI uses the shared pnpm distribution with Electron's package-operation environment. */

import { delimiter, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'
import { runDesktopCli } from '../../desktop-host/src/cli.ts'
import { installOfficeEngineResolution } from '../../desktop-host/src/office-engine.ts'
import { stagehandExtensionEnvironment } from '../../desktop-host/src/browser-extension.ts'

vi.mock('@deepseek-ai/dsh/lib/bin.js', () => ({ runCli: vi.fn() }))
vi.mock('../../desktop-host/src/office-engine.ts', () => ({ installOfficeEngineResolution: vi.fn() }))
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
  const runtime = join('Application 中文 with spaces', 'resources', 'app.asar', 'dsh')
  const support = join('Application 中文 with spaces', 'resources', 'runtime')

  await runDesktopCli(runtime, support)

  expect(installOfficeEngineResolution).toHaveBeenCalledExactlyOnceWith(runtime)
  expect(stagehandExtensionEnvironment).toHaveBeenCalledExactlyOnceWith(runtime)
  expect(process.env.STAGEHAND_EXTENSION_DIRECTORY_PATH).toBe('/bundled-extension')
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
