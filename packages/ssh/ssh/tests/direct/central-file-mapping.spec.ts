/** Linux helper enforcement of central production resources over authenticated SSH. @module */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandString } from '@deepseek-ai/dsh-brand'
import TargetProtection, { type TargetRuleId } from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runSshHelper } from '../../src/helper.ts'
import { deleteResultSchema, editResultSchema, moveResultSchema, targetSchema, writeResultSchema } from '../../src/schemas.ts'
import { harness } from './fixture.ts'

const entry = fileURLToPath(new URL('../../src/helper-entry.ts', import.meta.url))
const policy = { mode: 'danger-full-access', workspaceRoot: '/' }

async function setup(level: 'full' | 'audit') {
  const h = await harness({ serve: (channel, _root, signal) =>
    runSshHelper({ input: channel, output: channel, kind: 'node-script', entryPath: entry, signal }) })
  const workspace = join(h.root, 'remote')
  const production = join(workspace, 'production'), testing = join(workspace, 'testing')
  await mkdir(production, { recursive: true })
  await mkdir(testing)
  const file = join(production, 'data.txt'), safe = join(testing, 'safe.txt')
  await writeFile(file, 'preserve\n')
  await writeFile(safe, 'safe\n')
  await h.ctx.plugin(TargetProtection, { path: join(h.root, 'rules.sqlite'), hostsFile: '' })
  const before = await h.ctx.targetProtection.snapshot()
  const id = brandString<TargetRuleId>(randomUUID())
  const snapshot = await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [
    { id, name: 'production files', enabled: true, kind: 'server', match: 'path', address: join(h.root, 'owner-production'), environment: 'production', protection: level },
  ] }, before.revision)
  const config = { ...h.config, helper: entry, workspace,
    helperHash: createHash('sha256').update(await readFile(entry)).digest('hex'),
    pathMappings: [{ ruleId: id, remotePath: production }] }
  return { ...h, workspace, production, testing, file, safe, id, config, snapshot }
}

