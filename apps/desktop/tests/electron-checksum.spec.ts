/** Cache reuse retains the checksum from the exact locked dependency and target. */
import { expect, it } from 'vitest'
import { electronArchiveChecksum } from '../scripts/electron-checksum.ts'

const name = 'electron-v44.7.0-win32-x64.zip'
const hash = 'a'.repeat(64)
const target = { platform: 'win32', arch: 'x64' }
it('selects only the matching archive from the bundled checksum list', () => {
  expect(electronArchiveChecksum('44.7.0', target, {
    [name]: hash, 'electron-v44.7.0-darwin-arm64.zip': 'b'.repeat(64),
  })).toEqual({ [name]: hash })
})
it.each([null, [], {}, { [name]: 1 }, { [name]: 'a'.repeat(63) }, { [name]: 'g'.repeat(64) }])(
  'rejects missing or malformed checksums without a network fallback', (value) => {
    expect(() => electronArchiveChecksum('44.7.0', target, value)).toThrow('no valid SHA-256')
  },
)
it('does not reuse checksums from a different version or architecture', () => {
  expect(() => electronArchiveChecksum('44.7.1', target, { [name]: hash })).toThrow('44.7.1-win32-x64.zip')
  expect(() => electronArchiveChecksum('44.7.0', { ...target, arch: 'arm64' }, { [name]: hash })).toThrow('44.7.0-win32-arm64.zip')
})
