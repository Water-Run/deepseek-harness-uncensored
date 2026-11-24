/** Release directory assembly for artifacts built on separate hosts. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import yaml from 'js-yaml'
import { collectRelease } from '../scripts/collect-release.ts'

const VERSION = '2026.11.23.2'

it('matches the macOS index to its own source ZIP across architectures', async () => {
  const root = await workspace(), out = join(root, 'collected')
  const path = join(root, 'build.dmg')
  await writeFile(path, payload('dmg'))
  const auxiliary = []
  for (const arch of ['x64', 'arm64']) {
    const source = join(root, 'electron-' + arch + '.zip')
    await writeFile(source, 'bytes-' + arch)
    auxiliary.push({ name: `DSHU-${VERSION}-mac-${arch}.zip`, path: source })
  }
  const feed = join(root, 'latest-mac.yml')
  await writeFile(feed, yaml.dump({ path: 'electron-arm64.zip', files: [{ url: 'electron-arm64.zip', size: 11 }] }))
  await collectRelease({ version: VERSION, out, artifacts: [{ target: 'mac-arm64', path }], auxiliary, feeds: [feed] })
  const expected = `DSHU-${VERSION}-mac-arm64.zip`
  expect(yaml.load(await readFile(join(out, 'latest-mac.yml'), 'utf8'))).toEqual({ path: expected, files: [{ url: expected, size: 11 }] })
  await expect(collectRelease({ version: VERSION, out, artifacts: [{ target: 'mac-arm64', path }], auxiliary: [{ name: '../other.zip', path }] })).rejects.toThrow('distinct')
  await expect(collectRelease({ version: VERSION, out, artifacts: [{ target: 'mac-../../outside-arm64', path }] })).rejects.toThrow('unsupported target')
})

function payload(kind: 'deb' | 'dmg' | 'exe' | 'rpm' | 'tar.gz'): Buffer {
  switch (kind) {
    case 'exe': return Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(64)])
    case 'deb': return Buffer.concat([Buffer.from('!<arch>\n', 'latin1'), Buffer.alloc(64)])
    case 'rpm': return Buffer.concat([Buffer.from([0xed, 0xab, 0xee, 0xdb]), Buffer.alloc(64)])
    case 'dmg': return Buffer.concat([Buffer.alloc(256), Buffer.from('koly', 'latin1'), Buffer.alloc(256)])
    case 'tar.gz': return Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.alloc(64)])
  }
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-collect-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

it('collects one verified file per target under a uniform name', async () => {
  const root = await workspace()
  const sources = [
    ['win-x64', 'deepseek-harness-uncensored-2026.11.23.2-win-x64.exe', 'exe'],
    ['linux-x64', 'deepseek-harness-uncensored-2026.11.23.2-linux-amd64.deb', 'deb'],
    ['linux-x64-rpm', 'deepseek-harness-uncensored-2026.11.23.2-linux-x86_64.rpm', 'rpm'],
    ['linux-arm64', 'deepseek-harness-uncensored-2026.11.23.2-linux-arm64.deb', 'deb'],
    ['mac-arm64', 'deepseek-harness-uncensored-2026.11.23.2-mac-arm64.dmg', 'dmg'],
  ] as const
  const artifacts: { target: string; path: string }[] = []
  for (const [target, filename, kind] of sources) {
    const path = join(root, filename)
    await writeFile(path, payload(kind))
    artifacts.push({ target: target === 'linux-x64-rpm' ? 'linux-x64' : target, path })
  }
  const out = join(root, 'release')
  const collected = await collectRelease({ version: VERSION, out, artifacts, commit: 'abc1234' })
  expect(collected.map(artifact => artifact.name)).toEqual([
    `DSHU-${VERSION}-win-x64.exe`, `DSHU-${VERSION}-linux-x64.deb`, `DSHU-${VERSION}-linux-x64.rpm`,
    `DSHU-${VERSION}-linux-arm64.deb`, `DSHU-${VERSION}-mac-arm64.dmg`,
  ])
  const sums = await readFile(join(out, 'SHA256SUMS.txt'), 'utf8')
  expect(sums.trimEnd().split('\n')).toHaveLength(6)
  expect(sums).toContain(`  DSHU-${VERSION}-win-x64.exe\n`)
  expect(sums.trimEnd().split('\n').at(-1)).toMatch(/^[0-9a-f]{64} {2}LICENSE$/u)
  const manifest = JSON.parse(await readFile(join(out, 'RELEASE-MANIFEST.json'), 'utf8')) as {
    version: string
    sourceCommit: string
    sourceDirty: boolean
    artifacts: readonly { target: string; format: string; bytes: number; sha256: string }[]
  }
  expect(manifest.version).toBe(VERSION)
  expect(manifest.sourceCommit).toBe('abc1234')
  expect(manifest.sourceDirty).toBe(false)
  expect(manifest.artifacts.map(artifact => [artifact.target, artifact.format])).toEqual([
    ['win-x64', 'exe'], ['linux-x64', 'deb'], ['linux-x64', 'rpm'], ['linux-arm64', 'deb'], ['mac-arm64', 'dmg'],
  ])
  expect(manifest.artifacts[1]?.sha256).toMatch(/^[0-9A-F]{64}$/u)
  const readme = await readFile(join(out, 'README.txt'), 'utf8')
  expect(readme).toContain(`DSHU-${VERSION}-linux-x64.deb`)
  expect(readme).toContain('sudo apt install ./')
  expect(readme).toContain('sha256sum -c SHA256SUMS.txt')
  expect(readme).toContain('https://github.com/Water-Run/deepseek-harness-uncensored')
  expect(readme).toContain(`/releases/tag/v${VERSION}`)
  expect(readme).toContain('/issues')
  expect(readme).toContain(`DSHU ${VERSION} · abc1234 · GPL-3.0-or-later`)
  expect(readme).not.toContain('#')
  expect(readme).not.toContain('|')
})

it('rejects two artifacts that would share one release name', async () => {
  const root = await workspace()
  const first = join(root, 'a', 'deepseek-harness-uncensored-2026.11.23.2-linux-amd64.deb')
  const second = join(root, 'b', 'deepseek-harness-uncensored-2026.11.24.2-linux-amd64.deb')
  await mkdir(join(root, 'a'), { recursive: true })
  await mkdir(join(root, 'b'), { recursive: true })
  await writeFile(first, payload('deb'))
  await writeFile(second, payload('deb'))
  await expect(collectRelease({
    version: VERSION, out: join(root, 'release'),
    artifacts: [{ target: 'linux-x64', path: first }, { target: 'linux-x64', path: second }],
  })).rejects.toThrow(/more than one artifact for DSHU-2026\.11\.23\.2-linux-x64\.deb/u)
})

it('rejects an artifact whose container signature does not match its extension', async () => {
  const root = await workspace()
  const installer = join(root, 'deepseek-harness-uncensored-2026.11.23.2-win-x64.exe')
  await writeFile(installer, Buffer.from('not a portable executable', 'utf8'))
  await expect(collectRelease({ version: VERSION, out: join(root, 'release'), artifacts: [{ target: 'win-x64', path: installer }] }))
    .rejects.toThrow(/does not start with the PE signature/u)
})

it('refuses to replace an existing artifact without force', async () => {
  const root = await workspace()
  const installer = join(root, 'deepseek-harness-uncensored-2026.11.23.2-win-x64.exe')
  await writeFile(installer, payload('exe'))
  const out = join(root, 'release')
  await collectRelease({ version: VERSION, out, artifacts: [{ target: 'win-x64', path: installer }] })
  await expect(collectRelease({ version: VERSION, out, artifacts: [{ target: 'win-x64', path: installer }] }))
    .rejects.toThrow(/pass --force to replace it/u)
  await expect(collectRelease({ version: VERSION, out, artifacts: [{ target: 'win-x64', path: installer }], force: true }))
    .resolves.toHaveLength(1)
})
