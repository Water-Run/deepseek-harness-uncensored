/** Remote mount coordinates include bind roots and the underlying device. @module */
import { expect, it } from 'vitest'
import { mountPathMatches, parseMountInfo } from '../../src/remote-file-policy.ts'

const mounts = parseMountInfo([
  '1 0 8:1 / / rw - ext4 /dev/root rw',
  '2 1 8:1 /production/sub /work/bound\\040tree rw - ext4 /dev/root rw',
  '3 1 8:2 / /production/mounted rw - ext4 /dev/other rw',
  '4 1 8:2 /db /work/other rw - ext4 /dev/other rw',
  '5 1 8:3 /production/sub /work/unrelated rw - ext4 /dev/third rw',
].join('\n'))

it('matches bind subtrees and nested mounts without conflating devices or path prefixes', () => {
  expect(mountPathMatches('/production', '/work/bound tree/new.txt', mounts, false)).toBe(true)
  expect(mountPathMatches('/production', '/work/other/example.db', mounts, false)).toBe(true)
  expect(mountPathMatches('/production', '/work/unrelated/example.db', mounts, false)).toBe(false)
  expect(mountPathMatches('/production', '/production2/file', mounts, false)).toBe(false)
  expect(mountPathMatches('/production/sub/database', '/work', mounts, true)).toBe(true)
  expect(mountPathMatches('/production/sub/database', '/work', mounts, false)).toBe(false)
})

it('refuses mount tables with no root or an ambiguous covering mount', () => {
  expect(() => parseMountInfo('2 1 8:1 /production /work rw - ext4 /dev/root rw'))
    .toThrow(expect.objectContaining({ code: 'TARGET_IDENTITY_UNVERIFIED' }))
  const stacked = [...mounts, { device: '8:3', root: '/', point: '/work/other' }]
  expect(() => mountPathMatches('/production', '/work/other/file', stacked, false))
    .toThrow(expect.objectContaining({ code: 'TARGET_IDENTITY_UNVERIFIED' }))
})
