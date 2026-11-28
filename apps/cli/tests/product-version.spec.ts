import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { cliProductVersion } from '../src/product-version.ts'

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))

describe('CLI product version', () => {
  it.each([
    ['2026.11.28.0', '2026.11.28.0'],
    ['2026.1128.0', '2026.11.28.0'],
    ['2028.229.65535', '2028.02.29.65535'],
    ['0.1.0', '0.1.0'],
    ['0.1.0-test.20261113.5', '0.1.0-test.20261113.5'],
  ])('displays %s as %s', (version, expected) => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ dshProductVersion: version }))
    expect(cliProductVersion()).toBe(expected)
  })

  it.each(['2026.02.29.0', '2026.229.0', '2026.11.28.01', '2026.1128.65536', '0.1.0-', ''])(
    'rejects invalid product version %j', (version) => {
      vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ dshProductVersion: version }))
      expect(cliProductVersion).toThrow('invalid dshProductVersion')
    },
  )

  it.each([null, { version: '0.2.3-alpha.2' }, { dshProductVersion: 42 }])(
    'requires a product version string in the manifest', (metadata) => {
      vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(metadata))
      expect(cliProductVersion).toThrow('package.json must declare dshProductVersion')
    },
  )
})
