/** Real Loader, tool registration and mandatory provider withdrawal. @module */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import * as Fixture from './snapshot-postgres.ts'

it('loads database_inspect, logs its refusal and withdraws the tool with its provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-postgres-loader-')), ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.builtins.tools = Tools
  ctx.loader.builtins.prompt = SystemPrompt
  ctx.loader.builtins.fixture = Fixture
  const path = join(root, 'cordis.yml')
  await writeFile(path, JSON.stringify([
    { name: 'cordis:prompt' }, { name: 'cordis:tools' },
    { id: 'fixture', name: 'cordis:fixture' },
  ]))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  const fixture = [...ctx.loader.entries()].find(entry => entry.options.id === 'fixture')
  if (fixture?.fiber === undefined) throw new Error('PostgreSQL fixture entry is missing')
  await fixture.fiber.await()
  const signal = new AbortController().signal
  const result = await ctx.tools.execute({ name: 'database_inspect', arguments: { database: 'owned' }, callId: ToolCallId('refusal'), signal })
  expect(result).toMatchObject({ isError: true })
  expect(JSON.stringify(result)).toContain('TARGET_FULLY_PROTECTED')
  expect((await ctx.tools.execute({ name: 'verify_postgres_transport', arguments: {}, callId: ToolCallId('verify'), signal })).isError).toBe(false)
  const provider = ctx.postgresAudit
  await fixture.fiber.dispose()
  await ctx.loader.await()
  expect(ctx.get('postgresAudit')).toBeUndefined()
  expect(ctx.tools.get('database_inspect')).toBeUndefined()
  await expect(provider.inspect('owned', signal)).rejects.toBeDefined()
})
