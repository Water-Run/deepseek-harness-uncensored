/** Distribution notice paths, metadata versions and exact payload identities. */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { it, expect, onTestFinished } from 'vitest'
import { workspaceDependencyPaths, type PrimaryRuntimeManifest } from '@deepseek-ai/dsh-tool-workspace-dependencies'
import { collectPrimaryRuntimeNotices, preparePrimaryRuntimeNotices } from './notices.ts'

async function fixture(platform: PrimaryRuntimeManifest['platform'] = 'win32') {
  const root = await mkdtemp(join(tmpdir(), 'dshu-runtime-notices-'))
  onTestFinished(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  const manifest: PrimaryRuntimeManifest = { desktopVersion: '0.1.0', platform, arch: 'x64', python: '3.12.14',
    pythonPackages: { 'Example.Library': '1.0' } }
  const put = async (path: string, text: string): Promise<void> => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), text)
  }
  const packages = workspaceDependencyPaths(root, manifest).pythonPackages.slice(root.length + 1).replaceAll('\\', '/')
  const dist = `${packages}/example_library-1.0.dist-info`
  await put('dependencies/python/LICENSE.txt', 'CPython notice\n')
  const metadata = (version = '2.4', licenseFiles = ['LICENSE', 'AUTHORS.txt']): string =>
    `Metadata-Version: ${version}\nName: example-library\nVersion: 1.0\nLicense-Expression: BSD-3-Clause\n${licenseFiles.map(path => `License-File: ${path}\n`).join('')}\nLicense-File: ignored-body.txt\n`
  await put(`${dist}/METADATA`, metadata())
  return { root, manifest, put, packages, dist, metadata }
}

it.each(['win32', 'linux', 'darwin'] as const)('inventories wheel notices on %s without executing the target', async (platform) => {
  const f = await fixture(platform)
  await f.put(`${f.dist}/licenses/LICENSE`, 'Library notice\n')
  await f.put(`${f.dist}/licenses/AUTHORS.txt`, 'Author name\n')
  await f.put(`${f.packages}/example_library/vendor/COPYING`, 'Nested component notice\n')
  const report = await collectPrimaryRuntimeNotices(f.root, f.manifest)
  expect(report.pythonPackages).toMatchObject([{ name: 'example-library', version: '1.0', declaredLicense: 'BSD-3-Clause',
    reviewRequired: false, missingLicenseFiles: [], notices: [{ path: `${f.dist}/licenses/AUTHORS.txt` }, { path: `${f.dist}/licenses/LICENSE` }] }])
  expect(report.components[0]?.notices).toContainEqual({ path: `${f.packages}/example_library/vendor/COPYING`,
    sha256: createHash('sha256').update('Nested component notice\n').digest('hex') })
  await expect(readFile(join(f.root, 'third-party-runtime.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await preparePrimaryRuntimeNotices(f.root, f.manifest)
  expect(JSON.parse(await readFile(join(f.root, 'third-party-runtime.json'), 'utf8'))).toEqual(report)
})

it('keeps legacy unfolded license text and notices stored beside METADATA', async () => {
  const f = await fixture()
  await f.put(`${f.dist}/METADATA`, 'Metadata-Version: 2.1\r\nName: example-library\r\nVersion: 1.0\r\nLicense: MIT\r\n  with retained attribution\r\nLicense-File: LICENCE.rst\r\n\r\nDescription\r\n')
  await f.put(`${f.dist}/LICENCE.rst`, 'Legacy text\n')
  expect((await collectPrimaryRuntimeNotices(f.root, f.manifest)).pythonPackages).toMatchObject([
    { declaredLicense: 'MIT\nwith retained attribution', reviewRequired: false, notices: [{ path: `${f.dist}/LICENCE.rst` }] },
  ])
})

it('records independent Node and pnpm notices with nested bundled dependencies', async () => {
  const f = await fixture()
  await f.put('dependencies/node/LICENSE', 'Node and embedded notices\n')
  await f.put('dependencies/pnpm/LICENSE', 'pnpm notice\n')
  await f.put('dependencies/pnpm/dist/node_modules/nested/LICENSE', 'Nested notice\n')
  const report = await collectPrimaryRuntimeNotices(f.root, { ...f.manifest, node: '24.22.1', pnpm: '11.28.5' })
  const components = report.components.map(({ name, version, reviewRequired, notices }) =>
    ({ name, version, reviewRequired, files: notices.length }))
  expect(components).toEqual([
    { name: 'node', version: '24.22.1', reviewRequired: false, files: 1 },
    { name: 'pnpm', version: '11.28.5', reviewRequired: false, files: 2 },
    { name: 'python', version: '3.12.14', reviewRequired: false, files: 1 },
  ])
})

it.each(['2.4', '2.10'])('reads declared notice filenames under licenses for metadata %s', async (version) => {
  const f = await fixture()
  await f.put(`${f.dist}/METADATA`, f.metadata(version, ['terms/data.txt']))
  await f.put(`${f.dist}/licenses/terms/data.txt`, 'Data permission text\n')
  expect((await collectPrimaryRuntimeNotices(f.root, f.manifest)).pythonPackages).toMatchObject([
    { reviewRequired: false, notices: [{ path: `${f.dist}/licenses/terms/data.txt` }] },
  ])
})

it('rejects unknown metadata major versions without publishing an inventory', async () => {
  const f = await fixture()
  await f.put(`${f.dist}/METADATA`, f.metadata('3.0'))
  await expect(preparePrimaryRuntimeNotices(f.root, f.manifest)).rejects.toThrow('unsupported metadata version')
  await expect(readFile(join(f.root, 'third-party-runtime.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each([undefined, ' \n'])('keeps missing or blank declared texts visible even with another root license: %s', async (content) => {
  const f = await fixture()
  await f.put(`${f.dist}/LICENSE`, 'A different file does not satisfy the modern declaration')
  if (content !== undefined) await f.put(`${f.dist}/licenses/LICENSE`, content)
  const report = await collectPrimaryRuntimeNotices(f.root, f.manifest)
  expect(report.pythonPackages).toMatchObject([{ reviewRequired: true,
    missingLicenseFiles: [`${f.dist}/licenses/LICENSE`, `${f.dist}/licenses/AUTHORS.txt`] }])
})

it.each(['../outside', '/absolute', 'C:/outside', 'nested\\file', 'file/../LICENSE'])('rejects an invalid declared file path %s', async (path) => {
  const f = await fixture()
  await f.put(`${f.dist}/METADATA`, f.metadata('2.4', [path]))
  await expect(preparePrimaryRuntimeNotices(f.root, f.manifest)).rejects.toThrow('invalid License-File')
  await expect(readFile(join(f.root, 'third-party-runtime.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('refuses version drift, duplicate distributions and missing identity', async () => {
  const f = await fixture()
  await expect(collectPrimaryRuntimeNotices(f.root, { ...f.manifest, pythonPackages: { 'example-library': '2.0' } }))
    .rejects.toThrow('missing or mismatched')
  await f.put(`${f.packages}/other-1.0.dist-info/METADATA`, f.metadata())
  await expect(collectPrimaryRuntimeNotices(f.root, f.manifest)).rejects.toThrow('duplicate Python distribution')
  await f.put(`${f.packages}/other-1.0.dist-info/METADATA`, 'Metadata-Version: 2.4\nVersion: 1.0\n')
  await expect(collectPrimaryRuntimeNotices(f.root, f.manifest)).rejects.toThrow('invalid name')
})
