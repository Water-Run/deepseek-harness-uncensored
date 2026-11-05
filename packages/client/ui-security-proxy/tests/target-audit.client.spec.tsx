// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TargetAuditHistory, TargetAuditId } from '@deepseek-ai/dsh-target-protection/settings'
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
    fingerprint: 'b'.repeat(64), peerFingerprint: null, ruleIds: ['b7777777-7777-4777-8777-777777777777'], matchedRules: 1 }] }
}

function mount(read: () => Promise<RemoteResult<TargetAuditHistory>>) {
  const controller = new TargetAuditController(read)
  const unused = (): never => { throw new Error('Unused audit hook') }
  render(<TargetAuditSection modeId="security" t={makeTranslate(en)} {...allowAllAccess}
    useTargetAudit={bindSnapshotSelector(controller.state)} load={controller.load}
    usePanelInfo={unused} useSessions={unused} useSessionStatus={unused} useSessionRetainInfo={unused}
    useWorkspaces={unused} useResource={unused} useContextMenu={unused} />)
  return controller
}

it('loads on expansion and exposes the complete redacted record', async () => {
  const read = vi.fn(async (): Promise<RemoteResult<TargetAuditHistory>> => ({ ok: true, value: history() }))
  mount(read)
  expect(read).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en['audit.open'] }))
  expect(await screen.findByText(en['audit.reason.TARGET_FULLY_PROTECTED'])).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en['audit.details'] }))
  expect(screen.getByText('b'.repeat(64))).toBeTruthy()
  expect(screen.getByText('b7777777-7777-4777-8777-777777777777')).toBeTruthy()
  expect(screen.getByText('Rule revision 5')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: en['audit.search'] }), { target: { value: 'no-such-fingerprint' } })
  expect(screen.getByText(en['audit.empty'])).toBeTruthy()
  expect(read).toHaveBeenCalledOnce()
})

it('retains the accepted records on a refresh failure and shows an unavailable writer', async () => {
  const read = vi.fn<() => Promise<RemoteResult<TargetAuditHistory>>>()
    .mockResolvedValueOnce({ ok: true, value: { ...history(), state: 'unavailable' } })
    .mockRejectedValueOnce(new Error('network disconnected'))
  mount(read)
  fireEvent.click(screen.getByRole('button', { name: en['audit.open'] }))
  await screen.findByText(en['audit.unavailable'])
  fireEvent.click(screen.getByRole('button', { name: en['audit.refresh'] }))
  await screen.findByText(en['audit.failure.failed'])
  expect(screen.getByText(en['audit.reason.TARGET_FULLY_PROTECTED'])).toBeTruthy()
})

it('drops old-connection replies and clears records when access is withdrawn', async () => {
  const first = Promise.withResolvers<RemoteResult<TargetAuditHistory>>()
  const read = vi.fn<() => Promise<RemoteResult<TargetAuditHistory>>>()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValueOnce({ ok: true, value: history('2') })
    .mockResolvedValueOnce({ ok: false, error: new RemoteError('target-protection/owner-required', 'owner required', {}) })
  const controller = new TargetAuditController(read)
  controller.load()
  controller.reset()
  await waitFor(() => { expect(controller.state.getSnapshot().history?.entries[0]?.id).toBe('2') })
  await act(async () => { first.resolve({ ok: true, value: history('1') }) })
  expect(controller.state.getSnapshot().history?.entries[0]?.id).toBe('2')
  controller.load()
  await waitFor(() => { expect(controller.state.getSnapshot()).toMatchObject({ history: null, failure: 'denied' }) })
  controller.dispose()
})
