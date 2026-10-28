/** Explicit connection resolution preserves target aliases without weakening anonymous fetch policy. @module */
import { expect, it, vi } from 'vitest'
import { resolveConnectionAddresses, resolvePublicAddresses } from '../src/network.ts'

it('retains private addresses only for the explicit connection API', async () => {
  const signal = new AbortController().signal, resolver = vi.fn(async () => [{ address: '10.0.0.12', family: 4 }])
  expect(await resolveConnectionAddresses('owned.test', signal, resolver)).toEqual([{ address: '10.0.0.12', family: 4 }])
  await expect(resolvePublicAddresses('owned.test', signal, resolver)).rejects.toMatchObject({ code: 'WEB_BLOCKED_URL' })
})

it('supports an explicit IPv6 loopback without requiring external DNS', async () => {
  const resolver = vi.fn(async () => { throw new Error('No external resolver in this fixture') })
  expect(await resolveConnectionAddresses('::1', new AbortController().signal, resolver)).toEqual([{ address: '::1', family: 6 }])
  expect(resolver).not.toHaveBeenCalled()
})

it('retains well-known and discovered NAT64 aliases for production rule matching', async () => {
  const signal = new AbortController().signal
  expect(await resolveConnectionAddresses('64:ff9b::c000:20a', signal, async () => [{ address: '192.0.0.170', family: 4 }]))
    .toEqual([{ address: '64:ff9b::c000:20a', family: 6, translatedIpv4: '192.0.2.10' }])
  const resolver = async (host: string) => host === 'ipv4only.arpa'
    ? [{ address: '2001:4860:64:64::c000:aa', family: 6 }]
    : [{ address: '2001:4860:64:64::a00:c', family: 6 }]
  expect(await resolveConnectionAddresses('owned.test', signal, resolver))
    .toEqual([{ address: '2001:4860:64:64::a00:c', family: 6, translatedIpv4: '10.0.0.12' }])
})

it.each(['64:ff9b:1::1', '2002:c000:020a::1', '2001:0::1'])('refuses an unverified translation %s', async (address) => {
  await expect(resolveConnectionAddresses(address, new AbortController().signal, async () => [{ address: '192.0.0.170', family: 4 }]))
    .rejects.toMatchObject({ code: 'WEB_BLOCKED_URL' })
})
