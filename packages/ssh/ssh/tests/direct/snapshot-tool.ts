/** Keyless recorded-session probe over owned SSH peers and disposable files. @module */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { brandString } from '@deepseek-ai/dsh-brand'
import TargetProtection, { type TargetRuleId } from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import { readFile, writeFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { createSshFixture } from './peer.ts'
import { RemoteOperationError } from '../../src/protocol.ts'

export const name = 'snapshot-ssh-protection'
export const inject = ['tools']

async function probe(mode: 'full' | 'audit' | 'test', signal: AbortSignal): Promise<string> {
  const protectedPath = '/fixture/workspace/protected.txt'
  let configured = false
  let auditBlocker: DatabaseSync | undefined, auditLocked = false
  const fixture = await createSshFixture({ handle: async (method, params, signal, root, reportFileRules) => {
    signal.throwIfAborted()
    if (method === 'fs.protection') {
      assert.deepEqual(params, [{ path: protectedPath, protection: 'full' }])
      configured = true
      return null
    }
    if (method === 'fs.resolve') {
      const input = z.object({ path: z.string(), cwd: z.string() }).parse(params)
      const path = posix.resolve(input.cwd, input.path)
      if (configured && path === protectedPath) {
        reportFileRules([0])
        throw new RemoteOperationError('This remote file is fully protected.', 'TARGET_FULLY_PROTECTED')
      }
      return { displayPath: path, targetKey: path }
    }
    const path = join(root, 'contents.txt')
    if (method === 'fs.readText') return readFile(path, 'utf8')
    if (method === 'fs.write') {
      const input = z.object({ content: z.string() }).parse(params)
      await writeFile(path, input.content)
      if (auditBlocker !== undefined) { auditBlocker.exec('BEGIN IMMEDIATE'); auditLocked = true }
      return { operation: 'update', version: 'fixture-v2', before: null, after: input.content }
    }
    throw new Error('Unexpected SSH fixture request')
  } })
  const cancelled = (): void => {
    void fixture.close().catch((_error: unknown) => { /* The finally block awaits and reports cleanup failures. */ })
  }
  signal.addEventListener('abort', cancelled, { once: true })
  try {
    signal.throwIfAborted()
    const { ctx, root, config } = fixture
    const file = join(root, 'contents.txt'); await writeFile(file, 'preserve')
    await ctx.plugin(TargetProtection, { path: join(root, 'targets.sqlite'), auditPath: join(root, 'audit.sqlite'), hostsFile: '', busyTimeoutMs: 20 })
    const current = await ctx.targetProtection.snapshot()
    const mappedId = brandString<TargetRuleId>(randomUUID())
    await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{
      id: brandString<TargetRuleId>(randomUUID()), name: 'owned snapshot target', kind: 'server', match: 'host',
      address: '127.0.0.1', enabled: true, environment: mode === 'test' ? 'test' : 'production', protection: mode === 'audit' ? 'audit' : 'full',
    }, ...mode === 'test' ? [{ id: mappedId, name: 'central protected file', kind: 'server' as const, match: 'path' as const,
      address: join(root, 'central-protected.txt'), enabled: true, environment: 'production' as const, protection: 'full' as const }] : []] }, current.revision)
    if (mode === 'full') {
      await assert.rejects(Promise.resolve(ctx.plugin(ProtectedSsh, config)), { code: 'TARGET_FULLY_PROTECTED' })
      assert.equal(fixture.connected(), 0)
      const record = ctx.targetProtection.auditHistory().entries[0]
      assert.ok(record)
      assert.equal(record.code, 'TARGET_FULLY_PROTECTED')
      assert.equal(record.revision, current.revision + 1)
      return 'blocked before TCP'
    }
    await ctx.plugin(ProtectedSsh, {
      ...config, ...mode === 'test' ? { pathMappings: [{ ruleId: mappedId, remotePath: protectedPath }] } : {},
    })
    if (mode === 'test') {
      assert.equal(configured, true)
      await assert.rejects(ctx.ssh.request('fs.resolve', { path: protectedPath }, z.unknown(), signal), { code: 'TARGET_FULLY_PROTECTED' })
      const refused = ctx.targetProtection.auditHistory().entries.find(entry => entry.operation === 'file')
      assert.deepEqual(refused?.ruleIds, [mappedId])
      assert.equal(refused?.matchedRules, 1)
    }
    const target = { displayPath: '/fixture/workspace/contents.txt', targetKey: '/fixture/workspace/contents.txt' }
    assert.equal(await ctx.ssh.request('fs.readText', { target }, z.string(), signal), 'preserve')
    const write = (content = 'changed') => ctx.ssh.request('fs.write', { target, content, policy: {
      mode: 'danger-full-access', workspaceRoot: '/',
    } }, z.unknown(), signal)
    if (mode === 'audit') {
      await assert.rejects(write, { code: 'TARGET_READ_ONLY' })
      assert.equal(await readFile(file, 'utf8'), 'preserve')
      const refused = ctx.targetProtection.auditHistory().entries.find(entry => entry.operation === 'file' && entry.effect === 'mutate')
      assert.equal(refused?.decision, 'deny')
      assert.equal(refused?.code, 'TARGET_READ_ONLY')
      assert.match(refused?.fingerprint ?? '', /^[a-f0-9]{64}$/u)
      return 'read succeeded; write blocked'
    }
    await write()
    assert.equal(await readFile(file, 'utf8'), 'changed')
    const blocker = new DatabaseSync(join(root, 'audit.sqlite'))
    try {
      auditBlocker = blocker
      await assert.rejects(write('unacknowledged effect'), { code: 'TARGET_AUDIT_UNCONFIRMED' })
      assert.equal(await readFile(file, 'utf8'), 'unacknowledged effect')
      assert.equal(ctx.targetProtection.auditHistory().state, 'unavailable')
    } finally {
      auditBlocker = undefined
      try { if (auditLocked) blocker.exec('ROLLBACK') }
      finally { blocker.close() }
    }
    return 'write succeeded'
  } finally { signal.removeEventListener('abort', cancelled); await fixture.close() }
}

/** Register only in the dedicated recorded-session profile patch. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'verify_ssh_protection',
    description: 'Verify full, audit and test policies using only disposable local SSH peers and files.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        full: { type: 'string', required: true }, audit: { type: 'string', required: true }, test: { type: 'string', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: `Full: ${value.full}\nAudit: ${value.audit}\nTest: ${value.test}` }],
    },
    async execute(_args, exec) {
      return { full: await probe('full', exec.signal), audit: await probe('audit', exec.signal), test: await probe('test', exec.signal) }
    },
    presentCall: () => ({ card: 'generic', kind: 'other', title: 'Verify SSH protection' }),
  }))
}
