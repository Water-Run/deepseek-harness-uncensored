// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  SecurityEntryChallenge, SecurityEntryChallengeId, SecurityProtectionStatus,
} from '@deepseek-ai/dsh-agent-preset-registry/types'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { SecurityEntryDialog, type SecurityEntryDialogProps } from '../src/client/SecurityEntryDialog.tsx'
import type { SecurityEntrySnapshot } from '../src/client/security-entry-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const session = SessionId('session-security-dialog')
const DECLARATION = '我确认已获得相应操作授权，并了解当前保护未启用'
const UNAVAILABLE: SecurityProtectionStatus = { state: 'unavailable', revision: 0, capabilities: [] }
const ENABLED: SecurityProtectionStatus = { state: 'enabled', revision: 3, capabilities: ['mainland-domains'] }

function translate(key: keyof typeof en, params?: Record<string, unknown>): string {
  const template = en[key]
  return params === undefined ? template : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

function challenge(protection: SecurityProtectionStatus = UNAVAILABLE, declaration = DECLARATION): SecurityEntryChallenge {
  return { id: 'challenge-dialog' as SecurityEntryChallengeId, waitMs: 10_000, declaration, protection }
}

function view(snapshot: Partial<SecurityEntrySnapshot>) {
  const store = createSnapshotStore<SecurityEntrySnapshot>({
    status: 'ready', required: true, preset: 'security', acknowledged: false, protection: UNAVAILABLE, dialog: null, ...snapshot,
  })
  const actions = { confirm: vi.fn(), cancel: vi.fn(), retry: vi.fn(), openSettings: vi.fn() }
  const props = {
    ...actions,
    useSecurityEntry: bindSnapshotSelector(store),
    t: translate,
  } as SecurityEntryDialogProps
  render(<SecurityEntryDialog {...props} />)
  return actions
}

describe('Security entry dialog', () => {
  it('renders the responsibility, unavailable protection and countdown', () => {
    view({ dialog: { sessionId: session, challenge: challenge(), remaining: 10, busy: false, error: null } })
    expect(screen.getByText(en['securityEntry.title'])).toBeTruthy()
    expect(screen.getByText(en['securityEntry.responsibility'])).toBeTruthy()
    expect(screen.getByText(en['securityEntry.scope'])).toBeTruthy()
    expect(screen.getByText(en['securityEntry.protection.unavailable'])).toBeTruthy()
    expect(screen.getByText(en['securityEntry.protection.unavailableDetail'])).toBeTruthy()
    expect(screen.getByText(DECLARATION)).toBeTruthy()
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: en['securityEntry.declarationLabel'] })).toBeTruthy()
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: en['securityEntry.countdown'].replace('{seconds}', '10') })
    expect(confirm.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: en['securityEntry.retry'] })).toBeNull()
  })

  it('requires the exact declaration before confirming', () => {
    const actions = view({ dialog: { sessionId: session, challenge: challenge(), remaining: 0, busy: false, error: null } })
    const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: en['securityEntry.declarationLabel'] })
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: en['securityEntry.confirm'] })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'wrong' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(input, { target: { value: DECLARATION } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(actions.confirm).toHaveBeenCalledExactlyOnceWith(DECLARATION)
  })

  it('enables confirmation after the countdown when protection is enabled', () => {
    const actions = view({
      protection: ENABLED,
      dialog: { sessionId: session, challenge: challenge(ENABLED, ''), remaining: 0, busy: false, error: null },
    })
    expect(screen.getByText(en['securityEntry.protection.enabled'])).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: en['securityEntry.declarationLabel'] })).toBeNull()
    expect(screen.getByText(en['securityEntry.capability.mainlandDomains'])).toBeTruthy()
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: en['securityEntry.confirm'] })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(actions.confirm).toHaveBeenCalledExactlyOnceWith('')
  })

  it('shows the disabled protection branch and the settings entry', () => {
    const actions = view({
      protection: { state: 'disabled', revision: 1, capabilities: [] },
      dialog: { sessionId: session, challenge: challenge({ state: 'disabled', revision: 1, capabilities: [] }), remaining: 0, busy: false, error: null },
    })
    expect(screen.getByText(en['securityEntry.protection.disabled'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['securityEntry.settings'] }))
    expect(actions.openSettings).toHaveBeenCalledOnce()
  })

  it('keeps declaration errors visible while the confirm action stays available', () => {
    view({ dialog: { sessionId: session, challenge: challenge(), remaining: 0, busy: false, error: 'declaration' } })
    expect(screen.getByRole('alert').textContent).toBe(en['securityEntry.error.declaration'])
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en['securityEntry.confirm'] }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: en['securityEntry.retry'] })).toBeNull()
  })

  it('offers retry when the challenge is absent', () => {
    const actions = view({ dialog: { sessionId: session, challenge: null, remaining: 0, busy: false, error: 'changed' } })
    expect(screen.getByRole('alert').textContent).toBe(en['securityEntry.error.changed'])
    fireEvent.click(screen.getByRole('button', { name: en['securityEntry.retry'] }))
    expect(actions.retry).toHaveBeenCalledOnce()
  })

  it('cancels from the footer and keeps disabled actions while submitting', () => {
    const actions = view({ dialog: { sessionId: session, challenge: challenge(), remaining: 0, busy: true, error: null } })
    const cancel = screen.getByRole<HTMLButtonElement>('button', { name: en['securityEntry.cancel'] })
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: en['securityEntry.confirm'] })
    expect(cancel.disabled).toBe(true)
    expect(confirm.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en['close'] }))
    expect(actions.cancel).not.toHaveBeenCalled()
    actions.cancel.mockClear()
    fireEvent.click(cancel)
    expect(actions.cancel).not.toHaveBeenCalled()
  })

  it('renders nothing while no dialog is open', () => {
    view({ dialog: null })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the loading state before the protection status arrives', () => {
    view({ protection: null, dialog: { sessionId: session, challenge: null, remaining: 0, busy: true, error: null } })
    expect(screen.getByText(en['securityEntry.protection.checking'])).toBeTruthy()
    expect(screen.getByText(en['securityEntry.loading'])).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en['securityEntry.retry'] }).disabled).toBe(true)
  })

  it('closes through the dialog control when idle', () => {
    const actions = view({ dialog: { sessionId: session, challenge: challenge(), remaining: 3, busy: false, error: null } })
    fireEvent.click(screen.getByRole('button', { name: en['close'] }))
    expect(actions.cancel).toHaveBeenCalledOnce()
  })

  it('lists every protection capability without hardcoded separators', () => {
    view({
      protection: { state: 'enabled', revision: 4, capabilities: ['mainland-domains', 'target-rules'] },
      dialog: {
        sessionId: session,
        challenge: challenge({ state: 'enabled', revision: 4, capabilities: ['mainland-domains', 'target-rules'] }, ''),
        remaining: 0, busy: false, error: null,
      },
    })
    expect(screen.getByText(en['securityEntry.capability.mainlandDomains'])).toBeTruthy()
    expect(screen.getByText(en['securityEntry.capability.targetRules'])).toBeTruthy()
    expect(screen.getByText(en['securityEntry.protection.capabilitiesLabel'])).toBeTruthy()
  })

  it('shows the retry hint when a non-busy dialog has no challenge', () => {
    view({ dialog: { sessionId: session, challenge: null, remaining: 0, busy: false, error: 'failed' } })
    expect(screen.getByText(en['securityEntry.retryHint'])).toBeTruthy()
    expect(screen.getByRole('button', { name: en['securityEntry.retry'] })).toBeTruthy()
  })
})
