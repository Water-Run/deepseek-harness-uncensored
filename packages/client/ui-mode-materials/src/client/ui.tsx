/** Small presentational pieces shared by the three mode-materials panels. */

import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MaterialsFailure } from './contract.ts'
import type { ModeMaterialsKey } from './locales.ts'
import type { DossierProblem } from '@deepseek-ai/dsh-api-mode-dossiers/types'
import css from './ModeMaterials.module.css'

/** Localized-text function these panels receive through the locale seat. */
export type Translate = (key: ModeMaterialsKey, vars?: Record<string, string | number>) => string

/** One labelled control in a panel or dialog. */
export function Field({ label, hint, children }: {
  readonly label: string
  readonly hint?: string | undefined
  readonly children: ReactNode
}): ReactNode {
  return <label className={css.field}>
    <span className={css.fieldLabel}>{label}</span>
    {children}
    {hint === undefined ? null : <span className={css.fieldHint}>{hint}</span>}
  </label>
}

/** A reported storage condition, localized by its code. */
export function ProblemNote({ problem, t }: { readonly problem: DossierProblem; readonly t: Translate }): ReactNode {
  return <p className={css.problem} role="alert">
    {t(`problem.${problem.code}`)}
    <span className={css.problemDetail}>{problem.detail}</span>
  </p>
}

/** A failed operation, with the conflict case called out as its own state. */
export function FailureNote({ failure, t, onRetry }: {
  readonly failure: MaterialsFailure
  readonly t: Translate
  readonly onRetry?: (() => void) | undefined
}): ReactNode {
  const conflict = failure.code === 'mode-dossier/conflict'
  return <div className={conflict ? css.conflict : css.error} role="alert">
    <p className={css.failureHead}>{conflict ? t('conflict') : t('unknownError', { reason: failure.message })}</p>
    {conflict ? <p className={css.failureBody}>{t('conflictHint')}</p> : null}
    {onRetry === undefined ? null : <Button variant="outline" size="sm" onClick={onRetry}>{t('reload')}</Button>}
  </div>
}

/** One modal frame with a Cancel/Confirm footer. */
export function FormModal({ open, title, children, confirmLabel, cancelLabel, busy, confirmDisabled, onConfirm, onClose }: {
  readonly open: boolean
  readonly title: string
  readonly children: ReactNode
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly busy: boolean
  readonly confirmDisabled: boolean
  readonly onConfirm: () => void
  readonly onClose: () => void
}): ReactNode {
  return <Modal open={open} onClose={busy ? () => {} : onClose} closeLabel={cancelLabel} title={title}
    className={css.dialog as string}
    footer={<>
      <Button variant="outline" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
      <Button variant="primary" onClick={onConfirm} disabled={busy || confirmDisabled}>
        {confirmLabel}
      </Button>
    </>}>
    {children}
  </Modal>
}
