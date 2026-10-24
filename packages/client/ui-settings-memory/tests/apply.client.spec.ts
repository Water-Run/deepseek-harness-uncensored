/** What the browser half registers, what the face reaches, and that it all leaves with the fiber. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject } from '../src/client/index.ts'
import type { MemoryRowFace } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'

const RECORD = {
  id: 'm-1',
  type: 'project-fact',
  content: '构建命令是 pnpm run build',
  scope: { global: false, workspace: 'workspace:a', mode: 'standard' },
  source: { kind: 'user', confirmed: true },
  status: 'enabled',
  version: 1,
  contentHash: 'hash',
  createdAt: '2026-10-24T00:00:00.000Z',
  updatedAt: '2026-10-24T00:00:00.000Z',
} as const

/** One browser bench with the settings section declared and the memory namespace scripted. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const describeMemory = vi.fn(() => Promise.resolve({
    ok: true as const,
    value: {
      limits: { maxEntries: 6, maxEntryChars: 800, maxContextBytes: 4096, minRelevance: 0.2, maxContentChars: 4000 },
      workspaces: [{ value: 'workspace:a', label: '仓库 A' }],
      modes: [{ value: 'standard', label: 'standard' }],
    },
  }))
  const listMemory = vi.fn(() => Promise.resolve({ ok: true as const, value: { records: [RECORD] } }))
  const removeMemory = vi.fn(() => Promise.resolve({ ok: true as const, value: { removed: true } }))
  const createMemory = vi.fn(() => Promise.resolve({ ok: true as const, value: { record: RECORD } }))
  new TestRemote(ctx, {
    memory: {
      describe: describeMemory,
      list: listMemory,
      create: createMemory,
      update: vi.fn(),
      setStatus: vi.fn(),
      remove: removeMemory,
    },
  })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  return { ctx, slots, describeMemory, listMemory, removeMemory, createMemory }
}

describe('ui-settings-memory apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.memory'])
  })

  it('registers one General-settings row and removes it with the fiber', async () => {
    const { ctx, slots } = await bench()

    const fiber = await ctx.plugin({ inject: [...inject], apply }).await()

    await vi.waitFor(() => { expect(slots.entries('settings.general.item')).toHaveLength(1) })
    const entry = slots.entries('settings.general.item')[0]
    expect(entry?.options).toMatchObject({ id: 'memory', order: 8 })
    // The row stays inside the existing General section: no sixth navigation group.
    expect(slots.entries('settings.section').some(section => section.options.id === 'memory')).toBe(false)

    await fiber.dispose()
    expect(slots.entries('settings.general.item')).toHaveLength(0)
  })

  it('reaches the Host namespace only when the row asks, and reports failures', async () => {
    const { ctx, slots, describeMemory, listMemory } = await bench()
    const fiber = await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('settings.general.item')).toHaveLength(1) })
    // Nothing is fetched during apply.
    expect(describeMemory).not.toHaveBeenCalled()
    expect(listMemory).not.toHaveBeenCalled()

    const entry = slots.entries('settings.general.item')[0]
    const face = (entry?.inject as () => MemoryRowFace)()
    await face.open()
    expect(describeMemory).toHaveBeenCalledOnce()
    expect(listMemory).toHaveBeenCalledOnce()
    expect(face.hooks.memories.getSnapshot().records).toHaveLength(1)

    await face.askDelete(RECORD as never)
    await face.confirmDelete()
    expect(face.hooks.memories.getSnapshot().records).toHaveLength(1)
    await fiber.dispose()
  })

  it('maps a Host refusal onto the row error state', async () => {
    const { ctx, slots, createMemory } = await bench()
    createMemory.mockResolvedValueOnce({
      ok: false,
      error: new RemoteError('memory/invalid', 'cannot store', { reason: 'too long' }),
    } as never)
    const fiber = await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('settings.general.item')).toHaveLength(1) })
    const entry = slots.entries('settings.general.item')[0]
    const face = (entry?.inject as () => MemoryRowFace)()
    await face.saveDraft()
    expect(face.hooks.memories.getSnapshot().error).toBeUndefined()

    face.addDraft()
    face.changeDraft({ content: '新的项目事实', workspace: 'workspace:a' })
    await face.saveDraft()
    expect(face.hooks.memories.getSnapshot().error).toBe('invalid')
    expect(face.hooks.memories.getSnapshot().draft?.content).toBe('新的项目事实')
    await fiber.dispose()
  })

  it('surfaces a failed describe as an error instead of throwing', async () => {
    const { ctx, slots, describeMemory } = await bench()
    describeMemory.mockResolvedValueOnce({
      ok: false,
      error: new RemoteError('memory/unavailable', 'storage unavailable', { reason: 'storage' }),
    } as never)
    const fiber = await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('settings.general.item')).toHaveLength(1) })
    const face = (slots.entries('settings.general.item')[0]?.inject as () => MemoryRowFace)()
    await face.open()
    expect(face.hooks.memories.getSnapshot().error).toBe('unavailable')
    await fiber.dispose()
  })
})
