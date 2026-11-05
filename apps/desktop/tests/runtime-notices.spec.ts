/** Actual files keep notice coverage distinct from manifest license declarations. */
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { prepareRuntimeNotices } from '../scripts/runtime-notices.ts'
import sources from '../../../LICENSES/npm/sources.json' with { type: 'json' }

const roots: string[] = []
const nativeOfficeNotices = {
  'licenses/DeepSeek-Harness-MIT.txt': 'DeepSeek integration notice',
  'licenses/LibreOffice-MPL-2.0.txt': 'MPL engine notice',
  'licenses/LibreOffice-third-party.html': '<p>Component notices</p>',
  'program/NOTICE': 'Engine attribution',
  'program/license.txt': 'Engine license collection',
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dshu-runtime-notices-'))
  roots.push(root)
  mkdirSync(join(root, 'node_modules'))
  return root
}

function add(root: string, path: string, name: string, version = '1.0.0', files: Record<string, string> = {}): void {
  const directory = join(root, 'node_modules', path)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version, license: 'MIT' }))
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(directory, file, '..'), { recursive: true })
    writeFileSync(join(directory, file), text)
  }
}

it('inventories scoped and nested packages without treating internal package markers as dependencies', async () => {
  const root = fixture()
  add(root, '@scope/parent', '@scope/parent', '1.0.0', { LICENSE: 'owned license', 'dist/package.json': '{"type":"module"}' })
  add(root, '@scope/parent/node_modules/child', 'child', '2.0.0', { 'README.md': 'Permission is hereby granted\nnotice text' })
  add(root, 'empty', 'empty', '3.0.0', { LICENSE: '', 'README.md': 'License: MIT' })
  const packages = await prepareRuntimeNotices(root)
  expect(packages.map(pkg => [pkg.name, pkg.version, pkg.reviewRequired])).toEqual([
    ['@scope/parent', '1.0.0', false], ['child', '2.0.0', false], ['empty', '3.0.0', true],
  ])
  expect(packages[0]!.notices[0]!.sha256).toBe(createHash('sha256').update('owned license').digest('hex'))
  const first = readFileSync(join(root, 'third-party-runtime.json'), 'utf8')
  await prepareRuntimeNotices(root)
  expect(readFileSync(join(root, 'third-party-runtime.json'), 'utf8')).toBe(first)
})

it('requires exact aggregate versions and keeps documented upstream notice gaps visible', async () => {
  const root = fixture()
  add(root, 'rea-agents', 'rea-agents', '6.8.0', { LICENSE: 'REA notice',
    'licenses/npm-runtime-notices.txt': '===== covered@1.0.0 =====\ntext\n===== clean-git-ref@2.0.1 =====\nupstream gap' })
  add(root, 'covered', 'covered')
  add(root, 'other/node_modules/covered', 'covered', '1.0.1')
  add(root, 'clean-git-ref', 'clean-git-ref', '2.0.1')
  const packages = await prepareRuntimeNotices(root)
  expect(packages.find(pkg => pkg.name === 'covered' && pkg.version === '1.0.0')).toMatchObject({ reviewRequired: false })
  expect(packages.find(pkg => pkg.version === '1.0.1')).toMatchObject({ reviewRequired: true, notices: [] })
  expect(packages.find(pkg => pkg.name === 'clean-git-ref')).toMatchObject({ reviewRequired: true, notices: [expect.objectContaining({ path: 'node_modules/rea-agents/licenses/npm-runtime-notices.txt' })] })
})

it('records the native Office release texts without borrowing notices for other packages or versions', async () => {
  const root = fixture()
  const files = nativeOfficeNotices
  add(root, '@deepseek-ai/libreoffice-kit-win32-x64', '@deepseek-ai/libreoffice-kit-win32-x64', '0.1.5', files)
  add(root, 'next/node_modules/@deepseek-ai/libreoffice-kit-win32-x64', '@deepseek-ai/libreoffice-kit-win32-x64', '0.1.6', files)
  add(root, 'other', 'other', '0.1.5', files)
  const packages = await prepareRuntimeNotices(root)
  const native = packages.find(pkg => pkg.version === '0.1.5' && pkg.name.startsWith('@deepseek-ai/'))!
  expect(native.reviewRequired).toBe(false)
  expect(native.notices).toHaveLength(5)
  for (const [path, text] of Object.entries(files)) {
    expect(native.notices).toContainEqual({ path: `${native.path}/${path}`, sha256: createHash('sha256').update(text).digest('hex') })
  }
  expect(packages.filter(pkg => pkg.reviewRequired).map(pkg => `${pkg.name}@${pkg.version}`)).toEqual([
    '@deepseek-ai/libreoffice-kit-win32-x64@0.1.6', 'other@0.1.5',
  ])
})

