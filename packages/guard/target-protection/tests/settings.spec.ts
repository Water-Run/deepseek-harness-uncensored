/** Owner settings change the actual network rule registry and report verified route availability. @module */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import type { PeerId, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import Web from '@deepseek-ai/dsh-web'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import Protection from '../src/index.ts'
import Settings from '../src/settings.ts'
import * as Http from '../src/http.ts'
import * as Proxy from '../src/security-proxy.ts'
import Country from '../src/country-provider.ts'
import { BUNDLED_COUNTRY_SOURCE } from '../src/country-source.ts'
import type { TargetRuleId } from '../src/types.ts'

it('exposes owner-only, revisioned rules and tracks the actual guarded providers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-target-settings-'))
  const ctx = new Context(), caller = new AbortController()
  const server = createServer()
  let connected = 0
  server.on('connection', (socket) => { connected++; socket.destroy() })
  try {
    await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Missing protected listener')
    const invocation: RemoteInvocation = {
      request: { namespace: 'targetProtectionSettings', method: 'configure', args: {} }, service: 'targetProtectionSettings',
      peer: { id: brandString<PeerId>('settings-owner'), ctx, principal: { kind: 'owner' }, interactions: 'none',
        signal: new AbortController().signal, dispose: async () => {} },
      signal: caller.signal, uplink: async function *<In>(): AsyncIterable<In> {},
    }
    await ctx.plugin(Credentials, { path: join(root, 'credentials.yaml'), dshHome: root, watch: false })
    await ctx.plugin(Web)
    await ctx.plugin(Protection, { path: join(root, 'rules.sqlite'), hostsFile: '' })
    await ctx.plugin(Settings)
    const changed = vi.fn()
    const settingsChanged = vi.fn()
    ctx.on('security-protection/changed', changed)
    ctx.on('target-protection/status-changed', settingsChanged)
    const owner = ctx.extend({ invocation }).targetProtectionSettings
    const unmounted = owner.get()
    expect(unmounted).toMatchObject({ protection: { state: 'unavailable' }, routes: { webFetch: false, independentProxy: false } })
    expect(owner.auditHistory()).toEqual({ state: 'off', entries: [] })
    expect(() => ctx.targetProtectionSettings.auditHistory()).toThrow(expect.objectContaining({ code: 'target-protection/owner-required' }))
    expect(() => ctx.targetProtectionSettings.get()).toThrow(expect.objectContaining({ code: 'target-protection/owner-required' }))
    await expect(ctx.targetProtectionSettings.updateCountry()).rejects.toMatchObject({ code: 'target-protection/owner-required' })
    await ctx.plugin(Http)
    const partial = owner.get()
    expect(partial).toMatchObject({ protection: { state: 'unavailable' }, routes: { webFetch: true, independentProxy: false } })
    expect(partial.protection.revision).toBeGreaterThan(unmounted.protection.revision)
    expect(settingsChanged).toHaveBeenCalled()
    await expect(owner.configure({ expectedRevision: partial.snapshot.revision, preferences: partial.snapshot.preferences }))
      .rejects.toMatchObject({ code: 'target-protection/unavailable' })
    const proxy = await ctx.plugin(Proxy, { path: join(root, 'proxy.json') })
    expect(owner.get().protection.state).toBe('disabled')
    const before = owner.get()
    const preferences = { mainlandEnabled: true, rules: [{
      id: brandString<TargetRuleId>('b8888888-8888-4888-8888-888888888888'), name: 'protected listener', enabled: true,
      kind: 'server' as const, environment: 'production' as const, protection: 'full' as const,
      match: 'host' as const, address: '127.0.0.1', port: address.port,
    }] }
    const update = { expectedRevision: before.snapshot.revision, preferences }
    await expect(ctx.targetProtectionSettings.configure(update)).rejects.toMatchObject({ code: 'target-protection/owner-required' })
    const updated = await owner.configure(update)
    expect(updated.snapshot.revision).toBe(2)
    expect(updated.protection).toMatchObject({ state: 'unavailable', capabilities: ['target-rules'] })
    expect(updated.protection.revision).toBeGreaterThan(before.protection.revision)
    await expect(owner.configure(update)).rejects.toMatchObject({ code: 'target-protection/conflict' })
    await expect(ctx.web.fetch({ url: `http://127.0.0.1:${address.port}` })).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
    expect(connected).toBe(0)
    expect(changed).toHaveBeenCalled()
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(BUNDLED_COUNTRY_SOURCE.buildTime) + 86_400_000)
    try {
      await ctx.plugin(Country)
      const enabled = owner.get()
      expect(enabled.protection).toMatchObject({ state: 'enabled', capabilities: ['mainland-domains', 'target-rules'] })
      expect(enabled.country).toMatchObject({ state: 'ready', attributionUrl: 'https://db-ip.com' })
      now.mockReturnValue(Date.parse(BUNDLED_COUNTRY_SOURCE.buildTime) + 46 * 86_400_000)
      expect(owner.get().protection.state).toBe('unavailable')
      await proxy.dispose()
      expect(owner.get()).toMatchObject({ protection: { capabilities: [] }, routes: { webFetch: true, independentProxy: false } })
      await expect(owner.configure({ ...update, expectedRevision: 2 })).rejects.toMatchObject({ code: 'target-protection/unavailable' })
    } finally { now.mockRestore() }
    caller.abort()
    await expect(owner.configure({ ...update, expectedRevision: 2 })).rejects.toBe(caller.signal.reason)
    expect((await ctx.targetProtection.snapshot()).revision).toBe(2)
  } finally {
    await ctx.fiber.dispose()
    if (server.listening) await new Promise<void>((accept) => { server.close(() => { accept() }) })
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
})