// The enforcing helper depends on Linux mountinfo; the client and central-policy cases run on both desktop hosts.
describe.skipIf(process.platform !== 'linux')('central remote file mapping', () => {
  it('refuses unresolved central paths and invalid resource IDs before executing the helper', async () => {
    const h = await setup('audit')
    await expect(h.ctx.plugin(ProtectedSsh, { ...h.config, pathMappings: [] }))
      .rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
    expect(h.commands).toEqual([])
    await expect(h.ctx.plugin(ProtectedSsh, { ...h.config, pathMappings: [{ ruleId: randomUUID(), remotePath: h.production }] }))
      .rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
    expect(h.commands).toEqual([])
    expect(await readFile(h.file, 'utf8')).toBe('preserve\n')
  })

  it.each(['full', 'audit'] as const)('enforces the central %s level and keeps unrelated test files writable', async (level) => {
    const h = await setup(level)
    await h.ctx.plugin(ProtectedSsh, h.config)
    const ssh = h.ctx.ssh
    let target = { targetKey: h.file, displayPath: h.file }
    if (level === 'full') {
      await expect(ssh.request('fs.resolve', { path: h.file }, targetSchema)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
      await expect(ssh.request('fs.readText', { target }, z.string())).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
    } else {
      target = await ssh.request('fs.resolve', { path: h.file }, targetSchema)
      expect(await ssh.request('fs.readText', { target }, z.string())).toBe('preserve\n')
    }
    await expect(ssh.request('fs.write', { target, content: 'bad', policy }, writeResultSchema))
      .rejects.toMatchObject({ code: level === 'full' ? 'TARGET_FULLY_PROTECTED' : 'TARGET_READ_ONLY' })
    expect(await readFile(h.file, 'utf8')).toBe('preserve\n')
    const safe = await ssh.request('fs.resolve', { path: h.safe }, targetSchema)
    expect(await ssh.request('fs.write', { target: safe, content: 'changed\n', policy }, writeResultSchema)).toMatchObject({ after: 'changed\n' })
    expect(await readFile(h.safe, 'utf8')).toBe('changed\n')
    expect(h.ctx.targetProtection.sshCoverage()).toEqual({ connections: 1, pathProtectedConnections: 1 })
    await expect(ssh.request('process.prepare', {}, z.unknown())).rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  })

  it('uses the new central level after confirmed shutdown and never keeps the previous audit grant', async () => {
    const h = await setup('audit')
    const fiber = await h.ctx.plugin(ProtectedSsh, h.config)
    const old = h.ctx.ssh
    const target = await old.request('fs.resolve', { path: h.file }, targetSchema)
    expect(await old.request('fs.readText', { target }, z.string())).toBe('preserve\n')
    const updated = await h.ctx.targetProtection.configure({ ...h.snapshot.preferences,
      rules: h.snapshot.preferences.rules.map(rule => ({ ...rule, protection: 'full' })) }, h.snapshot.revision)
    expect(updated.revision).toBe(h.snapshot.revision + 1)
    await expect(old.request('fs.readText', { target }, z.string())).rejects.toBeDefined()
    await fiber.dispose()
    await h.ctx.plugin(ProtectedSsh, h.config)
    await expect(h.ctx.ssh.request('fs.readText', { target }, z.string())).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
    expect(await readFile(h.file, 'utf8')).toBe('preserve\n')
  })

  it('requires the real helper to resolve every mapped root before readiness', async () => {
    const h = await setup('full')
    await expect(h.ctx.plugin(ProtectedSsh, { ...h.config, pathMappings: [{ ruleId: h.id, remotePath: join(h.workspace, 'missing') }] }))
      .rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
    expect(h.ctx.get('ssh')).toBeUndefined()
    expect(h.ctx.targetProtection.sshCoverage()).toEqual({ connections: 0, pathProtectedConnections: 0 })
  })

  it('protects patch, delete and both move endpoints without blocking bounded test-file operations', async () => {
    const h = await setup('audit')
    await h.ctx.plugin(ProtectedSsh, h.config)
    const ssh = h.ctx.ssh
    const production = await ssh.request('fs.resolve', { path: h.file }, targetSchema)
    const safe = await ssh.request('fs.resolve', { path: h.safe }, targetSchema)
    const hunks = [{ lineNumber: 1, oldLines: ['safe'], newLines: ['patched'], isEndOfFile: true }]
    await expect(ssh.request('fs.patch', { target: production, hunks: [], policy }, editResultSchema))
      .rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
    await expect(ssh.request('fs.delete', { target: production, policy }, deleteResultSchema))
      .rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
    await expect(ssh.request('fs.move', { source: safe, destination: production, options: {}, policy }, moveResultSchema))
      .rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
    const deniedDestination = await ssh.request('fs.resolve', { path: join(h.testing, 'production-copy.txt') }, targetSchema)
    await expect(ssh.request('fs.move', { source: production, destination: deniedDestination, options: {}, policy }, moveResultSchema))
      .rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
    await expect(readFile(deniedDestination.targetKey)).rejects.toMatchObject({ code: 'ENOENT' })
    await ssh.request('fs.patch', { target: safe, hunks, policy }, editResultSchema)
    expect(await readFile(h.safe, 'utf8')).toBe('patched\n')
    const moved = await ssh.request('fs.resolve', { path: join(h.testing, 'moved.txt') }, targetSchema)
    await ssh.request('fs.move', { source: safe, destination: moved, options: {}, policy }, moveResultSchema)
    expect(await readFile(moved.targetKey, 'utf8')).toBe('patched\n')
    await ssh.request('fs.delete', { target: moved, policy }, deleteResultSchema)
    await expect(readFile(moved.targetKey)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(h.file, 'utf8')).toBe('preserve\n')
  })
})
