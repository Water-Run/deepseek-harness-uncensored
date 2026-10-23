import { expect, it } from 'vitest'
import { desktopAboutDetails } from '../src/about.ts'
import { zh } from '../src/locale.ts'

it('shows fork version, upstream version, commit and time from the installed build', () => {
  const result = desktopAboutDetails({ dshUncensored: { version: '1.0.0', upstreamVersion: '0.2.1' }, dshBuildCommit: 'abcd123', dshBuildDate: '2026-10-23T08:00:00Z' }, '0.2.1', zh)
  expect(result).toContain('Uncensored 1.0.0')
  expect(result).toContain('DSH 0.2.1')
  expect(result).toContain('abcd123')
  expect(result).toContain('2026-10-23T08:00:00Z')
  expect(result).toContain('GPL-3.0-or-later')
})

it('identifies missing build facts instead of presenting invented version data', () => {
  expect(desktopAboutDetails({}, '0.2.1', zh)).toContain('未记录')
})
