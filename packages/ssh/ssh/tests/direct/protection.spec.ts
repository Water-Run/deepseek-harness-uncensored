/** Target decisions at real SSH connection and filesystem RPC boundaries. @module */
import { readFile, writeFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import TargetProtection from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import type { TargetRule, TargetRuleId } from '@deepseek-ai/dsh-target-protection'
import { targetSchema } from '../../src/schemas.ts'
import { harness } from './fixture.ts'
import { expect, it } from 'vitest'
import { z } from 'zod'

const remoteRoot = '/fixture/workspace'
const fileTarget = { displayPath: `${remoteRoot}/data.txt`, targetKey: `${remoteRoot}/data.txt` }
const policy = { mode: 'danger-full-access', workspaceRoot: '/' }

async function setup() {
  const h = await harness({ handle: async (method, params, signal, root) => {
    signal.throwIfAborted()
    if (method === 'fs.resolve') {
      const input = z.object({ path: z.string(), cwd: z.string() }).parse(params)
      const path = posix.resolve(input.cwd, input.path)
      return { displayPath: path, targetKey: path.endsWith('/escape') ? '/outside/private' : path }
    }
    const input = z.looseObject({ target: targetSchema, content: z.string().optional() }).parse(params)
    if (input.target.targetKey !== fileTarget.targetKey) throw new Error('Fixture file not found')
    const path = join(root, 'remote-data.txt')
    if (method === 'fs.readText') return readFile(path, 'utf8')
    if (method === 'fs.write') {
      await writeFile(path, z.string().parse(input.content))
      return { operation: 'update', version: 'fixture-v2', before: null, after: input.content }
    }
    throw new Error('Unsupported fixture file operation')
  } })
  await writeFile(join(h.root, 'remote-data.txt'), 'preserve')
  const protection = await h.ctx.plugin(TargetProtection, { path: join(h.root, 'rules.sqlite'), hostsFile: '' })
  const port = h.config.port
  if (port === undefined) throw new Error('Fixture SSH port is missing')
  const rule = (overrides: Partial<TargetRule> = {}): TargetRule => ({
    id: brandString<TargetRuleId>(randomUUID()), enabled: true, name: 'owned SSH server', kind: 'server', match: 'host',
    address: '127.0.0.1', ...overrides.match === 'path' ? {} : { port }, environment: 'production', protection: 'full', ...overrides,
  })
  const configure = async (rules: TargetRule[], mainlandEnabled = false) => {
    const current = await h.ctx.targetProtection.snapshot()
    await h.ctx.targetProtection.configure({ mainlandEnabled, rules }, current.revision)
  }
  return { ...h, rule, configure, protection, contents: () => readFile(join(h.root, 'remote-data.txt'), 'utf8') }
}

it('full production protection makes no SSH connection and cannot be overridden by a test label', async () => {
  const h = await setup()
  await h.configure([h.rule({ environment: 'test' }), h.rule()])
  const outcome = await Promise.resolve(h.ctx.plugin(ProtectedSsh, h.config)).then(() => 'accepted',
    (error: unknown) => error instanceof Error && 'code' in error ? String(error.code) : 'unstructured-error')
  expect(outcome).toBe('TARGET_FULLY_PROTECTED')
  expect(h.connected()).toBe(0)
  expect(h.requests).toEqual([])
  expect(await h.contents()).toBe('preserve')
})

it('allows structured audit reads but refuses direct mutation and arbitrary process calls', async () => {
  const h = await setup()
  await h.configure([h.rule({ protection: 'audit' })])
  await h.ctx.plugin(ProtectedSsh, h.config)
  expect(await h.ctx.ssh.request('fs.readText', { target: fileTarget }, z.string())).toBe('preserve')
  await expect(h.ctx.ssh.request('fs.write', { target: fileTarget, content: 'overwrite', policy }, z.unknown()))
    .rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
  await expect(h.ctx.ssh.request('process.prepare', { argv: ['arbitrary'] }, z.unknown()))
    .rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(h.requests).not.toContain('fs.write')
  expect(h.requests).not.toContain('process.prepare')
  expect(await h.contents()).toBe('preserve')
})

it('admits explicit private test endpoints without relaxing anonymous HTTP restrictions', async () => {
  const h = await setup()
  await h.configure([h.rule({ environment: 'test' })], true)
  await h.ctx.plugin(ProtectedSsh, h.config)
  await h.ctx.ssh.request('fs.write', { target: fileTarget, content: 'test changed', policy }, z.unknown())
  expect(await h.contents()).toBe('test changed')
  await expect(h.ctx.targetProtection.resolveHttpTarget('127.0.0.1', new AbortController().signal))
    .rejects.toMatchObject({ code: 'WEB_BLOCKED_URL' })
})

it('keeps logical and resolved file paths inside the configured workspace', async () => {
  const h = await setup()
  await h.configure([h.rule({ environment: 'test' })])
  await h.ctx.plugin(ProtectedSsh, h.config)
  await expect(h.ctx.ssh.request('fs.resolve', { path: '/outside/private' }, targetSchema))
    .rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  await expect(h.ctx.ssh.request('fs.resolve', { path: `${remoteRoot}/escape` }, targetSchema))
    .rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  await expect(h.ctx.ssh.request('fs.readText', { target: { ...fileTarget, targetKey: `${remoteRoot}/escape` } }, z.string()))
    .rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(h.requests).not.toContain('fs.readText')
})

it('does not infer an unrelated filesystem from another service port or a local path rule', async () => {
  const h = await setup()
  await h.configure([h.rule({ port: h.config.port === 5432 ? 5433 : 5432, kind: 'database', database: 'production' })])
  await expect(h.ctx.plugin(ProtectedSsh, h.config)).rejects.toBeDefined()
  expect(h.commands).toEqual([])
  expect(await h.contents()).toBe('preserve')
})

it('rejects unsupported remote bindings for active production paths before launching the helper', async () => {
  const h = await setup()
  await h.configure([h.rule({ match: 'path', address: join(h.root, 'production.db') })])
  await expect(h.ctx.plugin(ProtectedSsh, h.config)).rejects.toBeDefined()
  expect(h.commands).toEqual([])
})

it('revokes an established connection when target rules change, without a direct-call fallback', async () => {
  const h = await setup()
  await h.configure([h.rule({ environment: 'test' })])
  await h.ctx.plugin(ProtectedSsh, h.config)
  const stale = h.ctx.ssh
  await h.configure([h.rule()])
  await expect(stale.request('fs.write', { target: fileTarget, content: 'overwrite', policy }, z.unknown())).rejects.toBeDefined()
  expect(await h.contents()).toBe('preserve')
  expect(h.requests).not.toContain('fs.write')
})

it('withdraws the SSH provider with its mandatory rule owner', async () => {
  const h = await setup()
  await h.configure([h.rule({ environment: 'test' })])
  await h.ctx.plugin(ProtectedSsh, h.config)
  const stale = h.ctx.ssh
  await h.protection.dispose()
  expect(h.ctx.get('ssh')).toBeUndefined()
  await expect(stale.request('fs.readText', { target: fileTarget }, z.string())).rejects.toBeDefined()
})
