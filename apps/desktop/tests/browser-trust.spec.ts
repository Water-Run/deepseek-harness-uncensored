import type { Request, Session } from 'electron'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installBrowserProxyTrust, parseBrowserProxyCa } from '../src/browser-trust.ts'

const certificates = JSON.parse(readFileSync(new URL('./fixtures/sidebar-browser-certificates.json', import.meta.url), 'utf8')) as {
  readonly root: string
  readonly other: string
  readonly leaf: string
}

const now = Date.parse('2026-07-01T00:00:00Z')
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now) })
afterEach(() => { vi.restoreAllMocks() })

function verifier(root: string) {
  const setCertificateVerifyProc = vi.fn<Session['setCertificateVerifyProc']>()
  installBrowserProxyTrust({ setCertificateVerifyProc }, parseBrowserProxyCa(root))
  const verify = setCertificateVerifyProc.mock.calls[0]?.[0]
  if (verify == null) throw new Error('Expected a scoped certificate verifier')
  return (hostname: string, errorCode = -202, data = certificates.leaf) => {
    const result = vi.fn<(code: number) => void>()
    verify({ hostname, errorCode, certificate: { data } } as Request, result)
    expect(result).toHaveBeenCalledExactlyOnceWith(expect.any(Number))
    return result.mock.calls[0]?.[0]
  }
}

it('accepts only the exact SAN from the listener CA when Chromium rejects the authority', () => {
  const verify = verifier(certificates.root)
  expect(verify('origin.test')).toBe(0)
  expect(verify('127.0.0.1')).toBe(0)
  expect(verify('other.test')).toBe(-3)
  expect(verify('origin.test', -201)).toBe(-3)
  expect(verify('origin.test', 0)).toBe(-3)
  expect(verify('origin.test', -202, 'invalid PEM')).toBe(-3)
})

it('retains Chromium rejection for another CA with the same subject and for expired trust', () => {
  expect(verifier(certificates.other)('origin.test')).toBe(-3)
  const verify = verifier(certificates.root)
  vi.mocked(Date.now).mockReturnValue(Date.parse('2027-01-02T00:00:00Z'))
  expect(verify('origin.test')).toBe(-3)
  expect(() => parseBrowserProxyCa(certificates.root)).toThrow('invalid or expired')
})
