/** Actual REA stdio effects, policy revocation and mandatory-provider teardown. @module */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import TargetProtection from '../src/index.ts'
import TargetRea from '../src/rea.ts'
import type { TargetPreferences } from '../src/types.ts'

const cliPath = fileURLToPath(new URL('./fixtures/rea.mjs', import.meta.url))

async function harness(persistent = false) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-target-rea-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const owner = await ctx.plugin(TargetProtection, { path: persistent ? join(root, 'rules.sqlite') : ':memory:', hostsFile: '' })
  const rea = await ctx.plugin(TargetRea, { enabled: true, nodePath: process.execPath, cliPath })
  const configure = async (preferences: TargetPreferences) => {
    const before = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure(preferences, before.revision)
  }
  return { ctx, root, owner, rea, configure }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error }
}

it('refuses native launch before the fixture can write its startup marker', async () => {
  const h = await harness()
  const start = vi.spyOn(StdioClientTransport.prototype, 'start')
  onTestFinished(() => { start.mockRestore() })
  await expect(h.ctx.rea.connect(h.root, new AbortController().signal)).rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(start).not.toHaveBeenCalled()
  expect(await readdir(h.root)).toEqual([])
})

it('keeps durable owner settings protected even when mainland and target rules are disabled', async () => {
  const h = await harness(true)
  await h.configure({ mainlandEnabled: false, rules: [] })
  await expect(h.ctx.rea.connect(h.root, new AbortController().signal)).rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  await expect(readFile(join(h.root, 'started'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('allows an explicitly unprotected in-memory composition and waits for the child to exit', async () => {
  const h = await harness()
  await h.configure({ mainlandEnabled: false, rules: [] })
  const opened = await h.ctx.rea.connect(h.root, new AbortController().signal)
  const pid = Number(await readFile(join(h.root, 'started'), 'utf8'))
  const tool = opened.connection.tools().find(tool => tool.name === 'write_marker')!
  await opened.connection.call(tool, {}, new AbortController().signal)
  expect(await readFile(join(h.root, 'called'), 'utf8')).toBe('executed')
  await opened.dispose()
  expect(alive(pid)).toBe(false)
})

it('revokes running and queued calls before the execution owner is released', async () => {
  const h = await harness()
  await h.configure({ mainlandEnabled: false, rules: [] })
  const opened = await h.ctx.rea.connect(h.root, new AbortController().signal)
  const pid = Number(await readFile(join(h.root, 'started'), 'utf8'))
  const waiting = opened.connection.tools().find(tool => tool.name === 'wait_forever')!
  const write = opened.connection.tools().find(tool => tool.name === 'write_marker')!
  const calls = Promise.allSettled([
    opened.connection.call(waiting, {}, new AbortController().signal),
    opened.connection.call(write, {}, new AbortController().signal),
  ])
  await expect.poll(() => readFile(join(h.root, 'waiting'), 'utf8')).toBe('1')
  await h.configure({ mainlandEnabled: true, rules: [] })
  await opened.dispose()
  expect((await calls).map(result => result.status)).toEqual(['rejected', 'rejected'])
  expect(alive(pid)).toBe(false)
  await expect(readFile(join(h.root, 'called'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('withdraws the REA service and closes its native process before the rule owner completes', async () => {
  const h = await harness()
  await h.configure({ mainlandEnabled: false, rules: [] })
  const stale = h.ctx.rea
  const opened = await stale.connect(h.root, new AbortController().signal)
  const pid = Number(await readFile(join(h.root, 'started'), 'utf8'))
  await h.owner.dispose()
  expect(h.ctx.get('rea')).toBeUndefined()
  expect(alive(pid)).toBe(false)
  await expect(stale.connect(h.root, new AbortController().signal)).rejects.toBeDefined()
  expect(() => opened.connection.tools()).toThrow()
})

it('cleans up a missing executable and can subsequently dispose the owner', async () => {
  const h = await harness()
  await h.configure({ mainlandEnabled: false, rules: [] })
  await h.rea.dispose()
  await h.ctx.plugin(TargetRea, { enabled: true, nodePath: join(h.root, 'missing.exe'), cliPath })
  await expect(h.ctx.rea.connect(h.root, new AbortController().signal)).rejects.toBeDefined()
  await h.owner.dispose()
})

it('cancels unfinished negotiation and closes the native child before returning', async () => {
  const h = await harness()
  await h.configure({ mainlandEnabled: false, rules: [] })
  await writeFile(join(h.root, 'hold-startup'), '')
  const abort = new AbortController()
  const opening = Promise.allSettled([h.ctx.rea.connect(h.root, abort.signal)])
  await expect.poll(() => readFile(join(h.root, 'started'), 'utf8')).toMatch(/^\d+$/u)
  const pid = Number(await readFile(join(h.root, 'started'), 'utf8'))
  abort.abort(new Error('cancel negotiation'))
  expect((await opening)[0].status).toBe('rejected')
  expect(alive(pid)).toBe(false)
  await h.owner.dispose()
})

it('waits for native close when the process ignores graceful shutdown', async () => {
  const h = await harness()
  await h.configure({ mainlandEnabled: false, rules: [] })
  await writeFile(join(h.root, 'linger'), '')
  const opened = await h.ctx.rea.connect(h.root, new AbortController().signal)
  const pid = Number(await readFile(join(h.root, 'started'), 'utf8'))
  await opened.dispose()
  expect(alive(pid)).toBe(false)
  await h.owner.dispose()
})

it('loads mandatory REA protection from a real Loader composition', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-rea-loader-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, JSON.stringify([
    { id: 'protection', name: 'cordis:protection', config: { path: ':memory:', hostsFile: '' } },
    { id: 'rea', name: 'cordis:guarded-rea', config: { enabled: true, nodePath: process.execPath, cliPath } },
  ]))
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.builtins.protection = TargetProtection
  ctx.loader.builtins['guarded-rea'] = TargetRea
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  await expect(hardRefusal()).resolves.toMatchInlineSnapshot('"TARGET_EXECUTION_UNCONFINED"')
  await expect(readFile(join(root, 'started'))).rejects.toMatchObject({ code: 'ENOENT' })
  async function hardRefusal() {
    try { const opened = await ctx.rea.connect(root, new AbortController().signal); await opened.dispose(); return 'allowed' }
    catch (error) { if (error instanceof Error && 'code' in error) return error.code; throw error }
  }
})
