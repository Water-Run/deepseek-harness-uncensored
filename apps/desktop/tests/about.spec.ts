import { afterEach, expect, it, vi } from 'vitest'
import { desktopAboutDetails } from '../src/about.ts'
import { en, zh } from '../src/locale.ts'

afterEach(() => { vi.unstubAllEnvs() })

const installedUpstreamCommit = '3f321d32bfe382212a8ed8785c1d47a5a300aa23'
const buildUpstreamCommit = '9c2670d3bce5275e0d1610272958121af87787bb'

it.each([['DSH upstream commit', en], ['DSH 上游提交', zh]] as const)('%s prefers the commit sealed in the installed manifest', (label, messages) => {
  vi.stubEnv('DSH_CLIENT_UPSTREAM_COMMIT', buildUpstreamCommit)
  const installed = desktopAboutDetails({ dshUncensored: { upstreamCommit: installedUpstreamCommit } }, '2026.1118.11', messages)
  expect(installed).toContain(`${label} ${installedUpstreamCommit}`)
  expect(desktopAboutDetails({}, '2026.1118.11', messages)).toContain(`${label} ${buildUpstreamCommit}`)
})

it('shows fork version, upstream version, commit and time from the installed build', () => {
  const result = desktopAboutDetails({ dshUncensored: { version: '1.0.0', upstreamVersion: '0.2.1' }, dshBuildCommit: 'abcd123', dshBuildDate: '2026-10-23T08:00:00Z' }, '0.2.1', zh)
  expect(result).toContain('Uncensored 1.0.0')
  expect(result).toContain('基于 DeepSeek Harness 0.2.1')
  expect(result).toContain('abcd123')
  expect(result).toContain('2026-10-23T08:00:00Z')
  expect(result).toContain('GPL-3.0-or-later')
})

it('keeps author and REA source information available before the product renderer is ready', () => {
  const result = desktopAboutDetails({ dshBuildTime: '2026-11-02T07:00:00Z', dshUncensored: {
    version: '0.1.0', upstreamVersion: '0.2.2-alpha.2',
    rea: { version: '6.8.0', commit: '160d821ac9a0', commitTime: '2026-10-25T08:35:15Z', repository: 'https://github.com/morluto/rea' },
  } }, '0.1.0', zh)
  for (const text of ['WaterRun', 'REA 6.8.0', '160d821ac9a0', 'https://github.com/morluto/rea', '2026-11-02T07:00:00Z']) {
    expect(result).toContain(text)
  }
})

it('identifies missing build facts instead of presenting invented version data', () => {
  expect(desktopAboutDetails({}, '0.2.1', zh)).toContain('未记录')
})

it('shows the sealed calendar build instead of the source product baseline', () => {
  const result = desktopAboutDetails({ dshDisplayVersion: '2026.11.14.2', dshUncensored: { version: '2026.1114.1', upstreamVersion: '0.2.2-rc.3' } }, '2026.1114.2', zh)
  expect(result).toContain('Uncensored 2026.11.14.2')
  expect(result).not.toContain('2026.1114.1')
  expect(result).toContain('DeepSeek Harness 0.2.2-rc.3')
})
