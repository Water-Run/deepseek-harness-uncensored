/** Real Loader configuration and provider lifetime; only an owned loopback endpoint is observed. @module */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import WebRuntime from '@deepseek-ai/dsh-web'
import { brandString } from '@deepseek-ai/dsh-brand'
import { expect, it } from 'vitest'
import TargetProtection from '../src/index.ts'
import * as ProtectedHttp from '../src/http.ts'
import type { TargetRuleId } from '../src/types.ts'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import TargetFileSystem from '../src/fs.ts'
import TargetSubprocess from '../src/subprocess.ts'

it('loads durable protection and its mandatory HTTP consumer from cordis.yml', async () => {
  let connections = 0
  const server = createServer((_request, response) => { response.end('must not be reached') })
  server.on('connection', () => { connections++ })
  const ctx = new Context()
  const root = await mkdtemp(join(tmpdir(), 'dshu-protection-loader-'))
  try {
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const path = join(root, 'cordis.yml')
    await copyFile(fileURLToPath(new URL('./fixtures/cordis.yml', import.meta.url)), path)
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.builtins.web = WebRuntime
    ctx.loader.builtins['target-protection'] = TargetProtection
    ctx.loader.builtins['protected-http'] = ProtectedHttp
    ctx.loader.builtins.projections = SessionProjections
    ctx.loader.builtins.sandbox = SandboxPolicy
    ctx.loader.builtins['protected-fs'] = TargetFileSystem
    ctx.loader.builtins['protected-process'] = TargetSubprocess
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
    await ctx.loader.await()
    const before = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure({ mainlandEnabled: true, rules: [{
      id: brandString<TargetRuleId>('59d2c30a-2d98-45d5-a8df-392f99043072'), name: 'protected fixture', enabled: true,
      kind: 'server', environment: 'production', protection: 'full', match: 'host', address: '127.0.0.1',
    }] }, before.revision)
    const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`
    await expect(ctx.web.fetch({ url })).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
    expect(connections).toBe(0)
    const safe = join(root, 'scratch.txt')
    await ctx.fs.writeText(await ctx.fs.resolve(safe), 'guarded fixture')
    expect(await ctx.fs.readText(await ctx.fs.resolve(safe))).toMatchInlineSnapshot('"guarded fixture"')
    const processError = (() => {
      try { ctx.subprocess.spawn({ argv: [process.execPath, '-e', 'process.exit(1)'], cwd: root,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 100 }, stderr: { maxBytes: 100 } }, graceMs: 100 }) }
      catch (error) { return error }
      throw new Error('Expected the unconfined process to be refused')
    })()
    expect(processError).toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
    const oldFileSystem = ctx.fs
    const entry = [...ctx.loader.entries()].find(entry => entry.options.id === 'protection')
    if (entry?.fiber === undefined) throw new Error('Protection Loader entry is missing')
    await entry.fiber.dispose()
    await ctx.loader.await()
    expect(ctx.get('fs')).toBeUndefined()
    expect(ctx.get('subprocess')).toBeUndefined()
    await expect(oldFileSystem.readText({ displayPath: safe, targetKey: (await import('@deepseek-ai/dsh-fs')).FsTargetKey(safe) })).rejects.toBeDefined()
    await expect(ctx.web.fetch({ url })).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
    expect(connections).toBe(0)
  } finally {
    await ctx.fiber.dispose()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error === undefined) resolve(); else reject(error) }) })
    await rm(root, { recursive: true, force: true })
  }
})
