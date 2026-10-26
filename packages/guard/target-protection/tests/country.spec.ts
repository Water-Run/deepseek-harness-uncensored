/** Pinned real country data, freshness policy and independent-provider failure behavior. @module */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { CountryDatabase } from '../src/country.ts'
import { BUNDLED_COUNTRY_SOURCE } from '../src/country-source.ts'
import TargetCountryData from '../src/country-provider.ts'
import TargetProtection from '../src/index.ts'

const built = Date.parse(BUNDLED_COUNTRY_SOURCE.buildTime)
const fresh = built + 86400000
const options = { path: '', maxBytes: 33554432, maxAgeDays: 45 }
const roots: string[] = [], contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
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
  const result = await ctx.targetProtection.checkHttp({
    origin: 'https://fixture.cn', hostname: 'fixture.cn', port: 443, phase: 'before-resolution', route: 'direct',
  }, new AbortController().signal)
  expect(result).toMatchObject({ allowed: false, code: 'TARGET_MAINLAND_PROTECTED' })
})
