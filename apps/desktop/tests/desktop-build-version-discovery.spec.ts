import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  desktopBuildDateSegment,
  suggestDesktopBuildVersion,
} from '../scripts/desktop-build-version-discovery.ts'

const PRERELEASE = '0.1.6-alpha.2'
const STABLE = '0.1.6'
const DATE = '20260921'
const directories: string[] = []

async function artifactsWith(names: readonly string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-discovery-'))
  directories.push(directory)
  for (const name of names) await writeFile(join(directory, name), '')
  return directory
}

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe('desktop build version discovery', () => {
  it('distinguishes a new output directory from an unreadable artifact inventory', async () => {
    const root = await artifactsWith(['not-a-directory'])
    await expect(suggestDesktopBuildVersion({ productVersion: STABLE, date: DATE, artifactsRoot: join(root, 'new') }))
      .resolves.toBe(`${STABLE}-test.${DATE}.1`)
    await expect(suggestDesktopBuildVersion({ productVersion: STABLE, date: DATE, artifactsRoot: join(root, 'not-a-directory') }))
      .rejects.toMatchObject({ code: 'ENOTDIR' })
  })
  it('does not number DSHU builds from official DSH installer names', async () => {
    const artifactsRoot = await artifactsWith([`deepseek-harness-${STABLE}-test.${DATE}.99-win-x64.exe`])
    await expect(suggestDesktopBuildVersion({ productVersion: STABLE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${STABLE}-test.${DATE}.1`)
  })
  it('includes Uncensored installers retained in per-run unsigned output directories', async () => {
    const artifactsRoot = await artifactsWith([])
    const run = join(artifactsRoot, 'runs', 'build-one')
    await mkdir(run, { recursive: true })
    await writeFile(join(run, `deepseek-harness-uncensored-${STABLE}-test.${DATE}.8-win-x64-unsigned.exe`), '')
    await expect(suggestDesktopBuildVersion({ productVersion: STABLE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${STABLE}-test.${DATE}.9`)
  })
  it('formats the build day consistently in Asia/Shanghai', () => {
    expect(desktopBuildDateSegment(new Date(2026, 8, 21))).toBe('20260921')
    expect(desktopBuildDateSegment(new Date(2026, 0, 5))).toBe('20260105')
    expect(desktopBuildDateSegment(new Date('2026-11-13T16:00:00Z'))).toBe('20261114')
    expect(desktopBuildDateSegment(new Date('2026-11-13T15:59:59Z'))).toBe('20261113')
  })

  it('starts at one when nothing is taken', async () => {
    const artifactsRoot = await artifactsWith([])
    await expect(suggestDesktopBuildVersion({ productVersion: PRERELEASE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${PRERELEASE}.${DATE}.1`)
  })

  it('numbers a stable product version under the documented test prerelease', async () => {
    const artifactsRoot = await artifactsWith([`deepseek-harness-uncensored-${STABLE}-test.${DATE}.4-win-x64.exe`])
    await expect(suggestDesktopBuildVersion({ productVersion: STABLE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${STABLE}-test.${DATE}.5`)
  })

  it('numbers after the highest local artifact for the same date', async () => {
    const artifactsRoot = await artifactsWith([
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.1-win-x64.exe`,
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.2-win-x64.exe`,
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.10-win-x64.exe`,
    ])
    await expect(suggestDesktopBuildVersion({ productVersion: PRERELEASE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${PRERELEASE}.${DATE}.11`)
  })

  it('ignores artifacts from another date or product version', async () => {
    const artifactsRoot = await artifactsWith([
      `deepseek-harness-uncensored-${PRERELEASE}.20260920.7-win-x64.exe`,
      `deepseek-harness-uncensored-0.1.5-alpha.1.${DATE}.9-win-x64.exe`,
      `deepseek-harness-uncensored-${PRERELEASE}-win-x64.exe`,
      'unrelated.exe',
    ])
    await expect(suggestDesktopBuildVersion({ productVersion: PRERELEASE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${PRERELEASE}.${DATE}.1`)
  })

  it('reads macOS artifact names too', async () => {
    const artifactsRoot = await artifactsWith([
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.3-mac-arm64.dmg`,
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.3-mac-arm64.zip`,
    ])
    await expect(suggestDesktopBuildVersion({ productVersion: PRERELEASE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${PRERELEASE}.${DATE}.4`)
  })

  it('numbers after existing unnotarized DMG and ZIP artifacts', async () => {
    const artifactsRoot = await artifactsWith([
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.2-mac-arm64-unnotarized.dmg`,
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.4-mac-arm64-unnotarized.zip`,
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.9-mac-arm64-unnotarized.zip.blockmap`,
    ])
    await expect(suggestDesktopBuildVersion({ productVersion: PRERELEASE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${PRERELEASE}.${DATE}.5`)
  })

  it('counts unsigned Windows artifacts written under their own suffix', async () => {
    const artifactsRoot = await artifactsWith([
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.2-win-x64-unsigned.exe`,
      `deepseek-harness-uncensored-${PRERELEASE}.${DATE}.5-win-x64-unsigned.exe.blockmap`,
    ])
    await expect(suggestDesktopBuildVersion({ productVersion: PRERELEASE, date: DATE, artifactsRoot }))
      .resolves.toBe(`${PRERELEASE}.${DATE}.3`)
  })
})

it('numbers calendar builds from public artifact names across formats and keeps legacy artifacts separate', async () => {
  const artifactsRoot = await artifactsWith([
    'deepseek-harness-uncensored-2026.11.14.9-win-x64-unsigned.exe',
    'deepseek-harness-uncensored-2026.11.14.10-linux-x64-unsigned.tar.gz',
    'deepseek-harness-uncensored-0.1.0-test.20261114.88-win-x64-unsigned.exe',
  ])
  await expect(suggestDesktopBuildVersion({ productVersion: '2026.1114.1', date: '20261114', artifactsRoot }))
    .resolves.toBe('2026.1114.11')
  await expect(suggestDesktopBuildVersion({ productVersion: '2026.1114.1', date: '20261115', artifactsRoot }))
    .resolves.toBe('2026.1115.0')
})

it('numbers the first build of a calendar day from 0 and continues after it', async () => {
  const artifactsRoot = await artifactsWith([])
  await expect(suggestDesktopBuildVersion({ productVersion: '2026.1114.1', date: '20261115', artifactsRoot }))
    .resolves.toBe('2026.1115.0')
  await writeFile(join(artifactsRoot, 'deepseek-harness-uncensored-2026.11.15.0-win-x64-unsigned.exe'), '')
  await expect(suggestDesktopBuildVersion({ productVersion: '2026.1114.1', date: '20261115', artifactsRoot }))
    .resolves.toBe('2026.1115.1')
})

it('continues after retained deliveries when disposable build output was cleaned', async () => {
  const artifactsRoot = await artifactsWith([])
  const deliveredArtifactsRoot = await artifactsWith(['DSHU-2026.11.14.7-core-0.2.2-rc.3-REA-6.9.0-win-x64-d98db9f.exe'])
  await expect(suggestDesktopBuildVersion({ productVersion: '2026.1114.1', date: '20261114', artifactsRoot, deliveredArtifactsRoot }))
    .resolves.toBe('2026.1114.8')
})

it('reads a retained zero-sequence delivery as the day\'s first build', async () => {
  const artifactsRoot = await artifactsWith([])
  const deliveredArtifactsRoot = await artifactsWith(['DSHU-2026.11.15.0-core-0.2.2-rc.3-REA-6.9.0-win-x64-d98db9f.exe'])
  await expect(suggestDesktopBuildVersion({ productVersion: '2026.1114.1', date: '20261115', artifactsRoot, deliveredArtifactsRoot }))
    .resolves.toBe('2026.1115.1')
})

it('respects the checkout calendar floor and ignores malformed calendar artifact revisions', async () => {
  const artifactsRoot = await artifactsWith(['deepseek-harness-uncensored-2026.1114.99999-win-x64-unsigned.exe'])
  await expect(suggestDesktopBuildVersion({ productVersion: '2026.1114.7', date: '20261114', artifactsRoot }))
    .resolves.toBe('2026.1114.7')
})
