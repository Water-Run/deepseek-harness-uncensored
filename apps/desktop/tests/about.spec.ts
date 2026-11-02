import { expect, it } from 'vitest'
import { desktopAboutDetails } from '../src/about.ts'
import { zh } from '../src/locale.ts'

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
