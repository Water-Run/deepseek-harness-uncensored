// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SensitiveConfirmationsPrompt, SensitiveConfirmationsSetting } from '../src/client/SensitiveConfirmations.tsx'
import type { SensitiveConfirmationsState } from '../src/client/sensitive-confirmations-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function translate(key: keyof typeof en, params?: Record<string, unknown>): string {
  const template = en[key]
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

const READY: SensitiveConfirmationsState = {
  status: 'ready', confirmations: true, writable: true, saving: false, confirmation: null, toast: null,
}

type PromptProps = Parameters<typeof SensitiveConfirmationsPrompt>[0]
type SettingProps = Parameters<typeof SensitiveConfirmationsSetting>[0]

function injected(state: Partial<SensitiveConfirmationsState> = {}) {
  const store = createSnapshotStore<SensitiveConfirmationsState>({ ...READY, ...state })
  const actions = {
    loadConfirmations: vi.fn(async () => {}),
    saveConfirmations: vi.fn(async () => {}),
    confirmConfirmations: vi.fn(async () => {}),
    cancelConfirmations: vi.fn(),
    dismissConfirmations: vi.fn(),
  }
  const props = {
    ...actions,
    ...allowAllAccess,
    useSensitiveConfirmations: bindSnapshotSelector(store),
    t: translate,
  } as unknown as PromptProps
  return {
    actions,
    store,
    renderPrompt: () => render(<SensitiveConfirmationsPrompt {...props} />),
    renderSetting: () => render(<SensitiveConfirmationsSetting {...props as unknown as SettingProps} />),
  }
}

describe('sensitive-action confirmation setting', () => {
  it('renders the preference on by default', () => {
    injected().renderSetting()
    expect(screen.getByText(en['sensitive.allow'])).toBeTruthy()
    expect(screen.getByText(en['sensitive.hint'])).toBeTruthy()
    expect(screen.getByRole('switch', { name: en['sensitive.allow'] }).getAttribute('aria-checked')).toBe('true')
  })

  it('requests the change the person picked', () => {
    const { actions, renderSetting } = injected()
    renderSetting()
    fireEvent.click(screen.getByRole('switch', { name: en['sensitive.allow'] }))
    expect(actions.saveConfirmations).toHaveBeenCalledWith(false)
  })

  it('reads the persisted preference on mount so the General row needs no page load', () => {
    const { actions, renderSetting } = injected()
    renderSetting()
    expect(actions.loadConfirmations).toHaveBeenCalledOnce()
  })

  it('disables the switch while a request or a read is pending and offers a retry', () => {
    const saving = injected({ saving: true })
    saving.renderSetting()
    expect(screen.getByRole<HTMLButtonElement>('switch', { name: en['sensitive.allow'] }).disabled).toBe(true)
    cleanup()

    const failed = injected({ status: 'error', writable: false })
    failed.renderSetting()
    expect(screen.getByRole<HTMLButtonElement>('switch', { name: en['sensitive.allow'] }).disabled).toBe(true)
    // The mount read, then the person's retry.
    expect(failed.actions.loadConfirmations).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en['sensitive.reload'] }))
    expect(failed.actions.loadConfirmations).toHaveBeenCalledTimes(2)
  })
})

describe('sensitive-action confirmation countdown', () => {
  it('renders nothing while no countdown is open', () => {
    injected().renderPrompt()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('holds the countdown, then allows the change and reports it', () => {
    const { actions, renderPrompt } = injected({ confirmation: { remaining: 7, error: false } })
    renderPrompt()
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: en['sensitive.countdown'].replace('{seconds}', '7') })
    expect(confirm.disabled).toBe(true)
    expect(screen.getByText(en['sensitive.warning'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['sensitive.cancel'] }))
    expect(actions.cancelConfirmations).toHaveBeenCalledOnce()
    cleanup()

    const ready = injected({ confirmation: { remaining: 0, error: false } })
    ready.renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: en['sensitive.confirm'] }))
    expect(ready.actions.confirmConfirmations).toHaveBeenCalledOnce()
  })

  it('offers a retry after a rejected change and shows the completed outcome', () => {
    const { actions, renderPrompt } = injected({ confirmation: { remaining: 0, error: true } })
    renderPrompt()
    expect(screen.getByRole('alert').textContent).toBe(en['sensitive.saveFailed'])
    fireEvent.click(screen.getByRole('button', { name: en['sensitive.retry'] }))
    expect(actions.confirmConfirmations).toHaveBeenCalledOnce()
    cleanup()

    const completed = injected({ confirmations: false, toast: { id: 3, text: en['sensitive.offSaved'], success: true } })
    completed.renderPrompt()
    expect(screen.getByText(en['sensitive.offSaved'])).toBeTruthy()
  })
})

describe('sensitive-action confirmation feedback', () => {
  it('dismisses the notification once it faded, including a failed outcome', () => {
    vi.useFakeTimers()
    try {
      const { actions, renderPrompt } = injected({ toast: { id: 9, text: en['sensitive.saveFailed'], success: false } })
      renderPrompt()
      expect(screen.getByText(en['sensitive.saveFailed'])).toBeTruthy()
      act(() => { vi.advanceTimersByTime(4_000) })
      expect(actions.dismissConfirmations).toHaveBeenCalledExactlyOnceWith(9)
    } finally { vi.useRealTimers() }
  })
})

describe('sensitive-action countdown dismissal', () => {
  it('closes the countdown from the dialog chrome unless it is saving', () => {
    const { actions, renderPrompt } = injected({ confirmation: { remaining: 5, error: false } })
    renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(actions.cancelConfirmations).toHaveBeenCalledOnce()
    cleanup()

    const saving = injected({ saving: true, confirmation: { remaining: 0, error: false } })
    saving.renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    expect(saving.actions.cancelConfirmations).not.toHaveBeenCalled()
  })
})
