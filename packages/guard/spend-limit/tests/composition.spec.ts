import { expect, it } from 'vitest'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import * as spending from '../src/index.ts'
import { DEFAULT_PREFERENCES } from '../src/ledger.ts'

async function consume(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) { /* Consume the complete provider lifecycle. */ }
}

it('boots the built-in gate through Loader and removes admission on unload', async () => {
  const ctx = new Context()
  const root = await mkdtemp(join(tmpdir(), 'dshu-spending-loader-'))
  try {
    const configPath = join(root, 'cordis.yml')
    await copyFile(new URL('./fixtures/cordis.yml', import.meta.url), configPath)
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.builtins.llm = LlmRuntime
    ctx.loader.builtins['spend-limit'] = spending
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    expect((await ctx.spendLimit.get()).preferences.enabled).toBe(false)
    let sent = 0
    class Adapter extends LlmAdapter {
      override async * stream(): AsyncIterable<StreamChunk> { sent++; yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }; yield { type: 'finish', reason: { kind: 'stop' } } }
    }
    ctx.llm.registerAdapter(['deepseek-official'], new Adapter())
    await ctx.spendLimit.configure({ ...DEFAULT_PREFERENCES, enabled: true, limits: { ...DEFAULT_PREFERENCES.limits, '15m': 1 } })
    const request = { provider: 'deepseek-official', model: 'deepseek-flash', messages: [], maxTokens: 100 }
    await expect(consume(ctx.llm.stream(request))).rejects.toMatchObject({ code: 'SPEND_REQUEST_TOO_LARGE' })
    expect(sent).toBe(0)
    await ctx.spendLimit.configure({ ...DEFAULT_PREFERENCES, enabled: true })
    await consume(ctx.llm.stream(request))
    expect((await ctx.spendLimit.get()).windows[0]?.spent).toBe(0.0006)
    const entry = [...ctx.loader.entries()].find(entry => entry.options.id === 'spending')
    expect(entry?.fiber).toBeDefined()
    await entry!.fiber!.dispose()
    expect(ctx.get('spendLimit')).toBeUndefined()
    await consume(ctx.llm.stream(request))
    expect(sent).toBe(2)
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
