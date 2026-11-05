/** Pinned real country data, freshness policy and independent-provider failure behavior. @module */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { gzipSync, gunzipSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { fetch, Response } from 'undici'
import { CountryDatabase } from '../src/country.ts'
import { BUNDLED_COUNTRY_SOURCE } from '../src/country-source.ts'
import TargetCountryData from '../src/country-provider.ts'
import TargetProtection from '../src/index.ts'
import { downloadCountry } from '../src/country-download.ts'

vi.mock('undici', async original => ({ ...await original<typeof import('undici')>(), fetch: vi.fn() }))

const built = Date.parse(BUNDLED_COUNTRY_SOURCE.buildTime)
const fresh = built + 86400000
const options = { path: '', maxBytes: 33554432, maxAgeDays: 45 }
const roots: string[] = [], contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function newerFixture() {
  const source = await readFile(new URL(`../assets/${BUNDLED_COUNTRY_SOURCE.filename}`, import.meta.url))
  const bytes = gunzipSync(source), epoch = Buffer.alloc(4)
  epoch.writeUInt32BE(built / 1000)
  const metadata = bytes.lastIndexOf('build_epoch')
  const offset = bytes.indexOf(epoch, metadata)
  if (metadata < 0 || offset < metadata || offset > metadata + 32) throw new Error('Missing fixture build epoch')
  bytes.writeUInt32BE(fresh / 1000, offset)
  return { source, next: gzipSync(bytes) }
}

it('publishes a validated update, cancels old decisions and reopens the last valid archive', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(fresh + 86400000)
  const root = await mkdtemp(join(tmpdir(), 'dshu-country-update-')); roots.push(root)
  const ctx = new Context(); contexts.push(ctx)
  const { source, next } = await newerFixture()
  const request = vi.mocked(fetch).mockReset().mockResolvedValueOnce(new Response(new Uint8Array(next)))
  await ctx.plugin(TargetProtection, { path: ':memory:', hostsFile: '' })
  const owner = await ctx.plugin(TargetCountryData, { cacheDirectory: root })
  const oldSignal = ctx.targetProtection.executionSignal()
  const old = ctx.targetCountryData.status()
  const signal = new AbortController().signal
  const updated = await ctx.targetCountryData.update(signal)
  expect(request).toHaveBeenCalledWith('https://download.db-ip.com/free/dbip-country-lite-2026-10.mmdb.gz',
    expect.objectContaining({ redirect: 'error' }))
  expect(updated).toMatchObject({ state: 'ready', builtAt: new Date(fresh).toISOString(), bundled: false })
  expect(updated.sha256).not.toBe(old.sha256)
  expect(oldSignal.aborted).toBe(true)
  const path = join(root, 'dbip-country-lite.mmdb.gz')
  expect((await readFile(path)).equals(next)).toBe(true)
  expect((await ctx.targetProtection.checkLocalFile(path, 'mutate', signal)).decision)
    .toMatchObject({ allowed: false, code: 'TARGET_OWNER_RESOURCE' })
  request.mockResolvedValueOnce(new Response(new Uint8Array(source)))
  expect(await ctx.targetCountryData.update(signal)).toEqual(updated)
  request.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
  await expect(ctx.targetCountryData.update(signal)).rejects.toMatchObject({ code: 'unavailable' })
  expect(ctx.targetCountryData.status()).toEqual(updated)
  expect((await readFile(path)).equals(next)).toBe(true)
  const started = Promise.withResolvers<undefined>(), caller = new AbortController()
  request.mockImplementationOnce(async (_url, options) => {
    const downloading = options?.signal
    if (downloading == null) throw new Error('Country download has no cancellation signal')
    return await new Promise<Response>((_resolve, reject) => {
      downloading.addEventListener('abort', () => reject(downloading.reason), { once: true })
      started.resolve(undefined)
    })
  })
  const cancelled = ctx.targetCountryData.update(caller.signal).catch((error: unknown) => error)
  await started.promise
  await expect(ctx.targetCountryData.update(signal)).rejects.toMatchObject({ code: 'busy' })
  caller.abort()
  expect(await cancelled).toBe(caller.signal.reason)
  expect((await readFile(path)).equals(next)).toBe(true)
  await owner.dispose()
  await ctx.plugin(TargetCountryData, { cacheDirectory: root })
  expect(ctx.targetCountryData.status()).toEqual(updated)
  expect(ctx.targetCountryData.mainland(['114.114.114.114'])).toBe('yes')
})

