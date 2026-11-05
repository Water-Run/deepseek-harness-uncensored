/** Target-pinned SSH routing through real disposable CONNECT peers. @module */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import TargetProtection, { type TargetRule, type TargetRuleId } from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { targetSchema } from '../../src/schemas.ts'
import { harness } from './fixture.ts'
import { proxyFixture } from './proxy.ts'

async function setup(options: Parameters<typeof proxyFixture>[0] = {}) {
  const h = await harness({ handle: async (method, params) => {
    if (method === 'fs.resolve') {
      const input = z.object({ path: z.string() }).parse(params)
      return { targetKey: input.path, displayPath: input.path }
    }
    if (method === 'fs.readText') return 'preserved'
    throw new Error('Unexpected remote mutation')
  } })
  const proxy = await proxyFixture(options)
  const hosts = join(h.root, 'hosts')
  await writeFile(hosts, '127.0.0.1 ssh.fixture.test\n')
  const protection = await h.ctx.plugin(TargetProtection, { path: join(h.root, 'rules.sqlite'), hostsFile: hosts })
  const rule = (overrides: Partial<TargetRule> = {}): TargetRule => ({
    id: brandString<TargetRuleId>(randomUUID()), name: 'SSH fixture', enabled: true, kind: 'server',
    match: 'host', address: 'ssh.fixture.test', port: h.config.port, environment: 'production', protection: 'audit', ...overrides,
  })
  const configure = async (rules: TargetRule[]) => {
    const current = await h.ctx.targetProtection.snapshot()
    await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules }, current.revision)
  }
  await configure([rule()])
  return { ...h, proxy, protection, rule, configure, config: { ...h.config, hostname: 'ssh.fixture.test', proxy: proxy.config } }
}

it('pins the literal target through the proxy and retains read-only file enforcement', async () => {
  const h = await setup()
  await h.ctx.plugin(ProtectedSsh, h.config)
  const target = await h.ctx.ssh.request('fs.resolve', { path: '/fixture/workspace/data' }, targetSchema)
  expect(await h.ctx.ssh.request('fs.readText', { target }, z.string())).toBe('preserved')
  await expect(h.ctx.ssh.request('fs.write', { target, content: 'changed', policy: { mode: 'danger-full-access', workspaceRoot: '/' } }, z.unknown()))
    .rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
  expect(h.requests).not.toContain('fs.write')
  expect(h.proxy.requests).toEqual([{ authority: `127.0.0.1:${h.config.port}`, authorization: undefined }])
  expect(h.connected()).toBe(1)
  const stale = h.ctx.ssh
  await h.protection.dispose()
  expect(h.requests).toContain('close')
  await vi.waitFor(() => { expect(h.proxy.open()).toBe(0) })
  await expect(stale.request('fs.readText', { target }, z.string())).rejects.toBeDefined()
})

it('denies a production target before contacting either proxy or SSH peer', async () => {
  const h = await setup()
  await h.configure([h.rule({ environment: 'test' }), h.rule({ protection: 'full' })])
  await expect(h.ctx.plugin(ProtectedSsh, h.config)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.proxy.connections()).toBe(0)
  expect(h.connected()).toBe(0)
})

it('cannot use a test hostname to bypass a protected address alias', async () => {
  const h = await setup()
  await h.configure([h.rule({ environment: 'test' }), h.rule({ address: '127.0.0.1', protection: 'full' })])
  await expect(h.ctx.plugin(ProtectedSsh, h.config)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.proxy.connections()).toBe(0)
  expect(h.connected()).toBe(0)
})

it.each([403, 407, 502])('never falls back to direct SSH after proxy HTTP %i', async (status) => {
  const h = await setup({ status })
  await expect(h.ctx.plugin(ProtectedSsh, h.config)).rejects.toMatchObject({ code: 'SSH_CONNECTION_FAILED' })
  expect(h.proxy.requests).toHaveLength(1)
  expect(h.connected()).toBe(0)
  await vi.waitFor(() => { expect(h.proxy.open()).toBe(0) })
})

it('resolves the separate proxy credential and still verifies the SSH host key', async () => {
  const password = randomUUID(), username = 'proxy-fixture'
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  const h = await setup({ authorization })
  const reference = credentialRef(`PROXY_${randomUUID().replaceAll('-', '_')}`)
  await h.ctx.credentials.set(reference, password)
  await expect(h.ctx.plugin(ProtectedSsh, { ...h.config, hostKeySha256: '0'.repeat(64),
    proxy: { ...h.config.proxy, username, passwordRef: reference } })).rejects.toMatchObject({ code: 'SSH_IDENTITY_MISMATCH' })
  expect(h.proxy.requests[0]?.authorization).toBe(authorization)
  expect(h.commands).toEqual([])
})

it('authenticates both the proxy and the pinned SSH peer with separate credentials', async () => {
  const password = randomUUID(), username = 'proxy-fixture'
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  const h = await setup({ authorization })
  const reference = credentialRef(`PROXY_${randomUUID().replaceAll('-', '_')}`)
  await h.ctx.credentials.set(reference, password)
  await h.ctx.plugin(ProtectedSsh, { ...h.config, proxy: { ...h.config.proxy, username, passwordRef: reference } })
  expect(h.proxy.requests[0]?.authorization).toBe(authorization)
  expect(h.requests).toContain('hello')
})

it('refuses a missing proxy credential before making a connection', async () => {
  const h = await setup()
  const reference = credentialRef(`PROXY_${randomUUID().replaceAll('-', '_')}`)
  await expect(h.ctx.plugin(ProtectedSsh, { ...h.config,
    proxy: { ...h.config.proxy, username: 'fixture', passwordRef: reference } }))
    .rejects.toMatchObject({ code: 'SSH_CREDENTIAL_UNAVAILABLE' })
  expect(h.proxy.connections()).toBe(0)
  expect(h.connected()).toBe(0)
})

it('closes a pending CONNECT when the rule owner is withdrawn', async () => {
  const h = await setup({ hold: true })
  const fiber = h.ctx.plugin(ProtectedSsh, h.config)
  await h.proxy.entered
  await h.protection.dispose()
  await fiber.await()
  await h.proxy.peerClosed
  expect(h.ctx.get('ssh')).toBeUndefined()
  expect(h.proxy.open()).toBe(0)
  expect(h.connected()).toBe(0)
})

it('rechecks rules after asynchronous proxy credential resolution', async () => {
  const h = await setup()
  const reference = credentialRef(`PROXY_${randomUUID().replaceAll('-', '_')}`)
  const entered = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  const original = h.ctx.credentials.resolve.bind(h.ctx.credentials)
  const spy = vi.spyOn(h.ctx.credentials, 'resolve').mockImplementation(async (name) => {
    if (name === reference) { entered.resolve(true); await release.promise; return { value: 'fixture-secret', source: 'fixture' } }
    return original(name)
  })
  const pending = Promise.resolve(h.ctx.plugin(ProtectedSsh, { ...h.config,
    proxy: { ...h.config.proxy, username: 'fixture', passwordRef: reference } }))
  const rejection = expect(pending).rejects.toBeDefined()
  try {
    await entered.promise
    await h.configure([h.rule({ protection: 'full' })])
  } finally { release.resolve(true); spy.mockRestore() }
  await rejection
  expect(h.proxy.connections()).toBe(0)
  expect(h.connected()).toBe(0)
})
