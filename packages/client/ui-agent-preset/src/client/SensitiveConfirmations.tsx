/** General Settings row and countdown overlay for the sensitive-action confirmation preference. */
import { useEffect } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal, Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SensitiveConfirmationsController } from './sensitive-confirmations-controller.ts'
import css from './SensitiveConfirmations.module.css'

/** Preference operations and the state the row and its overlay render. */
export interface SensitiveConfirmationsInjected {
  hooks: {
    /** Preference snapshot bound by the renderer as useSensitiveConfirmations. */
    sensitiveConfirmations: SensitiveConfirmationsController['state']
  }
  /** Read the persisted preference. */
  loadConfirmations(): Promise<void>
  /** Request a preference change; disabling opens the countdown. */
  saveConfirmations(value: boolean): Promise<void>
  /** Submit the open countdown. */
  confirmConfirmations(): Promise<void>
  /** Abandon the open countdown. */
  cancelConfirmations(): void
  /** Acknowledge the notification whose Toast finished. */
  dismissConfirmations(id: number): void
}

type Common = InjectFace<SensitiveConfirmationsInjected> & PropsLocale<'settings.agentPreset'>

/**
 * Render the preference switch in the General settings section. The preference
 * governs every mode, so it does not belong to the mode page.
 * @param props - Preference operations, snapshot hook and localized text.
 * @returns The settings row.
 */
export function SensitiveConfirmationsSetting({
  useSensitiveConfirmations, loadConfirmations, saveConfirmations, t,
}: PropsRuntime<'settings.general.item'> & Common) {
  const state = useSensitiveConfirmations(value => value)
  // The row carries no page load of its own: reading here keeps the displayed
  // switch independent of whether the Modes page was ever opened.
  useEffect(() => { void loadConfirmations() }, [loadConfirmations])
  return <div className={css.row}>
    <div>
      <div className={css.title}>{t('sensitive.allow')}</div>
      <div className={css.description}>{t('sensitive.hint')}</div>
    </div>
    <div className={css.actions}>
      {state.status === 'error' && <Button variant="ghost" onClick={() => { void loadConfirmations() }}>{t('sensitive.reload')}</Button>}
      <Switch label={t('sensitive.allow')} checked={state.confirmations}
        disabled={state.status !== 'ready' || !state.writable || state.saving}
        onChange={(value) => { void saveConfirmations(value) }} />
    </div>
  </div>
}

/**
 * Render the countdown a disable needs, above the page that requested it.
 * @param props - Preference operations, snapshot hook and localized text.
 * @returns The confirmation dialog and its notification, or nothing while idle.
 */
export function SensitiveConfirmationsPrompt({
  useSensitiveConfirmations, confirmConfirmations, cancelConfirmations, dismissConfirmations, t,
}: PropsRuntime<'shell.overlay'> & Common) {
  const state = useSensitiveConfirmations(value => value)
  const confirmation = state.confirmation
  const toast = state.toast
  return <>
    {toast === null ? null : <Toast key={toast.id} text={toast.text} {...toast.success ? { tone: 'success' as const } : {}}
      onDone={() => { dismissConfirmations(toast.id) }} />}
    <Modal open={confirmation !== null} onClose={() => { if (!state.saving) cancelConfirmations() }}
      closeLabel={t('close')} title={t('sensitive.confirmTitle')}
      footer={<>
        <Button variant="outline" disabled={state.saving} onClick={cancelConfirmations}>{t('sensitive.cancel')}</Button>
        <Button variant="primary" disabled={state.saving || (confirmation?.remaining ?? 1) > 0}
          onClick={() => { void confirmConfirmations() }}>
          {confirmation?.error ? t('sensitive.retry') : confirmation?.remaining
            ? t('sensitive.countdown', { seconds: String(confirmation.remaining) }) : t('sensitive.confirm')}
        </Button>
      </>}>
      <p className={css.warning}>{t('sensitive.warning')}</p>
      <p className={css.note}>{t('sensitive.off')}</p>
      {confirmation?.error && <p role="alert" className={css.error}>{t('sensitive.saveFailed')}</p>}
    </Modal>
  </>
}
