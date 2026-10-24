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
import { DEFAULT_RATES } from '../src/pricing.ts'
import type { PeerId, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { 'spending-viewer-test': { kind: 'spending-viewer-test' } }
}

it('refuses budget mutations from an agent or delegated viewer', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(spending, { path: ':memory:', pollMs: 50, rates: DEFAULT_RATES }).await()
    const invocation: RemoteInvocation = {
      request: { namespace: 'spending', method: 'configure', args: {} }, service: 'spendLimit',
      peer: { id: 'spending-viewer' as PeerId, ctx, principal: { kind: 'spending-viewer-test' }, interactions: 'answer',
        signal: new AbortController().signal, dispose: async () => {} },
      signal: new AbortController().signal,
      uplink: <In>(): AsyncIterable<In> => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    }
    const viewer = ctx.extend({ invocation }).spendLimit
    await expect(viewer.configure({ ...DEFAULT_PREFERENCES, enabled: true })).rejects.toMatchObject({ code: 'spending/owner-required' })
    await expect(viewer.resume()).rejects.toMatchObject({ code: 'spending/owner-required' })
    await expect(viewer.reset()).rejects.toMatchObject({ code: 'spending/owner-required' })
    expect((await ctx.spendLimit.get()).preferences).toEqual(DEFAULT_PREFERENCES)
  } finally { await ctx.fiber.dispose() }
})

async function consume(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) { /* Consume the complete provider lifecycle. */ }
}

it('keeps a paid request blocked when the ledger cannot open', async () => {
  const ctx = new Context()
  const root = await mkdtemp(join(tmpdir(), 'dshu-spending-closed-'))
  let sent = 0
  try {
    await ctx.plugin(LlmRuntime)
    class Adapter extends LlmAdapter {
      override async * stream(): AsyncIterable<StreamChunk> {
        sent += 1
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
    ctx.llm.registerAdapter(['deepseek-official'], new Adapter())
    await spending.apply(ctx, { path: root, pollMs: 50, rates: DEFAULT_RATES })
    await expect(consume(ctx.llm.stream({ provider: 'deepseek-official', model: 'deepseek-flash', messages: [], maxTokens: 100 }))).rejects.toThrow()
    expect(sent).toBe(0)
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

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
