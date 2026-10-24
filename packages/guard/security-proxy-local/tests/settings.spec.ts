import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyPatch,
  assertUpstream,
  DEFAULT_SETTINGS,
  SettingsStore,
  SettingsValidationError,
} from '../src/settings.ts'

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-security-proxy-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('settings validation', () => {
  it('accepts a host and a port inside the TCP range', () => {
    expect(() => { assertUpstream('proxy.example.com', 8080) }).not.toThrow()
    expect(() => { assertUpstream('127.0.0.1', 65_535) }).not.toThrow()
  })

  it.each([
    ['', 8080],
    ['has space', 8080],
    ['proxy.example.com', 0],
    ['proxy.example.com', 70_000],
    ['proxy.example.com', 8.5],
  ])('rejects %s:%s', (host, port) => {
    expect(() => { assertUpstream(host, port) }).toThrow(SettingsValidationError)
  })

  it('requires a user name when authentication is enabled', () => {
    expect(() => applyPatch(DEFAULT_SETTINGS, { authEnabled: true })).toThrow(/user name/)
    expect(applyPatch(DEFAULT_SETTINGS, { authEnabled: true, username: 'ops' }).authEnabled).toBe(true)
  })

  it('rejects an unsupported protocol and out-of-range capture limits', () => {
    expect(() => applyPatch(DEFAULT_SETTINGS, { protocol: 'socks5' as 'http' })).toThrow(/protocol/)
    expect(() => applyPatch(DEFAULT_SETTINGS, { maxFlows: 0 })).toThrow(/maxFlows/)
    expect(() => applyPatch(DEFAULT_SETTINGS, { maxBodyBytes: 10 })).toThrow(/maxBodyBytes/)
    expect(() => applyPatch(DEFAULT_SETTINGS, { retentionMinutes: 0 })).toThrow(/retentionMinutes/)
  })

  it('keeps omitted fields and trims the host', () => {
    const next = applyPatch(DEFAULT_SETTINGS, { host: '  proxy.local  ', port: 3128 })
    expect(next.host).toBe('proxy.local')
    expect(next.port).toBe(3128)
    expect(next.maxFlows).toBe(DEFAULT_SETTINGS.maxFlows)
  })
})

describe('settings store', () => {
  it('creates defaults when the file is absent and persists a write', async () => {
    const path = join(await tempRoot(), 'nested', 'security-proxy.json')
    const store = await SettingsStore.open(path)
    expect(store.failure).toBeNull()
    expect(store.value.enabled).toBe(false)
    const next = applyPatch(store.value, { enabled: true, host: '127.0.0.1', port: 3128 })
    await store.write(next)
    const reopened = await SettingsStore.open(path)
    expect(reopened.value).toMatchObject({ enabled: true, host: '127.0.0.1', port: 3128 })
    const document = JSON.parse(await readFile(path, 'utf8')) as { version: number; settings: unknown }
    expect(document.version).toBe(1)
    expect(JSON.stringify(document)).not.toContain('password')
  })

  it('falls back to defaults and reports a malformed document', async () => {
    const path = join(await tempRoot(), 'security-proxy.json')
    await writeFile(path, '{"version":1,"settings":{"enabled":"yes"}}', 'utf8')
    const store = await SettingsStore.open(path)
    expect(store.value).toEqual(DEFAULT_SETTINGS)
    expect(store.failure).toMatch(/not a valid security proxy document/)
    // A later valid write clears the failure.
    await store.write(DEFAULT_SETTINGS)
    expect((await SettingsStore.open(path)).failure).toBeNull()
  })

  it('serializes concurrent writes so the last committed document wins', async () => {
    const path = join(await tempRoot(), 'security-proxy.json')
    const store = await SettingsStore.open(path)
    await Promise.all([
      store.write(applyPatch(store.value, { port: 3_128 })),
      store.write(applyPatch(store.value, { port: 8_080 })),
      store.write(applyPatch(store.value, { port: 9_090 })),
    ])
    const reopened = await SettingsStore.open(path)
    expect(reopened.value.port).toBe(9_090)
  })
})
