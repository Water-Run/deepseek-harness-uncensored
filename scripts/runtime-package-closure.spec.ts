import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { runtimePackageDirectories } from './runtime-package-closure.mjs'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-runtime-closure-')); roots.push(root)
  const staging = join(root, 'staging')
  async function pkg(name: string, fields: Record<string, unknown> = {}, owner = staging) {
    const directory = join(owner, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...fields }))
    return directory
  }
  return { root, staging, pkg }
}

it('includes nested dependencies, required peers and assets even when manifests are not exported', async () => {
  const { staging, pkg } = await fixture()
  const entry = await pkg('rea-agents', { dependencies: { codec: '1', cycle: '1' }, optionalDependencies: { absent: '1', foreign: '1' },
    peerDependencies: { peer: '1', missingPeer: '1' }, peerDependenciesMeta: { missingPeer: { optional: true } } })
  const codec = await pkg('codec', { exports: { '.': './index.js' } }, entry)
  await writeFile(join(codec, 'data.wasm'), 'resource')
  await pkg('codec', { version: '2.0.0' })
  await pkg('cycle', { dependencies: { 'rea-agents': '1' } })
  await pkg('peer')
  await pkg('foreign', { os: ['!win32'], cpu: ['x64'] })
  const paths = await runtimePackageDirectories(staging, [entry], { platform: 'win32', arch: 'x64' })
  expect(paths.map(path => relative(staging, path).replaceAll('\\', '/'))).toEqual([
    'node_modules/cycle', 'node_modules/peer', 'node_modules/rea-agents', 'node_modules/rea-agents/node_modules/codec',
  ])
})

it('rejects a dependency resolved outside the prepared application', async () => {
  const { root, staging, pkg } = await fixture()
  const entry = await pkg('rea-agents', { dependencies: { outside: '1' } })
  await pkg('outside', {}, root)
  await expect(runtimePackageDirectories(staging, [entry], { platform: 'win32', arch: 'x64' })).rejects.toThrow('outside the deployed closure')
})

it('rejects absent required and incomplete optional packages instead of packaging a partial runtime', async () => {
  const { staging, pkg } = await fixture()
  const entry = await pkg('rea-agents', { dependencies: { missing: '1' } })
  await expect(runtimePackageDirectories(staging, [entry], { platform: 'linux', arch: 'x64' })).rejects.toThrow('missing')
  await pkg('rea-agents', { optionalDependencies: { incomplete: '1' } })
  await mkdir(join(dirname(entry), 'incomplete'))
  await expect(runtimePackageDirectories(staging, [entry], { platform: 'linux', arch: 'x64' })).rejects.toMatchObject({ code: 'ENOENT' })
})
