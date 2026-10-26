// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MemoryRecord } from '@deepseek-ai/dsh-memory/types'
import { MemoryManager, MemoryRow } from '../src/client/MemoryRow.tsx'
import { createMemoryStore } from '../src/client/memory-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('retains the saved fact while distinguishing a missing source from an unverified source', () => {
  const store = createMemoryStore()
  const record: MemoryRecord = {
    id: 'm-1' as MemoryRecord['id'], type: 'project-fact', content: 'Build with pnpm',
    scope: { global: false, mode: 'standard' },
    source: { kind: 'assistant', sessionId: 'source-1' as NonNullable<MemoryRecord['source']['sessionId']>, confirmed: false },
    status: 'enabled', version: 1, contentHash: 'hash', createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z',
  }
  store.update((state) => { state.loading = false; state.records = [record]; state.sources = { 'm-1': 'missing' } })
  const props = {
    useMemories: bindSnapshotSelector(store), t: makeTranslate(en), open: vi.fn(async () => {}), reload: vi.fn(async () => {}),
    showManager: async () => { store.update((state) => { state.managerOpen = true }) },
    closeManager: () => { store.update((state) => { state.managerOpen = false }) },
  } as Parameters<typeof MemoryRow>[0]
  render(<><MemoryRow {...props} /><MemoryManager {...props} /></>)
  fireEvent.click(screen.getByRole('button', { name: 'Manage memory' }))
  expect(screen.getByText(en.sourceMissing)).toBeTruthy()
  expect(screen.getByText('Build with pnpm')).toBeTruthy()
  act(() => { store.update((state) => { state.sources = { 'm-1': 'unknown' } }) })
  expect(screen.queryByText(en.sourceMissing)).toBeNull()
  expect(screen.getByText(en.sourceUnknown)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
})
