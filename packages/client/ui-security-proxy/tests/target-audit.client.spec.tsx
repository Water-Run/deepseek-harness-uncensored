// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TargetAuditHistory, TargetAuditId } from '@deepseek-ai/dsh-target-protection/settings'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, expect, it, vi } from 'vitest'
import type {} from '../src/client/index.ts'
import { TargetAuditSection } from '../src/client/TargetAuditSection.tsx'
import { TargetAuditController } from '../src/client/target-audit-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function history(id = '1'): TargetAuditHistory {
  return { state: 'ready', entries: [{ id: id as TargetAuditId, at: 1_792_800_000_000, revision: 5,
    operation: 'http', phase: 'preflight', effect: 'unknown', decision: 'deny', code: 'TARGET_FULLY_PROTECTED',
    fingerprint: 'b'.repeat(64), peerFingerprint: null, target: 'network 127.0.0.1 8443', peers: '203.0.113.9',
    ruleIds: ['b7777777-7777-4777-8777-777777777777'], matchedRules: 1,
    source: { sessionId: 'audit-side' as SessionId, parentSessionId: 'audit-main' as SessionId } }] }
}

function mount(read: () => Promise<RemoteResult<TargetAuditHistory>>) {
  const controller = new TargetAuditController(read)
  const unused = (): never => { throw new Error('Unused audit hook') }
  render(<TargetAuditSection modeId="security" t={makeTranslate(en)} {...allowAllAccess}
    useTargetAudit={bindSnapshotSelector(controller.state)} load={controller.load} setVisible={controller.setVisible}
    usePanelInfo={unused} useSessions={unused} useSessionStatus={unused} useSessionRetainInfo={unused}
    useWorkspaces={unused} useResource={unused} useContextMenu={unused} />)
  return controller
}

it('loads on expansion and exposes the complete record', async () => {
  const read = vi.fn(async (): Promise<RemoteResult<TargetAuditHistory>> => ({ ok: true, value: history() }))
  mount(read)
  expect(read).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en['audit.open'] }))
  expect(await screen.findByText(en['audit.reason.TARGET_FULLY_PROTECTED'])).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en['audit.details'] }))
  expect(screen.getByText('network 127.0.0.1 8443')).toBeTruthy()
  expect(screen.getByText('203.0.113.9')).toBeTruthy()
  expect(screen.getByText('b7777777-7777-4777-8777-777777777777')).toBeTruthy()
  expect(screen.getByText('Rule revision 5')).toBeTruthy()
  expect(screen.getByText('audit-side')).toBeTruthy()
  expect(screen.getByText('audit-main')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: en['audit.search'] }), { target: { value: 'audit-side' } })
  expect(screen.getByText(en['audit.reason.TARGET_FULLY_PROTECTED'])).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: en['audit.search'] }), { target: { value: 'no-such-target' } })
  expect(screen.getByText(en['audit.empty'])).toBeTruthy()
  expect(read).toHaveBeenCalledOnce()
})

it('retains loaded records when a read fails and reports writer failure separately', async () => {
  const read = vi.fn<() => Promise<RemoteResult<TargetAuditHistory>>>()
    .mockResolvedValueOnce({ ok: true, value: history() })
    .mockResolvedValueOnce({ ok: false, error: new RemoteError('target-protection/unavailable', 'audit read failed', {}) })
    .mockResolvedValueOnce({ ok: true, value: { ...history(), state: 'unavailable' } })
  mount(read)
  fireEvent.click(screen.getByRole('button', { name: en['audit.open'] }))
  await screen.findByText(en['audit.reason.TARGET_FULLY_PROTECTED'])
  fireEvent.click(screen.getByRole('button', { name: en['audit.refresh'] }))
  await screen.findByText(en['audit.failure.failed'])
  expect(screen.getByText(en['audit.reason.TARGET_FULLY_PROTECTED'])).toBeTruthy()
  expect(screen.queryByText(en['audit.unavailable'])).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en['audit.refresh'] }))
  await screen.findByText(en['audit.unavailable'])
  expect(screen.queryByText(en['audit.failure.failed'])).toBeNull()
})

it('coalesces status changes while expanded and keeps collapsed reads dormant', async () => {
  const stale = Promise.withResolvers<RemoteResult<TargetAuditHistory>>()
  const late = Promise.withResolvers<RemoteResult<TargetAuditHistory>>()
  const read = vi.fn<() => Promise<RemoteResult<TargetAuditHistory>>>()
    .mockImplementationOnce(() => stale.promise)
    .mockResolvedValueOnce({ ok: true, value: { ...history('2'), state: 'unavailable' } })
    .mockImplementationOnce(() => late.promise)
  const controller = mount(read)
  act(controller.refresh)
  expect(read).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en['audit.open'] }))
  act(() => { controller.refresh(); controller.refresh() })
  expect(read).toHaveBeenCalledOnce()
  await act(async () => { stale.resolve({ ok: true, value: history('1') }) })
  expect(await screen.findByText(en['audit.unavailable'])).toBeTruthy()
  expect(controller.state.getSnapshot().history?.entries[0]?.id).toBe('2')
  expect(read).toHaveBeenCalledTimes(2)

  act(controller.refresh)
  fireEvent.click(screen.getByRole('button', { name: en['audit.close'] }))
  act(() => { controller.refresh(); controller.reset() })
  await act(async () => { late.resolve({ ok: true, value: history('3') }) })
  expect(read).toHaveBeenCalledTimes(3)
  expect(controller.state.getSnapshot()).toEqual({ history: null, loading: false, failure: null })
})

it('drops old-connection replies and clears records when access is withdrawn', async () => {
  const first = Promise.withResolvers<RemoteResult<TargetAuditHistory>>()
  const read = vi.fn<() => Promise<RemoteResult<TargetAuditHistory>>>()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValueOnce({ ok: true, value: history('2') })
    .mockResolvedValueOnce({ ok: false, error: new RemoteError('target-protection/owner-required', 'owner required', {}) })
  const controller = new TargetAuditController(read)
  controller.setVisible(true)
  controller.reset()
  await waitFor(() => { expect(controller.state.getSnapshot().history?.entries[0]?.id).toBe('2') })
  await act(async () => { first.resolve({ ok: true, value: history('1') }) })
  expect(controller.state.getSnapshot().history?.entries[0]?.id).toBe('2')
  controller.load()
  await waitFor(() => { expect(controller.state.getSnapshot()).toMatchObject({ history: null, failure: 'denied' }) })
  controller.dispose()
})