it('tries the previous month only after a 404 and bounds an undeclared response length', async () => {
  const request = vi.mocked(fetch).mockReset().mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
  const signal = new AbortController().signal
  await expect(downloadCountry(Date.UTC(2026, 10, 1), 2, signal)).rejects.toMatchObject({ code: 'unavailable' })
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    'https://download.db-ip.com/free/dbip-country-lite-2026-11.mmdb.gz',
    'https://download.db-ip.com/free/dbip-country-lite-2026-10.mmdb.gz',
  ])
})

it('checks the bundled bytes and classifies actual IPv4, IPv6 and mapped records offline', async () => {
  const country = await CountryDatabase.open(options, new AbortController().signal)
  expect(country.status(fresh)).toMatchObject({ state: 'ready', sha256: BUNDLED_COUNTRY_SOURCE.sha256, bundled: true,
    attributionUrl: 'https://db-ip.com', builtAt: BUNDLED_COUNTRY_SOURCE.buildTime })
  expect(country.mainland(['114.114.114.114'], fresh)).toBe('yes')
  expect(country.mainland(['::ffff:114.114.114.114'], fresh)).toBe('yes')
  expect(country.mainland(['2400:3200::1'], fresh)).toBe('yes')
  expect(country.mainland(['8.8.8.8', '2001:4860:4860::8888'], fresh)).toBe('no')
  expect(country.mainland(['10.0.0.1'], fresh)).toBe('unknown')
  expect(country.mainland(['8.8.8.8', '10.0.0.1'], fresh)).toBe('unknown')
  expect(country.mainland(['10.0.0.1', '114.114.114.114'], fresh)).toBe('yes')
})

it('does not use expired or future data as evidence of an outside destination', async () => {
  const country = await CountryDatabase.open(options, new AbortController().signal)
  expect(country.status(built - 1).state).toBe('future')
  expect(country.mainland(['8.8.8.8'], built - 1)).toBe('unknown')
  expect(country.status(built + 46 * 86400000).state).toBe('expired')
  expect(country.mainland(['8.8.8.8'], built + 46 * 86400000)).toBe('unknown')
  expect(country.mainland([], fresh)).toBe('unknown')
})

it('rejects oversized, damaged and cancelled acquisition without a permissive reader', async () => {
  await expect(CountryDatabase.open({ ...options, maxBytes: 1024 }, new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
  const root = await mkdtemp(join(tmpdir(), 'dshu-country-')); roots.push(root)
  const path = join(root, 'broken.mmdb')
  await writeFile(path, 'not an MMDB')
  await expect(CountryDatabase.open({ ...options, path }, new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
  await expect(CountryDatabase.open(options, AbortSignal.abort())).rejects.toMatchObject({ code: 'unavailable' })
})

it('uses fresh country evidence at admission and loses permission when the source unloads', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(fresh)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(TargetProtection, { path: ':memory:' })
  await ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, 1)
  const data = ctx.plugin(TargetCountryData)
  await data
  expect(ctx.targetCountryData.status().state).toBe('ready')
  const request = (ip: string) => ctx.targetProtection.checkHttp({
    origin: `https://${ip}`, hostname: ip, port: 443, phase: 'before-connect', route: 'direct',
    addresses: [{ address: ip, family: 4 }],
  }, new AbortController().signal)
  expect((await request('114.114.114.114'))).toMatchObject({ allowed: false, code: 'TARGET_MAINLAND_PROTECTED' })
  expect((await request('8.8.8.8')).allowed).toBe(true)
  expect(await ctx.targetProtection.checkHttp({
    origin: 'https://nat64.test', hostname: 'nat64.test', port: 443, phase: 'before-connect', route: 'direct',
    addresses: [{ address: '2001:4860:64:64::7272:7272', family: 6, translatedIpv4: '114.114.114.114' }],
  }, new AbortController().signal)).toMatchObject({ allowed: false, code: 'TARGET_MAINLAND_PROTECTED' })
  const generation = ctx.targetProtection.executionSignal()
  await data.dispose()
  expect(generation.aborted).toBe(true)
  expect(ctx.targetProtection.executionSignal().aborted).toBe(false)
  expect((await request('8.8.8.8'))).toMatchObject({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED' })
  expect(ctx.get('targetProtection')).toBeDefined()
})

it('uses a mainland domain label even when country data is unavailable', async () => {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(TargetProtection, { path: ':memory:' })
  await ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, 1)
  const result = await ctx.targetProtection.checkHttp({
    origin: 'https://fixture.cn', hostname: 'fixture.cn', port: 443, phase: 'before-resolution', route: 'direct',
  }, new AbortController().signal)
  expect(result).toMatchObject({ allowed: false, code: 'TARGET_MAINLAND_PROTECTED' })
})
