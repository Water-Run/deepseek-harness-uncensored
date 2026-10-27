// @vitest-environment jsdom
/** Quick-question reasoning row: read/write the live Host setting and its states. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-settings/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { AsideReasoningController, type SettingsRemoteFace } from '../src/client/asides/reasoning-settings.ts'
import { AsideReasoningRow } from '../src/client/asides/ReasoningSettings.tsx'

afterEach(() => { cleanup() })

function namespaceView(overrides: Partial<SettingsNamespaceView> = {}): SettingsNamespaceView {
  return {
    autoGenerate: false, ns: 'session-controller', schema: {}, value: { btwReasoningEffort: 'low' },
    revision: 3, applies: 'live', secrets: [], ...overrides,
  }
}

function describeValue(overrides: Partial<SettingsDescribeValue> = {}): SettingsDescribeValue {
  return { writable: true, hasDocument: false, namespaces: [namespaceView()], ...overrides }
}

function remote(overrides: Partial<SettingsRemoteFace> = {}): SettingsRemoteFace {
  return {
    describe: vi.fn(async () => ({ ok: true as const, value: describeValue() })),
    update: vi.fn(async () => ({ ok: true as const, value: namespaceView({ value: { btwReasoningEffort: 'high' }, revision: 4 }) })),
    ...overrides,
  }
}

it('discovers the owning namespace by field and reads the current level', async () => {
  const describe = vi.fn(async () => ({ ok: true as const, value: describeValue() }))
  const settings = remote({ describe })
  const state = await new AsideReasoningController(settings).load()
  expect(state).toEqual({ status: 'ready', value: 'low', writable: true })
  expect(describe).toHaveBeenCalledOnce()
})

it('reports unavailable when no namespace carries the field or the read fails', async () => {
  const absent = remote({
    describe: vi.fn(async () => ({ ok: true as const, value: describeValue({ namespaces: [namespaceView({ ns: 'other', value: { other: true } })] }) })),
  })
  expect(await new AsideReasoningController(absent).load()).toEqual({ status: 'unavailable', value: 'low', writable: false })
  const failed = remote({ describe: vi.fn(async () => ({ ok: false as const, error: new RemoteError('gateway/internal', 'down', {}) })) })
  expect(await new AsideReasoningController(failed).load()).toEqual({ status: 'unavailable', value: 'low', writable: false })
})

it('writes with the read revision and projects the accepted value', async () => {
  const update = vi.fn(async () => ({ ok: true as const, value: namespaceView({ value: { btwReasoningEffort: 'high' }, revision: 4 }) }))
  const settings = remote({ update })
  const controller = new AsideReasoningController(settings)
  await controller.load()
  const next = await controller.save('high')
  expect(update).toHaveBeenCalledWith('session-controller', { btwReasoningEffort: 'high' }, 3)
  expect(next).toEqual({ status: 'ready', value: 'high', writable: true })
  const failed = remote({
    update: vi.fn(async () => ({ ok: false as const, error: new RemoteError('settings/conflict', 'stale', { ns: 'session-controller', expected: 3, actual: 4 }) })),
  })
  const rejected = new AsideReasoningController(failed)
  await rejected.load()
  expect(await rejected.save('max')).toEqual({ status: 'error', value: 'max', writable: true })
})

it('renders the current level, saves a pick, and surfaces failures and absence', async () => {
  const load = vi.fn(async () => ({ status: 'ready' as const, value: 'low' as const, writable: true }))
  const save = vi.fn(async () => ({ status: 'ready' as const, value: 'high' as const, writable: true }))
  const t = (key: string): string => key
  render(<AsideReasoningRow load={load} save={save} t={t} />)
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'aside.reasoning.low' }).disabled).toBe(false) })
  const trigger = screen.getByRole('button', { name: 'aside.reasoning.low' })
  await act(async () => { fireEvent.click(trigger) })
  const option = await screen.findByRole('menuitem', { name: 'aside.reasoning.high' })
  await act(async () => { fireEvent.click(option) })
  expect(save).toHaveBeenCalledWith('high')
  await waitFor(() => { expect(screen.getByRole('button', { name: 'aside.reasoning.high' }).textContent).toContain('aside.reasoning.high') })

  cleanup()
  const failing = vi.fn(async () => ({ status: 'error' as const, value: 'low' as const, writable: true }))
  render(<AsideReasoningRow load={load} save={failing} t={t} />)
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: 'aside.reasoning.low' }).disabled).toBe(false) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'aside.reasoning.low' })) })
  await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: 'aside.reasoning.max' })) })
  await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('aside.reasoning.error') })

  cleanup()
  render(<AsideReasoningRow load={async () => ({ status: 'unavailable', value: 'low', writable: false })} save={save} t={t} />)
  await waitFor(() => { expect(screen.getByText('aside.reasoning.unavailable')).toBeTruthy() })
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'aside.reasoning.low' }).disabled).toBe(true)
})
