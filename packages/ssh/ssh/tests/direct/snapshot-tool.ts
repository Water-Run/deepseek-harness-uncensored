/** Keyless recorded-session probe over owned SSH peers and disposable files. @module */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { brandString } from '@deepseek-ai/dsh-brand'
import TargetProtection, { type TargetRuleId } from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import { readFile, writeFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { createSshFixture } from './peer.ts'

export const name = 'snapshot-ssh-protection'
export const inject = ['tools']

async function probe(mode: 'full' | 'audit' | 'test', signal: AbortSignal): Promise<string> {
  const fixture = await createSshFixture({ handle: async (method, params, signal, root) => {
    signal.throwIfAborted()
    if (method === 'fs.resolve') {
      const input = z.object({ path: z.string(), cwd: z.string() }).parse(params)
      const path = posix.resolve(input.cwd, input.path)
      return { displayPath: path, targetKey: path }
    }
    const path = join(root, 'contents.txt')
    if (method === 'fs.readText') return readFile(path, 'utf8')
    if (method === 'fs.write') {
      const input = z.object({ content: z.string() }).parse(params)
      await writeFile(path, input.content)
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
    await ctx.plugin(TargetProtection, { path: join(root, 'targets.sqlite'), hostsFile: '' })
    const current = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{
      id: brandString<TargetRuleId>(randomUUID()), name: 'owned snapshot target', kind: 'server', match: 'host',
      address: '127.0.0.1', enabled: true, environment: mode === 'test' ? 'test' : 'production', protection: mode === 'audit' ? 'audit' : 'full',
    }] }, current.revision)
    if (mode === 'full') {
      await assert.rejects(Promise.resolve(ctx.plugin(ProtectedSsh, config)), { code: 'TARGET_FULLY_PROTECTED' })
      assert.equal(fixture.connected(), 0)
      return 'blocked before TCP'
    }
    await ctx.plugin(ProtectedSsh, config)
    const target = { displayPath: '/fixture/workspace/contents.txt', targetKey: '/fixture/workspace/contents.txt' }
    assert.equal(await ctx.ssh.request('fs.readText', { target }, z.string(), signal), 'preserve')
    const write = () => ctx.ssh.request('fs.write', { target, content: 'changed', policy: {
      mode: 'danger-full-access', workspaceRoot: '/',
    } }, z.unknown(), signal)
    if (mode === 'audit') {
      await assert.rejects(write, { code: 'TARGET_READ_ONLY' })
      assert.equal(await readFile(file, 'utf8'), 'preserve')
      return 'read succeeded; write blocked'
    }
    await write()
    assert.equal(await readFile(file, 'utf8'), 'changed')
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
