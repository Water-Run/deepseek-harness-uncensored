/** MCP transport refusal, real stdio generations and rule-owner withdrawal. @module */
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import McpResources from '@deepseek-ai/dsh-mcp-resources'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import TargetProtection from '../src/index.ts'
import * as ProtectedMcp from '../src/mcp.ts'

const fixture = fileURLToPath(new URL('./fixtures/mcp.mjs', import.meta.url))
async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-mcp-protection-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(McpResources)
  const owner = await ctx.plugin(TargetProtection, { path: ':memory:', hostsFile: '' })
  const configure = async (mainlandEnabled: boolean) => {
    const before = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure({ mainlandEnabled, rules: [] }, before.revision)
  }
  const config = { transport: 'stdio' as const, serverName: 'guarded', command: process.execPath, args: [fixture], cwd: root,
    env: {}, toolCallTimeoutMs: 10000, failOnStartupError: true,
    reconnect: { enabled: true, initialDelayMs: 1, maxDelayMs: 2, maxAttempts: 2 } }
  return { ctx, root, owner, configure, config }
}
async function pids(root: string): Promise<number[]> {
  return (await readFile(join(root, 'pids'), 'utf8')).trim().split('\n').map(Number)
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error }
}
function execution(name: string) {
  return { callId: ToolCallId(name), signal: new AbortController().signal }
}

it('refuses stdio before discovery or native launch', async () => {
  const h = await harness()
  await expect(h.ctx.plugin(ProtectedMcp, h.config)).rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(await readdir(h.root)).toEqual([])
})

it('refuses HTTP MCP before any request or TCP connection', async () => {
  const h = await harness()
  let connections = 0
  const server = createServer((_request, response) => response.end('unreachable'))
  server.on('connection', () => { connections++ })
  onTestFinished(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => { server.close(() => { resolve() }) }) })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No bound HTTP address')
  await expect(h.ctx.plugin(ProtectedMcp, { transport: 'streamable-http', serverName: 'http',
    url: `http://127.0.0.1:${String(address.port)}/mcp`, failOnStartupError: true })).rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(connections).toBe(0)
})

it('permits an explicitly unprotected composition and reaps both the probe and serving process', async () => {
  const h = await harness(); await h.configure(false)
  const fiber = await h.ctx.plugin(ProtectedMcp, h.config)
  const result = await h.ctx.tools.execute({ name: 'mcp__guarded__write_marker', arguments: {}, ...execution('allowed') })
  expect(result.isError).toBe(false)
  expect(await readFile(join(h.root, 'called'), 'utf8')).toBe('executed')
  const resource = await h.ctx.tools.execute({ name: 'read_mcp_resource', arguments: {
    server: 'guarded', uri: 'fixture://evidence',
  }, ...execution('read') })
  expect(resource.isError, JSON.stringify(resource)).toBe(false)
  expect(await readFile(join(h.root, 'read-resource'), 'utf8')).toBe('1')
  await fiber.dispose()
  const owned = await pids(h.root)
  expect(owned).toHaveLength(2)
  expect(owned.map(alive)).toEqual([false, false])
  expect(h.ctx.tools.get('mcp__guarded__write_marker')).toBeUndefined()
})

it('revokes in-flight calls, prevents stale dispatch and does not reconnect after policy changes', async () => {
  const h = await harness(); await h.configure(false)
  const fiber = await h.ctx.plugin(ProtectedMcp, h.config)
  const stale = h.ctx.tools.get('mcp__guarded__write_marker')!
  h.ctx.effect(() => h.ctx.tools.register({ ...stale, name: 'cached_mcp_call' }))
  const waiting = h.ctx.tools.execute({ name: 'mcp__guarded__wait_forever', arguments: {}, ...execution('waiting') })
  await expect.poll(() => readFile(join(h.root, 'waiting'), 'utf8')).toBe('1')
  await h.configure(true)
  await fiber.dispose()
  expect((await waiting).isError).toBe(true)
  expect((await h.ctx.tools.execute({ name: 'cached_mcp_call', arguments: {}, ...execution('stale') })).isError).toBe(true)
  expect((await pids(h.root)).map(alive)).toEqual([false, false])
  await expect(readFile(join(h.root, 'called'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('withdraws the mandatory rule owner only after serving processes and tools have closed', async () => {
  const h = await harness(); await h.configure(false)
  await h.ctx.plugin(ProtectedMcp, h.config)
  await h.owner.dispose()
  expect(h.ctx.tools.get('mcp__guarded__write_marker')).toBeUndefined()
  expect((await pids(h.root)).map(alive)).toEqual([false, false])
})

it('loads mandatory MCP protection through a real Loader configuration', async () => {
  const h = await harness()
  const configPath = join(h.root, 'cordis.yml')
  await writeFile(configPath, JSON.stringify([{ id: 'guarded-mcp', name: 'cordis:protected-mcp', config: h.config }]))
  h.ctx.baseUrl = pathToFileURL(h.root).href + '/'
  await h.ctx.plugin(Loader)
  h.ctx.loader.builtins.include = Include
  h.ctx.loader.builtins['protected-mcp'] = ProtectedMcp
  await h.ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await h.ctx.loader.await()
  const entry = [...h.ctx.loader.entries()].find(entry => entry.options.id === 'guarded-mcp')
  if (entry?.fiber === undefined) throw new Error('MCP entry is missing')
  const outcome = entry.fiber.await().then(() => 'allowed', (error: unknown) => {
    if (error instanceof Error && 'code' in error) return error.code
    throw error
  })
  await expect(outcome).resolves.toBe('TARGET_EXECUTION_UNCONFINED')
  await expect(readFile(join(h.root, 'pids'))).rejects.toMatchObject({ code: 'ENOENT' })
})
