/** Packaging overrides reach both payload metadata and the private CLI. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { readPreparedDesktopRelease, readPreparedProductVersion } from '../scripts/prepare-runtime-release.ts'
import { prepareRuntimeManifests } from '../scripts/prepare-runtime-manifests.ts'

const upstream = { upstreamVersion: '0.2.2-rc.3', upstreamCommit: '38a6a5c965aa99ab525161efb7cc5cf1fe62fced' }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'desktop-release-inputs-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const app = join(root, 'apps/desktop'), runtime = join(root, 'runtime')
  await mkdir(app, { recursive: true })
  await mkdir(runtime)
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.2.2-rc.3' }))
  await writeFile(join(root, 'product.json'), JSON.stringify(upstream))
  await writeFile(join(app, 'package.json'), JSON.stringify({ version: '2026.1114.1' }))
  await writeFile(join(runtime, 'versions.json'), JSON.stringify({ node: '24.21.0', pnpm: '11.28.5' }))
  return { root, app, runtime }
}

it.each(['2026.11.15.2', '2026.1115.2'])('carries build %s through release and CLI metadata without retagging the engine', async (build) => {
  const { root, app, runtime } = await fixture()
  const environment = { DSH_DESKTOP_BUILD_VERSION: build }
  const release = readPreparedDesktopRelease(app, runtime, environment)
  expect(release).toMatchObject({ version: '2026.1115.2', engineVersion: '0.2.2-rc.3' })
  expect(readPreparedProductVersion(app, environment)).toBe(release.version)
  const cli = join(root, 'node_modules/@deepseek-ai/dsh/package.json')
  await mkdir(join(cli, '..'), { recursive: true })
  await writeFile(cli, JSON.stringify({ name: '@deepseek-ai/dsh', version: release.engineVersion, dshProductVersion: '2026.1114.1' }))
  await prepareRuntimeManifests(root, release.version)
  expect(JSON.parse(await readFile(cli, 'utf8'))).toMatchObject({ version: '0.2.2-rc.3', dshProductVersion: '2026.1115.2' })
})

it('keeps the source version outside packaging and rejects an older or malformed build', async () => {
  const { app, runtime } = await fixture()
  expect(readPreparedDesktopRelease(app, runtime, {}).version).toBe('2026.1114.1')
  for (const build of ['2026.11.13.1', '2026.02.30.1', 'invalid']) {
    expect(() => readPreparedProductVersion(app, { DSH_DESKTOP_BUILD_VERSION: build })).toThrow()
  }
  await writeFile(join(app, 'package.json'), '{}')
  expect(() => readPreparedProductVersion(app, {})).toThrow('desktop package has no version')
})

it('rejects release preparation when the engine and displayed upstream identity diverge', async () => {
  const { root, app, runtime } = await fixture()
  const product = join(root, 'product.json')
  await writeFile(product, JSON.stringify({ ...upstream, upstreamVersion: '0.2.2-rc.4' }))
  expect(() => readPreparedDesktopRelease(app, runtime, {})).toThrow('upstreamVersion must match the root DSH package version')
  await writeFile(product, JSON.stringify({ upstreamVersion: upstream.upstreamVersion }))
  expect(() => readPreparedDesktopRelease(app, runtime, {})).toThrow('must identify the full upstream DSH commit')
})