it.each([undefined, ' \n'])('keeps an incomplete native collection review-required despite a root license: %s', async (text) => {
  const root = fixture()
  const files: Record<string, string> = { ...nativeOfficeNotices, LICENSE: 'Package-level notice' }
  if (text === undefined) delete files['licenses/LibreOffice-third-party.html']
  else files['licenses/LibreOffice-third-party.html'] = text
  add(root, '@deepseek-ai/libreoffice-kit-win32-x64', '@deepseek-ai/libreoffice-kit-win32-x64', '0.1.5', files)
  const packages = await prepareRuntimeNotices(root)
  expect(packages).toEqual([expect.objectContaining({ reviewRequired: true })])
  expect(packages[0]!.notices).toHaveLength(5)
})

it('keeps absent and blank native engine texts review-required', async () => {
  const root = fixture()
  add(root, '@deepseek-ai/libreoffice-kit-win32-x64', '@deepseek-ai/libreoffice-kit-win32-x64', '0.1.5', {
    LICENSE: ' \r\n', 'program/NOTICE': '\t\n', 'licenses/LibreOffice-MPL-2.0.txt': '',
  })
  expect(await prepareRuntimeNotices(root)).toEqual([expect.objectContaining({ reviewRequired: true, notices: [] })])
})

it('reports native notice I/O failures before publishing the inventory', async () => {
  const root = fixture()
  add(root, '@deepseek-ai/libreoffice-kit-win32-x64', '@deepseek-ai/libreoffice-kit-win32-x64', '0.1.5')
  mkdirSync(join(root, 'node_modules/@deepseek-ai/libreoffice-kit-win32-x64/program/license.txt'), { recursive: true })
  await expect(prepareRuntimeNotices(root)).rejects.toThrow()
  expect(() => readFileSync(join(root, 'third-party-runtime.json'))).toThrow()
})

it('copies every pinned supplement unchanged and leaves other versions for review', async () => {
  const root = fixture()
  for (const source of sources) {
    for (const identity of source.packages) {
      const split = identity.lastIndexOf('@')
      const name = identity.slice(0, split)
      const version = identity.slice(split + 1)
      add(root, `${version}/node_modules/${name}`, name, version)
    }
  }
  add(root, 'next/node_modules/@cfworker/json-schema', '@cfworker/json-schema', '99.0.0')
  add(root, 'next/node_modules/tr46', 'tr46', '0.0.4')
  const packages = await prepareRuntimeNotices(root)
  expect(packages.filter(pkg => pkg.reviewRequired).map(pkg => `${pkg.name}@${pkg.version}`).sort()).toEqual([
    '@cfworker/json-schema@99.0.0', 'tr46@0.0.4',
  ])
  for (const source of sources) {
    expect(createHash('sha256').update(readFileSync(join(root, 'licenses', source.file))).digest('hex')).toBe(source.sha256)
    for (const identity of source.packages) {
      expect(packages.find(pkg => `${pkg.name}@${pkg.version}` === identity)?.notices)
        .toContainEqual({ path: `licenses/${source.file}`, sha256: source.sha256 })
    }
  }
})

it('rejects a changed supplement before publishing the inventory', async () => {
  const root = fixture()
  const sourceDirectory = join(root, 'sources')
  cpSync(join(import.meta.dirname, '../../../LICENSES/npm'), sourceDirectory, { recursive: true })
  writeFileSync(join(sourceDirectory, 'cfworker-4.1.4-MIT.txt'), 'replaced')
  add(root, '@cfworker/json-schema', '@cfworker/json-schema', '4.1.4')
  await expect(prepareRuntimeNotices(root, sourceDirectory)).rejects.toThrow('changed supplement')
  expect(() => readFileSync(join(root, 'third-party-runtime.json'))).toThrow()
})

it('does not publish an empty or invalid package inventory', async () => {
  const root = fixture()
  await expect(prepareRuntimeNotices(root)).rejects.toThrow('no npm packages')
  add(root, 'invalid', 'invalid')
  writeFileSync(join(root, 'node_modules/invalid/package.json'), '{"name":"invalid"}')
  await expect(prepareRuntimeNotices(root)).rejects.toThrow('invalid package identity')
})

it('propagates notice access failures instead of treating them as an absent aggregate', async () => {
  const root = fixture()
  add(root, 'rea-agents', 'rea-agents')
  mkdirSync(join(root, 'node_modules/rea-agents/licenses/npm-runtime-notices.txt'), { recursive: true })
  await expect(prepareRuntimeNotices(root)).rejects.toThrow()
})
