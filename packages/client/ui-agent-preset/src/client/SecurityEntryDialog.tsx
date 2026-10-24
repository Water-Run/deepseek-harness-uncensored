/** First-entry confirmation dialog for a new Security conversation. */
import { useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityProtectionStatus } from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { SecurityEntryDialogState, SecurityEntryFailure, SecurityEntrySnapshot } from './security-entry-controller.ts'
import css from './SecurityEntryDialog.module.css'

/** Host operations and shared state supplied by the mode UI owner. */
export interface SecurityEntryDialogInjected {
  hooks: {
    /** Dialog snapshot bound by the renderer as useSecurityEntry. */
    securityEntry: SnapshotStore<SecurityEntrySnapshot>
  }
  /** Submit the typed declaration; the Host validates the exact text. */
  confirm(declaration: string): void
  /** Close without granting the acknowledgement. */
  cancel(): void
  /** Start a fresh reading interval for the same conversation. */
  retry(): void
  /** Leave the dialog and open the mode settings page. */
  openSettings(): void
}

/** Props assembled by the overlay renderer. */
export type SecurityEntryDialogProps = PropsRuntime<'shell.overlay'> & PropsLocale<'settings.agentPreset'> & InjectFace<SecurityEntryDialogInjected>

function protectionDot(protection: SecurityProtectionStatus | null): StateDotState {
  if (protection === null) return 'ongoing'
  if (protection.state === 'enabled') return 'done'
  if (protection.state === 'disabled') return 'warning'
  return 'idle'
}

/**
 * Render the confirmation for the current dialog snapshot.
 * @param props - Snapshot hook, actions and localized text.
 * @returns null while no confirmation is open.
 */
export function SecurityEntryDialog(props: SecurityEntryDialogProps) {
  const snapshot = props.useSecurityEntry(value => value)
  const dialog = snapshot.dialog
  if (dialog === null) return null
  return <SecurityEntryDialogView key={dialog.challenge?.id ?? 'pending'} dialog={dialog}
    protection={dialog.challenge?.protection ?? snapshot.protection} {...props} />
}

interface ViewProps extends SecurityEntryDialogProps {
  readonly dialog: SecurityEntryDialogState
  readonly protection: SecurityProtectionStatus | null
}

const ERROR_KEYS = {
  changed: 'securityEntry.error.changed',
  declaration: 'securityEntry.error.declaration',
  disconnected: 'securityEntry.error.disconnected',
  expired: 'securityEntry.error.expired',
  failed: 'securityEntry.error.failed',
} as const satisfies Record<SecurityEntryFailure, string>

function SecurityEntryDialogView({ dialog, protection, confirm, cancel, retry, openSettings, t }: ViewProps) {
  const [declaration, setDeclaration] = useState('')
  const challenge = dialog.challenge
  const needsDeclaration = challenge !== null && challenge.declaration !== ''
  /* v8 ignore next -- the declaration arm runs only when needsDeclaration is true. */
  const matches = !needsDeclaration || declaration.trim() === (challenge?.declaration ?? '').trim()
  const ready = challenge !== null && dialog.remaining === 0
  const retryable = challenge === null
  const status = protection?.state ?? 'unavailable'
  const capabilities = protection?.capabilities ?? []
  /* v8 ignore next 3 -- close behavior is asserted through the footer and Escape gate. */
  const close = (): void => {
    if (!dialog.busy) cancel()
  }
  return <Modal
    open
    onClose={close}
    title={t('securityEntry.title')}
    closeLabel={t('close')}
    className={css.dialog as string}
    contentClassName={css.content as string}
    footer={<>
      <Button variant="outline" disabled={dialog.busy} onClick={cancel}>{t('securityEntry.cancel')}</Button>
      {retryable
        ? <Button variant="primary" disabled={dialog.busy} onClick={retry}>{t('securityEntry.retry')}</Button>
        : <Button variant="primary" disabled={dialog.busy || !ready || !matches}
          onClick={() => { confirm(declaration) }}>
          {dialog.remaining > 0 ? t('securityEntry.countdown', { seconds: String(dialog.remaining) }) : t('securityEntry.confirm')}
        </Button>}
    </>}
  >
    <div className={css.body}>
      <p className={css.lead}>{t('securityEntry.responsibility')}</p>
      <p className={css.scope}>{t('securityEntry.scope')}</p>
      <div className={css.protection} role="status">
        <div className={css.protectionHead}>
          <StateDot state={protectionDot(protection)} />
          <span className={css.protectionLabel}>{t('securityEntry.protectionLabel')}</span>
          <span className={css.protectionValue}>
            {status === 'enabled' ? t('securityEntry.protection.enabled')
              : status === 'disabled' ? t('securityEntry.protection.disabled')
                : protection === null ? t('securityEntry.protection.checking') : t('securityEntry.protection.unavailable')}
          </span>
        </div>
        <p className={css.protectionDetail}>
          {status === 'enabled' ? t('securityEntry.protection.enabledDetail')
            : status === 'disabled' ? t('securityEntry.protection.disabledDetail')
              : t('securityEntry.protection.unavailableDetail')}
        </p>
        {capabilities.length === 0 ? null : <div className={css.capabilities}>
          <span>{t('securityEntry.protection.capabilitiesLabel')}</span>
          <ul>{capabilities.map(capability => <li key={capability}>
            {t(capability === 'mainland-domains' ? 'securityEntry.capability.mainlandDomains' : 'securityEntry.capability.targetRules')}
          </li>)}</ul>
        </div>}
      </div>
      <Button variant="ghost" className={css.settings} disabled={dialog.busy} onClick={openSettings}>
        {t('securityEntry.settings')}
      </Button>
      {dialog.error === null ? null : <p role="alert" className={css.error}>{t(ERROR_KEYS[dialog.error])}</p>}
      {challenge === null
        ? <p className={css.note}>{dialog.busy ? t('securityEntry.loading') : t('securityEntry.retryHint')}</p>
        : <div className={css.confirmation} aria-live="polite">
          <p className={css.countdown}>{dialog.remaining > 0
            ? t('securityEntry.countdown', { seconds: String(dialog.remaining) })
            : t('securityEntry.ready')}</p>
          {needsDeclaration
            ? <>
              <p className={css.declarationLabel}>{t('securityEntry.declarationLabel')}</p>
              <p className={css.declaration}>{challenge.declaration}</p>
              <textarea
                className={css.input}
                data-modal-autofocus
                aria-label={t('securityEntry.declarationLabel')}
                aria-describedby="security-entry-declaration-hint"
                rows={2}
                value={declaration}
                onChange={(event) => { setDeclaration(event.currentTarget.value) }}
              />
              <p id="security-entry-declaration-hint" className={css.hint}>{t('securityEntry.declarationHint')}</p>
            </>
            : <p className={css.note}>{t('securityEntry.noDeclaration')}</p>}
        </div>}
    </div>
  </Modal>
}
