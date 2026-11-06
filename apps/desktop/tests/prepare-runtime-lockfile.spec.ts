import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import yaml from 'js-yaml'
import { prepareRuntimeLockfile, verifyRuntimeLockfile } from '../scripts/prepare-runtime-lockfile.ts'
import type { DesktopCorePackageSet } from '../src/core-package-set.ts'

const roots: string[] = []
const integrity = (text: string): string => `sha512-${createHash('sha512').update(text).digest('base64')}`
const coreIntegrity = integrity('core')
const coreSpec = 'core@file:desktop-packages/core.tgz'
const core = { resolution: { integrity: coreIntegrity, tarball: 'file:desktop-packages/core.tgz' }, version: '1.0.0' }
const external = { resolution: { integrity: integrity('external') } }
const packageSet: DesktopCorePackageSet = { schemaVersion: 1, packages: [{ name: 'core', version: '1.0.0', file: 'core.tgz', bytes: 4, integrity: coreIntegrity }] }
const target = { platform: 'win32', arch: 'x64' }

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

function fixture(): { source: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), 'desktop-lockfile-'))
  roots.push(root)
  const source = join(root, 'source'), project = join(root, 'project')
  mkdirSync(source); mkdirSync(project)
  writeLock(source, { 'external@1.0.0': external })
  writeFileSync(join(project, 'pnpm-workspace.yaml'), yaml.dump({ packages: ['.'], overrides: { core: 'file:./desktop-packages/core.tgz' }, allowBuilds: { core: false } }))
  return { source, project }
}

function writeLock(root: string, packages: Record<string, object>): void {
  writeFileSync(join(root, 'pnpm-lock.yaml'), yaml.dump({ lockfileVersion: '9.0', packages }))
}

function native(source: string): { name: string; version: string; os: string[]; cpu: string[] } {
  const root = join(source, 'native/system/packages')
  mkdirSync(join(root, 'entry'), { recursive: true })
  mkdirSync(join(root, 'linux-x64'))
  const manifest = { name: '@deepseek-ai/node-addon-system-linux-x64', version: '0.1.2', os: ['linux'], cpu: ['x64'] }
  writeFileSync(join(root, 'entry/package.json'), JSON.stringify({ optionalDependencies: { [manifest.name]: 'workspace:~' } }))
  writeFileSync(join(root, 'linux-x64/package.json'), JSON.stringify(manifest))
  return manifest
}

it('seeds source bytes without mutating them or losing build policy', () => {
  const { source, project } = fixture()
  const bytes = readFileSync(join(source, 'pnpm-lock.yaml'))
  const plan = prepareRuntimeLockfile(project, source, packageSet, target)
  expect(readFileSync(join(project, 'pnpm-lock.yaml'))).toEqual(bytes)
  expect(readFileSync(join(source, 'pnpm-lock.yaml'))).toEqual(bytes)
  expect(plan.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  expect(yaml.load(readFileSync(join(project, 'pnpm-workspace.yaml'), 'utf8'))).toMatchObject({ allowBuilds: { core: false } })
  writeLock(project, { [coreSpec]: core, 'external@1.0.0': external })
  expect(() => { verifyRuntimeLockfile(project, plan) }).not.toThrow()
})

it.each(['new version', 'new registry', 'changed integrity', 'unknown local archive', 'changed core integrity', 'changed core path', 'missing core'] as const)(
  'rejects %s before production installation', (failure) => {
    const { source, project } = fixture()
    const plan = prepareRuntimeLockfile(project, source, packageSet, target)
    let packages: Record<string, object> = { [coreSpec]: core, 'external@1.0.0': external }
    switch (failure) {
      case 'new version': packages['external@1.1.0'] = external; break
      case 'new registry': packages['external@1.0.0'] = { resolution: { ...external.resolution, tarball: 'https://other.invalid/external.tgz' } }; break
      case 'changed integrity': packages['external@1.0.0'] = { resolution: { integrity: integrity('changed') } }; break
      case 'unknown local archive': packages['other@file:other.tgz'] = core; break
      case 'changed core integrity': packages[coreSpec] = { resolution: { ...core.resolution, integrity: integrity('changed') } }; break
      case 'changed core path': packages[coreSpec] = { resolution: { ...core.resolution, tarball: 'file:other.tgz' } }; break
      case 'missing core': packages = { 'external@1.0.0': external }; break
    }
    writeLock(project, packages)
    expect(() => { verifyRuntimeLockfile(project, plan) }).toThrow(/desktop lockfile/u)
  },
)

it('pins only omitted optional native variants to their source versions', () => {
  const { source, project } = fixture()
  const manifest = native(source)
  const plan = prepareRuntimeLockfile(project, source, packageSet, target)
  expect(yaml.load(readFileSync(join(project, 'pnpm-workspace.yaml'), 'utf8'))).toMatchObject({ overrides: { [manifest.name]: '0.1.2' } })
  writeLock(project, { [coreSpec]: core, [`${manifest.name}@0.1.2`]: { resolution: { integrity: integrity('native') }, os: manifest.os, cpu: manifest.cpu } })
  expect(() => { verifyRuntimeLockfile(project, plan) }).not.toThrow()
})

it.each(['version', 'platform', 'tarball', 'integrity'] as const)('rejects changed omitted native %s', (change) => {
  const { source, project } = fixture()
  const manifest = native(source)
  const plan = prepareRuntimeLockfile(project, source, packageSet, target)
  writeLock(project, { [coreSpec]: core, [`${manifest.name}@${change === 'version' ? '0.1.3' : '0.1.2'}`]: {
    resolution: { integrity: change === 'integrity' ? 'sha512-invalid' : integrity('native'), ...(change === 'tarball' ? { tarball: 'https://other.invalid/native.tgz' } : {}) },
    os: change === 'platform' ? ['win32'] : manifest.os, cpu: manifest.cpu,
  } })
  expect(() => { verifyRuntimeLockfile(project, plan) }).toThrow('unreviewed registry resolution')
})

it('requires the target native variant to use local core archives', () => {
  const { source, project } = fixture()
  native(source)
  expect(() => { prepareRuntimeLockfile(project, source, packageSet, { platform: 'linux', arch: 'x64' }) }).toThrow('must come from local tarballs')
})

it('rejects conflicting native overrides and invalid source manifests', () => {
  const { source, project } = fixture()
  const manifest = native(source)
  writeFileSync(join(project, 'pnpm-workspace.yaml'), yaml.dump({ overrides: { [manifest.name]: '0.1.3' } }))
  expect(() => { prepareRuntimeLockfile(project, source, packageSet, target) }).toThrow('conflicting native version')
  writeFileSync(join(project, 'pnpm-workspace.yaml'), '{}')
  writeFileSync(join(source, 'native/system/packages/linux-x64/package.json'), JSON.stringify({ ...manifest, version: 'latest' }))
  expect(() => { prepareRuntimeLockfile(project, source, packageSet, target) }).toThrow('invalid native variant')
})

it('refuses to overwrite the source workspace or interpret a different lock format', () => {
  const { source, project } = fixture()
  expect(() => { prepareRuntimeLockfile(source, source, packageSet, target) }).toThrow('source workspace')
  writeFileSync(join(source, 'pnpm-lock.yaml'), 'lockfileVersion: 10\npackages: {}\n')
  expect(() => { prepareRuntimeLockfile(project, source, packageSet, target) }).toThrow()
})
