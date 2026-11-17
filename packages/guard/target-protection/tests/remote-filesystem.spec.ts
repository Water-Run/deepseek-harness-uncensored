/** Central mappings admit only acknowledged, current remote filesystem execution. @module */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { resolve } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import TargetProtection, { type TargetRuleId } from '../src/index.ts'
import { resolveSshFileMappings, sshFileMappings } from '../src/ssh-file-mapping.ts'

const id = brandString<TargetRuleId>('3e10f725-5a0d-43da-9597-f661f0dccfb1')
const other = brandString<TargetRuleId>('fd897b7b-1b7e-4cd0-9b8d-06b354062d91')
const signal = new AbortController().signal

async function setup() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(TargetProtection, { path: ':memory:', hostsFile: '' })
  const protection = ctx.targetProtection
  const before = await protection.snapshot()
  const snapshot = await protection.configure({ mainlandEnabled: false, rules: [
    { id, name: 'central production root', enabled: true, kind: 'server', match: 'path', address: resolve('owner/production'),
      environment: 'production', protection: 'full' },
  ] }, before.revision)
  const resolution = await protection.resolveConnectionTarget('127.0.0.1', signal)
  const binding = { revision: snapshot.revision, ruleIds: [id], hostname: '127.0.0.1', port: 22, resolution, signal }
  return { ctx, protection, snapshot, resolution, binding }
}

it('requires helper acknowledgement and keeps ordinary connection checks unresolved', async () => {
  const h = await setup()
  const policy = h.protection.bindRemoteFilesystem(h.binding)
  await expect(policy.checkHelper(signal)).resolves.toMatchObject({ allowed: true })
  await expect(policy.checkFile('observe', signal)).rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
  policy.activate()
  await expect(policy.checkFile('observe', signal)).resolves.toMatchObject({ allowed: true })
  await expect(h.protection.checkConnection('127.0.0.1', 22, h.resolution, 'filesystem', 'observe', signal))
    .resolves.toMatchObject({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: [id] })
})

it('does not exempt another production path and does not accept foreign resource IDs', async () => {
  const h = await setup()
  const changed = await h.protection.configure({ ...h.snapshot.preferences, rules: [...h.snapshot.preferences.rules,
    { ...h.snapshot.preferences.rules[0]!, id: other, address: resolve('owner/second') },
  ] }, h.snapshot.revision)
  const policy = h.protection.bindRemoteFilesystem({ ...h.binding, revision: changed.revision })
  await expect(policy.checkHelper(signal)).resolves.toMatchObject({ allowed: false, ruleIds: [other] })
  expect(() => h.protection.bindRemoteFilesystem({ ...h.binding, revision: changed.revision,
    ruleIds: [brandString<TargetRuleId>('00000000-0000-4000-8000-000000000001')] }))
    .toThrow(expect.objectContaining({ code: 'TARGET_IDENTITY_UNVERIFIED' }))
})

it('invalidates an acknowledged policy after revision change or owner cancellation', async () => {
  const h = await setup()
  const lifetime = new AbortController()
  const canceled = h.protection.bindRemoteFilesystem({ ...h.binding, signal: lifetime.signal })
  canceled.activate()
  const reason = new Error('owned SSH connection closed')
  lifetime.abort(reason)
  await expect(canceled.checkFile('observe', signal)).rejects.toBe(reason)
  const policy = h.protection.bindRemoteFilesystem(h.binding)
  policy.activate()
  await h.protection.configure(h.snapshot.preferences, h.snapshot.revision)
  await expect(policy.checkFile('observe', signal)).rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
})

it('rejects mismatched destination evidence and caller cancellation', async () => {
  const h = await setup()
  for (const resolution of [{ ...h.resolution, hostname: 'other.example' }, { ...h.resolution, addresses: [] }]) {
    expect(() => h.protection.bindRemoteFilesystem({ ...h.binding, resolution }))
      .toThrow(expect.objectContaining({ code: 'TARGET_IDENTITY_UNVERIFIED' }))
  }
  const policy = h.protection.bindRemoteFilesystem(h.binding)
  policy.activate()
  const canceled = new AbortController(), reason = new Error('file operation cancelled')
  canceled.abort(reason)
  await expect(policy.checkFile('observe', canceled.signal)).rejects.toBe(reason)
})

it.each(['full', 'audit'] as const)('keeps central %s host restrictions after mapping a path', async (protection) => {
  const h = await setup()
  const snapshot = await h.protection.configure({ ...h.snapshot.preferences, rules: [...h.snapshot.preferences.rules,
    { id: other, name: 'production host', enabled: true, kind: 'server', match: 'host', address: '127.0.0.1',
      environment: 'production', protection },
  ] }, h.snapshot.revision)
  const policy = h.protection.bindRemoteFilesystem({ ...h.binding, revision: snapshot.revision })
  policy.activate()
  await expect(policy.checkFile('mutate', signal)).resolves.toMatchObject({ allowed: false,
    code: protection === 'full' ? 'TARGET_FULLY_PROTECTED' : 'TARGET_READ_ONLY', ruleIds: [other] })
})

it('derives protection from central path aliases and rejects missing references', async () => {
  const h = await setup()
  const mappings = sshFileMappings.parse([{ ruleId: id, remotePath: '/remote/production' }])
  expect(resolveSshFileMappings(h.snapshot, mappings)).toEqual({ ids: [id], resources: [id], rules: [{ path: '/remote/production', protection: 'full' }] })
  const repeated = resolveSshFileMappings(h.snapshot, [...mappings, ...mappings])
  expect(repeated.ids).toEqual([id])
  expect(repeated.resources).toEqual([id, id])
  const aliased = { ...h.snapshot, preferences: { ...h.snapshot.preferences, rules: [
    { ...h.snapshot.preferences.rules[0]!, match: 'host' as const, address: 'production.example',
      aliases: [{ match: 'path' as const, address: '/owner/production' }] },
  ] } }
  expect(resolveSshFileMappings(aliased, mappings).ids).toEqual([id])
  expect(resolveSshFileMappings({ ...h.snapshot, preferences: { ...h.snapshot.preferences,
    rules: [{ ...h.snapshot.preferences.rules[0]!, enabled: false }] } }, mappings)).toEqual({ ids: [], resources: [], rules: [] })
  expect(resolveSshFileMappings({ ...h.snapshot, preferences: { ...h.snapshot.preferences,
    rules: [{ ...h.snapshot.preferences.rules[0]!, environment: 'test' }] } }, mappings)).toEqual({ ids: [], resources: [], rules: [] })
  expect(() => resolveSshFileMappings({ ...h.snapshot, preferences: { ...h.snapshot.preferences, rules: [
    { ...h.snapshot.preferences.rules[0]!, match: 'host', address: 'production.example' },
  ] } }, mappings)).toThrow(expect.objectContaining({ code: 'TARGET_IDENTITY_UNVERIFIED' }))
  expect(() => resolveSshFileMappings({ ...h.snapshot, preferences: { ...h.snapshot.preferences, rules: [
    { ...h.snapshot.preferences.rules[0]!, match: 'host', address: 'production.example', aliases: [{ match: 'cidr', address: '127.0.0.0/8' }] },
  ] } }, mappings)).toThrow(expect.objectContaining({ code: 'TARGET_IDENTITY_UNVERIFIED' }))
  expect(() => resolveSshFileMappings({ ...h.snapshot, preferences: { mainlandEnabled: false, rules: [] } }, mappings))
    .toThrow(expect.objectContaining({ code: 'TARGET_IDENTITY_UNVERIFIED' }))
})
