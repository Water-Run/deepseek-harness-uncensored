import { expect, it } from 'vitest'
import { desktopBuildRecordFilename, desktopUpdateMetadataFilename, resolveDesktopAutoUpdateEnvironment,
  resolveDesktopAutoUpdateTarget, resolveDesktopUpdateChannel } from '../scripts/desktop-auto-update-environment.mjs'
import { uncensoredUpdateConfig } from '../scripts/uncensored-update.mjs'

it.each([['darwin', 'arm64', 'mac-arm64'], ['darwin', 'x64', 'mac-x64'], ['win32', 'x64', 'win-x64']] as const)
('keeps %s %s release records independent from the upstream service', (platform, arch, target) => {
  expect(resolveDesktopAutoUpdateTarget(platform, arch)).toBe(target)
  expect(desktopBuildRecordFilename(target)).toBe(`${target}-release.json`)
  expect(uncensoredUpdateConfig(platform, arch)).toEqual({ environment: 'github', channel: 'latest', target,
    publicUrl: 'https://github.com/Water-Run/deepseek-harness-uncensored/releases/latest/download/' })
})

it('retains policy selection without resolving storage credentials or origins', () => {
  expect(resolveDesktopAutoUpdateEnvironment({})).toBe('test')
  expect(resolveDesktopAutoUpdateEnvironment({ DSH_DESKTOP_AUTO_UPDATE_ENV: 'production' })).toBe('production')
  expect(() => resolveDesktopAutoUpdateEnvironment({ DSH_DESKTOP_AUTO_UPDATE_ENV: 'staging' })).toThrow(/test.*production/u)
  expect(() => resolveDesktopAutoUpdateTarget('linux', 'x64')).toThrow(/unsupported target/u)
  expect(() => desktopBuildRecordFilename('linux-x64' as 'mac-arm64')).toThrow(/unsupported target/u)
})

it('preserves channel metadata names for release and preview versions', () => {
  expect(resolveDesktopUpdateChannel({})).toBe('nightly')
  expect(resolveDesktopUpdateChannel({ DSH_DESKTOP_UPDATE_CHANNEL: 'latest' })).toBe('latest')
  expect(desktopUpdateMetadataFilename('0.1.0', 'darwin', 'latest')).toBe('latest-mac.yml')
  expect(desktopUpdateMetadataFilename('0.1.0-test.1', 'win32')).toBe('nightly.yml')
  expect(() => desktopUpdateMetadataFilename('not-semver', 'darwin')).toThrow(/invalid Desktop version/u)
  expect(() => desktopUpdateMetadataFilename('0.1.0', 'linux')).toThrow(/unsupported metadata platform/u)
  expect(() => resolveDesktopUpdateChannel({ DSH_DESKTOP_UPDATE_CHANNEL: 'invalid' })).toThrow(/invalid update channel/u)
})
