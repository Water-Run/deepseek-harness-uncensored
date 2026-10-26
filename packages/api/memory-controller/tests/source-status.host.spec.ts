import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { MemoryRecord } from '@deepseek-ai/dsh-memory/types'
import { MemoryController } from '../src/index.ts'

const record: MemoryRecord = {
  id: 'memory-a' as MemoryRecord['id'], type: 'project-fact', content: 'Build with pnpm',
  scope: { global: false, workspace: 'workspace:a', mode: 'standard' },
  source: { kind: 'assistant', sessionId: 'session-a' as NonNullable<MemoryRecord['source']['sessionId']>, confirmed: false },
  status: 'enabled', version: 1, contentHash: 'hash', createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z',
}

it('keeps memory after source removal and reports a failed listing separately', async () => {
  const ctx = new Context()
  const listSessions = vi.fn(async () => [{ header: { id: record.source.sessionId } }])
  try {
    ctx.provide('memory', { list: () => [record] })
    ctx.provide('sessionQuery', { listSessions })
    ctx.provide('sessionPersistence', {})
    const controller = new MemoryController(ctx)
    expect((await controller.list({})).sources).toEqual({ 'memory-a': 'present' })
    listSessions.mockResolvedValueOnce([])
    expect(await controller.list({})).toEqual({ records: [record], sources: { 'memory-a': 'missing' } })
    listSessions.mockRejectedValueOnce(new Error('Unavailable storage'))
    expect(await controller.list({})).toEqual({ records: [record], sources: { 'memory-a': 'unknown' } })
    expect((await controller.list({})).sources).toEqual({ 'memory-a': 'present' })
  } finally { await ctx.fiber.dispose() }
})

it('does not infer source deletion when persistence is unavailable', async () => {
  const ctx = new Context()
  const listSessions = vi.fn(async () => [])
  try {
    ctx.provide('memory', { list: () => [record] })
    ctx.provide('sessionQuery', { listSessions })
    const controller = new MemoryController(ctx)
    expect((await controller.list({})).sources).toEqual({ 'memory-a': 'unknown' })
    expect(listSessions).not.toHaveBeenCalled()
  } finally { await ctx.fiber.dispose() }
})
