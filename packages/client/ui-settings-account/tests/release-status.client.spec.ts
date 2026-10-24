import { expect, it } from 'vitest'
import { assertForkReleaseUrl, classifyReleases, FORK_RELEASES_URL, loadForkRelease } from '../src/client/release-status.ts'

const release = (version: string, prerelease = false) => ({ version, prerelease, url: `https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/${version}` })

it('rejects official and object-storage update hosts', () => {
  expect(() => { assertForkReleaseUrl('https://download.deepseek.com/dsh-desk/feeds/win-x64/') }).toThrow(/official DeepSeek/u)
  expect(() => { assertForkReleaseUrl('https://bucket.cos.ap-beijing.myqcloud.com/feed') }).toThrow(/official DeepSeek/u)
  expect(() => { assertForkReleaseUrl(FORK_RELEASES_URL) }).not.toThrow()
})

it('distinguishes latest, severity, prerelease, and a missing feed', () => {
  expect(classifyReleases('0.1.0', [release('0.1.0')]).phase).toBe('latest')
  expect(classifyReleases('0.1.0', [release('0.1.1')])).toMatchObject({ phase: 'available', severity: 'patch' })
  expect(classifyReleases('0.1.0', [release('0.2.0')])).toMatchObject({ severity: 'minor' })
  expect(classifyReleases('0.1.0', [release('1.0.0')])).toMatchObject({ severity: 'major' })
  expect(classifyReleases('0.1.0', [release('0.2.0-rc.1', true)])).toMatchObject({ phase: 'failed', message: 'no-release' })
  expect(classifyReleases('0.2.0-rc.1', [release('0.2.0-rc.2', true)])).toMatchObject({ phase: 'available', severity: 'patch' })
  expect(classifyReleases('dev', [])).toMatchObject({ phase: 'failed', message: 'unrecorded-version' })
})

it('keeps a failed or offline check from looking current', async () => {
  const failed = await loadForkRelease(async () => new Response('missing', { status: 404 }), '0.1.0')
  expect(failed.phase).toBe('failed')
  const offline = await loadForkRelease(async () => { throw new TypeError('Failed to fetch') }, '0.1.0')
  expect(offline.phase).toBe('offline')
})
