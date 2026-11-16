import { afterEach, expect, it, vi } from 'vitest'
import { assertForkReleaseUrl, classifyReleases, FORK_RELEASES_URL, loadForkRelease } from '../src/client/release-status.ts'

const release = (version: string, prerelease = false) => ({ version, prerelease, url: `https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/${version}` })
afterEach(() => { vi.useRealTimers() })

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
  expect(classifyReleases('0.1.0', [release('0.2.0-rc.1', true)])).toMatchObject({ phase: 'unpublished', message: 'no-release' })
  expect(classifyReleases('0.2.0-rc.1', [release('0.2.0-rc.2', true)])).toMatchObject({ phase: 'available', severity: 'patch' })
  expect(classifyReleases('dev', [])).toMatchObject({ phase: 'failed', message: 'unrecorded-version' })
  expect(classifyReleases('0.1.0+local', [release('desktop-v0.2.0')])).toMatchObject({ severity: 'minor' })
  expect(classifyReleases('0.2.0-rc.9', [release('v0.2.0-rc.10', true)])).toMatchObject({ phase: 'available' })
})

it('keeps a failed or offline check from looking current', async () => {
  const failed = await loadForkRelease(async () => new Response('missing', { status: 404 }), '0.1.0', { timeoutMs: 1000 })
  expect(failed.phase).toBe('failed')
  const offline = await loadForkRelease(async () => { throw new TypeError('Failed to fetch') }, '0.1.0', { timeoutMs: 1000 })
  expect(offline.phase).toBe('offline')
})

it.each([403, 429])('retains the primary rate limit deadline for HTTP %i', async (status) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
  const retryAt = Date.now() + 3600_000
  expect(await loadForkRelease(async () => new Response(null, { status, headers: {
    'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(retryAt / 1000),
  } }), '2026.11.16.3', { timeoutMs: 1000 })).toEqual({ phase: 'failed', message: 'rate-limited', retryAt })
})

it('honors the later deadline when primary and secondary rate limits overlap', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
  const retryAt = Date.now() + 3600_000
  expect(await loadForkRelease(async () => new Response(null, { status: 403, headers: {
    'retry-after': '90', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(retryAt / 1000),
  } }), '2026.11.16.3', { timeoutMs: 1000 })).toMatchObject({ message: 'rate-limited', retryAt })
})

it('recognizes a secondary rate limit without an exhausted primary allowance', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
  expect(await loadForkRelease(async () => new Response(null, { status: 403, headers: {
    'retry-after': '90', 'x-ratelimit-remaining': '57',
  } }), '2026.11.16.3', { timeoutMs: 1000 })).toEqual({ phase: 'failed', message: 'rate-limited', retryAt: Date.now() + 90_000 })
})

it.each(['-1', '1.5', 'Infinity', 'invalid', '8640000000001'])('uses GitHub fallback waiting for an unusable retry deadline: %s', async (value) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
  expect(await loadForkRelease(async () => new Response(null, { status: 429, headers: {
    'retry-after': value, 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': value,
  } }), '2026.11.16.3', { timeoutMs: 1000 })).toEqual({ phase: 'failed', message: 'rate-limited', retryAt: Date.now() + 60_000 })
})

it('does not infer a rate limit from a bare forbidden response', async () => {
  expect(await loadForkRelease(async () => new Response(null, { status: 403 }), '2026.11.16.3', { timeoutMs: 1000 }))
    .toEqual({ phase: 'failed', message: 'http-403' })
})

it('never retries a rate-limited request automatically', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 429 }))
  const result = await loadForkRelease(fetcher, '2026.11.16.3', { timeoutMs: 1000 })
  expect(result).toMatchObject({ phase: 'failed', message: 'rate-limited' })
  await vi.advanceTimersByTimeAsync(120_000)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it.each([
  'http://api.github.com/repos/Water-Run/deepseek-harness-uncensored/releases',
  'https://api.github.com/repos/Water-Run/deepseek-harness-uncensored/releases-other',
  'https://user:pass@api.github.com/repos/Water-Run/deepseek-harness-uncensored/releases',
])('rejects a changed API destination %s', (url) => { expect(() => { assertForkReleaseUrl(url) }).toThrow() })

it('validates release links and does not call a truncated release list current', async () => {
  const body = [{ tag_name: '0.1.0', prerelease: false, draft: false, html_url: release('0.1.0').url }]
  expect(await loadForkRelease(async () => Response.json(body), '0.1.0', { timeoutMs: 1000 })).toMatchObject({ phase: 'latest' })
  expect(await loadForkRelease(async () => Response.json(body, { headers: { link: '<https://elsewhere.invalid/>; rel="next"' } }), '0.1.0', { timeoutMs: 1000 })).toMatchObject({ phase: 'failed' })
  expect(await loadForkRelease(async () => Response.json([{ ...body[0], html_url: 'https://elsewhere.invalid/release' }]), '0.1.0', { timeoutMs: 1000 })).toMatchObject({ phase: 'failed' })
  expect(await loadForkRelease(async () => Response.json([{ ...body[0], draft: true, tag_name: '1.0.0' }]), '0.1.0', { timeoutMs: 1000 })).toMatchObject({ phase: 'unpublished', message: 'no-release' })
})

it('follows validated release pages and rejects a pagination loop', async () => {
  const next = `${FORK_RELEASES_URL}&page=2`
  const fetcher = vi.fn<typeof fetch>(async url => url === next
    ? Response.json([{ tag_name: 'desktop-v1.0.0', html_url: release('desktop-v1.0.0').url, prerelease: false }])
    : Response.json([], { headers: { link: `<${next}>; rel="next"` } }))
  expect(await loadForkRelease(fetcher, '0.1.0', { timeoutMs: 1000 })).toMatchObject({ phase: 'available', severity: 'major' })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(await loadForkRelease(async () => Response.json([], { headers: { link: `<${FORK_RELEASES_URL}>; rel="next"` } }), '0.1.0', { timeoutMs: 1000 })).toMatchObject({ phase: 'failed', message: 'repeated-release-page' })
})

it('ends a hung request at its deadline', async () => {
  vi.useFakeTimers()
  const pending = loadForkRelease(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { reject(new DOMException('Request aborted', 'AbortError')) }, { once: true })
  }), '0.1.0', { timeoutMs: 100 })
  await vi.advanceTimersByTimeAsync(100)
  expect(await pending).toMatchObject({ phase: 'failed', message: 'timeout' })
})

it('orders calendar tags numerically and presents ordinary date updates without semantic-version warnings', () => {
  expect(classifyReleases('2026.11.14.9', [release('dshu-2026.11.14.10'), release('2026.11.14.2')]))
    .toMatchObject({ phase: 'available', severity: 'patch', version: '2026.11.14.10' })
  expect(classifyReleases('2026.1231.5', [release('v2027.01.01.1')]))
    .toMatchObject({ phase: 'available', severity: 'patch', version: '2027.01.01.1' })
  expect(classifyReleases('0.1.0-test.20261113.5', [release('2026.11.14.1')]).phase).toBe('available')
  expect(classifyReleases('2026.11.14.10', [release('2026.1114.10')]).phase).toBe('latest')
  expect(classifyReleases('2026.11.14.1', [release('2026.02.30.99')]).phase).toBe('unpublished')
})
