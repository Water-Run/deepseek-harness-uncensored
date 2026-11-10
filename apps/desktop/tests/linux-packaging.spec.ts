/** Linux target identity, isolated packaging settings and user command feedback. */
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { parseDesktopPackageInvocation, resolveDesktopPackageTarget } from '../scripts/package-target.ts'
import { desktopTargetBuildPaths } from '../scripts/desktop-build-paths.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { loadDesktopPackageEnvironment, localUnsignedPackageEnvironment, validateDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'
import { resolveLinuxPackageSettings } from '../scripts/linux-package-settings.mjs'
import { presentCommandManagement } from '../src/command-management.ts'
import { en, zh } from '../src/locale.ts'

it('selects a native Linux x64 target with independent outputs and product identity', () => {
  expect(resolveDesktopPackageTarget('linux-x64', 'linux', 'x64')).toMatchObject({
    platform: 'linux', arch: 'x64', builderPlatform: '--linux', builderArch: '--x64',
  })
  expect(parseDesktopPackageInvocation(['--unsigned', '--dir'], 'linux', 'x64')).toMatchObject({
    target: { name: 'linux-x64' }, unsigned: true, directory: true,
  })
  expect(() => parseDesktopPackageInvocation(['--skip-notarization'], 'linux', 'x64')).toThrow('macOS')
  expect(desktopTargetBuildPaths('linux-x64').runtime).not.toBe(desktopTargetBuildPaths('win-x64').runtime)
  const config = createElectronBuilderConfig({ DSH_DESKTOP_UNSIGNED: '1' }, 'linux', 'x64')
  expect(config.appId).toBe('com.deepseek.dsh.uncensored')
  expect(config.linux).toMatchObject({ executableName: 'deepseek-harness-uncensored', syncDesktopName: true, target: ['deb', 'tar.gz'] })
  expect(config.protocols).toEqual([{ name: 'DeepSeek Harness Uncensored', schemes: ['dshu'] }])
  expect(config.publish).toBeNull()
})

it('reads Linux settings without borrowing Apple or Windows signing configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-linux-settings-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, '.env.linux'), 'DSH_DESKTOP_APP_ID=com.deepseek.dsh.uncensored\nDSH_DESKTOP_LINUX_PACK_CONCURRENCY=2\n')
  const settings = loadDesktopPackageEnvironment('linux', {
    APPLE_ID: 'must-not-propagate', DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'must-not-propagate', PATH: 'tool-path',
  }, root)
  expect(settings).toEqual({ DSH_DESKTOP_APP_ID: 'com.deepseek.dsh.uncensored', DSH_DESKTOP_LINUX_PACK_CONCURRENCY: '2', PATH: 'tool-path' })
  expect(() => {
    validateDesktopPackageEnvironment(settings, { platform: 'linux', arch: 'x64' })
  }).not.toThrow()
  await writeFile(join(root, '.env.linux'), 'CSC_LINK=wrong-platform\n')
  expect(() => loadDesktopPackageEnvironment('linux', {}, root)).toThrow('unsupported setting CSC_LINK')
})

it('retains the local Linux worker limit while excluding release credentials', () => {
  const environment = localUnsignedPackageEnvironment({ DSH_DESKTOP_LINUX_PACK_CONCURRENCY: '2',
    APPLE_ID: 'excluded', DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'excluded' })
  expect(resolveLinuxPackageSettings(environment)).toEqual({ packConcurrency: 2 })
  expect(environment.APPLE_ID).toBeUndefined()
  expect(environment.DSH_DESKTOP_WINDOWS_TOKEN_PIN).toBeUndefined()
})

it.each(['0', '-1', '1.5', '', '9007199254740992'])('rejects an invalid Linux worker limit %s', (value) => {
  expect(() => resolveLinuxPackageSettings({ DSH_DESKTOP_LINUX_PACK_CONCURRENCY: value })).toThrow('positive integer')
})

it.each([en, zh])('reports an installed user command missing from the Linux shell PATH', (messages) => {
  const dialog = presentCommandManagement({ managed: true, available: true, destination: '/home/example/.local/bin/dsh-uncensored' }, messages, 'linux')
  expect(dialog.type).toBe('warning')
  expect(dialog.detail).toContain('/home/example/.local/bin')
  expect(dialog.detail).toContain('PATH')
})
