import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { PeerId, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { MemoryController } from '../src/index.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Scoped caller used to verify memory management isolation. */
    'memory-test': { kind: 'memory-test' }
  }
}

it('allows owner management but denies delegated reads before inspecting stored records', async () => {
  const ctx = new Context()
  const list = vi.fn(() => [])
  const records = vi.fn(() => [])
  const limits = vi.fn(() => ({ maxEntries: 6, maxEntryChars: 800, maxContextBytes: 4096, minRelevance: 0.2, maxContentChars: 4000 }))
  try {
    ctx.provide('memory', { list, records, limits })
    new MemoryController(ctx)
    expect(await ctx.memoryController.list({})).toEqual({ records: [], sources: {} })
    expect(ctx.memoryController.describe().modes).toEqual([])
    list.mockClear(); records.mockClear(); limits.mockClear()
    const invocation: RemoteInvocation = {
      request: { namespace: 'memory', method: 'list', args: {} }, service: 'memoryController',
      peer: { id: 'memory-reader' as PeerId, ctx, principal: { kind: 'memory-test' }, interactions: 'none',
        signal: new AbortController().signal, dispose: async () => {} },
      signal: new AbortController().signal,
      uplink: async function *<In>(): AsyncIterable<In> {},
    }
    const caller = ctx.extend({ invocation })
    await expect(caller.memoryController.list({})).rejects.toThrow('Only the application owner')
    expect(() => caller.memoryController.describe()).toThrow('Only the application owner')
    expect(list).not.toHaveBeenCalled()
    expect(records).not.toHaveBeenCalled()
    expect(limits).not.toHaveBeenCalled()
  } finally { await ctx.fiber.dispose() }
})
