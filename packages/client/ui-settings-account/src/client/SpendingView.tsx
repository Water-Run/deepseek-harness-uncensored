/** Independent spending windows over the shared durable ledger. */
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal, StateDot, Switch, Toast, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SpendPeriod, SpendSnapshot, SpendWindow, SpendWindowUpdate } from '@deepseek-ai/dsh-spend-limit/types'
import type { SpendingController } from './spending-controller.ts'
import { LimitAmountInput } from './LimitAmountInput.tsx'
import { LimitIcon } from './BudgetIcons.tsx'
import css from './SpendingView.module.css'

/** Store and independent mutations supplied by the account plugin. */
export interface SpendingInjected {
  hooks: { spending: SpendingController['state'] }
  configureSpendingWindow(value: SpendWindowUpdate): Promise<boolean>
  setSpendingAutoResume(value: boolean): Promise<boolean>
  disableAllSpending(): Promise<boolean>
  resetSpending(period?: SpendPeriod): Promise<boolean>
  resumeSpending(): Promise<boolean>
  refreshSpending(): void
  dismissSpendingToast(id: number): void
}
type Common = InjectFace<SpendingInjected> & PropsLocale<'settings.account'>
const FEATURED: readonly SpendPeriod[] = ['5h', '7d']
const money = (value: number): string => `¥${value > 0 && value < 0.01 ? value.toFixed(6).replace(/0+$/u, '') : value.toFixed(2)}`
const invalidLimit = (value: string): boolean => value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0.000001 || Number(value) > 1_000_000
function hasBlockedSessions(data: SpendSnapshot): boolean {
  return data.paused || data.pausedSessions.some(session => session.state === 'blocked')
}

function WindowBar({ window, label, t, actions }: { window: SpendWindow; label: string; t: Common['t']; actions: ReactNode }) {
  const spent = Math.min(100, window.spent / window.limit * 100)
  const reserved = Math.min(100 - spent, window.reserved / window.limit * 100)
  return <div className={css.window}>
    <div className={css.heading}><span>{money(window.spent + window.reserved)} / {money(window.limit)}</span><span>{window.enabled ? `${Math.min(100, spent + reserved).toFixed(1)}%` : t('spending.offShort')}</span></div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={window.limit} aria-valuenow={Math.min(window.limit, window.spent + window.reserved)}
      aria-valuetext={`${t('spending.spent')} ${money(window.spent)}, ${t('spending.reserved')} ${money(window.reserved)}, ${t('spending.remaining')} ${money(window.remaining)}`} className={css.track}>
      <span className={css.spent} style={{ width: `${spent}%` }} /><span className={css.reserved} style={{ width: `${reserved}%` }} />
    </div>
    <div className={css.meterFooter}><div className={css.details}><span>{t('spending.spent')} {money(window.spent)}</span><span>{t('spending.reserved')} {money(window.reserved)}</span><span>{t('spending.remaining')} {money(window.remaining)}</span></div><div className={css.windowActions}>{actions}</div></div>
    {window.uncertain > 0 && <p className={css.hint}>{t('spending.unknown')} {money(window.uncertain)}</p>}
  </div>
}

/**
 * @param props - Current windows, shared operation state and authenticated mutations.
 * @returns Independent limits and continuation controls.
 */
export function SpendingSettings({ useSpending, configureSpendingWindow, setSpendingAutoResume, disableAllSpending, resetSpending, resumeSpending, refreshSpending, t }: PropsRuntime<'settings.budget.item'> & Common) {
  const state = useSpending(value => value)
  const data = state.data
  const [draft, setDraft] = useState<Partial<Record<SpendPeriod, string>>>({})
  const [confirm, setConfirm] = useState<SpendPeriod | 'all' | null>(null)
  const [othersOpen, setOthersOpen] = useState(false)
  const initialized = useRef(false)
  const id = useId()
  useEffect(() => {
    if (data === undefined || initialized.current) return
    initialized.current = true
    setOthersOpen(data.preferences.enabledPeriods.some(period => !FEATURED.includes(period)))
  }, [data])
  if (data === undefined) return <section className={css.settings} aria-busy={!state.failed}>{state.failed ? <><p role="alert">{t('spending.failed')}</p><Button onClick={refreshSpending}>{t('spending.retry')}</Button></> : <span className={css.spinner} role="status" aria-label={t('spending.loading')}><StateDot state="ongoing" size={20} /></span>}</section>
  const blocked = hasBlockedSessions(data)
  const active = data.preferences.enabledPeriods.length
  const featured = data.windows.filter(window => FEATURED.includes(window.period))
  const otherActive = data.windows.filter(window => window.enabled && !FEATURED.includes(window.period)).length
  const save = (window: SpendWindow, enabled?: boolean): void => {
    const submitted = draft[window.period]
    const validDraft = submitted !== undefined && !invalidLimit(submitted)
    void configureSpendingWindow({ period: window.period, ...(enabled === undefined ? {} : { enabled }),
      ...(validDraft ? { limit: Number(submitted) } : {}),
    }).then((ok) => {
      if (!ok || !validDraft) return
      setDraft((current) => {
        if (current[window.period] !== submitted) return current
        const { [window.period]: _saved, ...remaining } = current
        return remaining
      })
    })
  }
  const row = (window: SpendWindow) => {
    const label = t(`spending.${window.period}`)
    const value = draft[window.period] ?? String(window.limit)
    const invalid = invalidLimit(value)
    const changed = draft[window.period] !== undefined && Number(value) !== window.limit
    return <section className={css.card} key={window.period} data-enabled={window.enabled} role="group" aria-label={label}>
      <div className={css.limitHeader}>
        <div className={css.windowTitle}><Switch label={t('spending.windowEnabled', { period: label })} checked={window.enabled} busy={state.saving}
          disabled={!window.enabled && invalid} onChange={(enabled) => { save(window, enabled) }} /><h4>{label}</h4></div>
        <LimitAmountInput id={`${id}-${window.period}`} value={value} label={t('spending.limit', { period: label })}
          increase={t('spending.increase', { period: label })} decrease={t('spending.decrease', { period: label })} disabled={state.saving}
          invalid={invalid} descriptionId={invalid ? `${id}-${window.period}-error` : undefined}
          onChange={(text) => { setDraft(current => ({ ...current, [window.period]: text })) }} />
      </div>
      <WindowBar window={window} label={label} t={t} actions={<>
        {changed && <Button size="sm" disabled={state.saving || invalid} onClick={() => { save(window) }}>{t('spending.save')}</Button>}
        <Button size="sm" variant="ghost" disabled={state.saving} onClick={() => { setConfirm(window.period) }}>{t('spending.resetWindow')}</Button>
      </>} />
      {invalid && <p id={`${id}-${window.period}-error`} role="alert" className={css.error}>{t('spending.invalid')}</p>}
    </section>
  }
  return <section className={css.settings}>
    <header className={css.sectionHead}><h3>{t('spending.title')}</h3><span>{t('spending.enabledCount', { count: active })}</span></header>
    <p className={css.hint}>{t('spending.summary')}</p>
    {state.failed && <div role="alert" className={css.row}><span>{t('spending.failed')}</span><Button size="sm" onClick={refreshSpending}>{t('spending.retry')}</Button></div>}
    <div className={css.row}><div><span>{t('spending.auto')}</span><p className={css.hint}>{t('spending.autoHint')}</p></div><Switch label={t('spending.auto')} checked={data.preferences.autoResume} busy={state.saving} onChange={(enabled) => { void setSpendingAutoResume(enabled) }} /></div>
    {(blocked || data.waiting > 0) && <div className={css.status} role="status"><span>{t(blocked ? 'spending.paused' : 'spending.waiting', { count: data.waiting })}</span>{blocked && <Button size="sm" disabled={state.saving} onClick={() => { void resumeSpending() }}>{t('spending.resume')}</Button>}</div>}
    <div className={css.grid}>{featured.map(row)}</div>
    <details className={css.otherWindows} open={othersOpen} onToggle={(event) => { setOthersOpen(event.currentTarget.open) }}>
      <summary>{t(otherActive > 0 ? 'spending.otherEnabled' : 'spending.other', { count: otherActive })}</summary>
      {othersOpen && <div className={css.grid}>{data.windows.filter(window => !FEATURED.includes(window.period)).map(row)}</div>}
    </details>
    <div className={css.actions}><Button variant="outline" disabled={state.saving || active === 0} onClick={() => { void disableAllSpending() }}>{t('spending.disableAll')}</Button><Button variant="outline" disabled={state.saving} onClick={() => { setConfirm('all') }}>{t('spending.resetAll')}</Button></div>
    <details className={css.explanation}><summary>{t('spending.explanation')}</summary><p className={css.hint}>{t('spending.estimate')}</p><p className={css.hint}>{t('spending.coverage')}</p><p className={css.hint}>{t('spending.uncertain')}</p></details>
    <Modal open={confirm !== null} onClose={() => { setConfirm(null) }} closeLabel={t('spending.cancel')}
      title={confirm === null || confirm === 'all' ? t('spending.resetAllTitle') : t('spending.resetWindowTitle', { period: t(`spending.${confirm}`) })}
      footer={<><Button variant="outline" disabled={state.saving} onClick={() => { setConfirm(null) }}>{t('spending.cancel')}</Button><Button disabled={state.saving} onClick={() => { if (confirm !== null) void resetSpending(confirm === 'all' ? undefined : confirm).then((ok) => { if (ok) setConfirm(null) }) }}>{t('spending.resetConfirm')}</Button></>}>
      <p className={css.hint}>{t(confirm === 'all' ? 'spending.resetHint' : 'spending.resetWindowHint')}</p>
    </Modal>
  </section>
}

/** @param props - Root-owned operation feedback. @returns A notification that survives closing Settings. */
export function SpendingToast({ useSpending, dismissSpendingToast, t }: PropsRuntime<'shell.overlay'> & Common) {
  const toast = useSpending(value => value.toast)
  return toast === null ? null : <Toast key={toast.id} text={t(toast.success ? 'spending.saved' : 'spending.saveFailed')} {...toast.success ? { tone: 'success' as const } : {}} onDone={() => { dismissSpendingToast(toast.id) }} />
}

/** @param props - Shared admission state and recovery controls. @returns Compact status above the balance reading. */
export function SpendingSidebar({ useSpending, wide, resumeSpending, refreshSpending, t }: PropsRuntime<'sidebar.footer.budget'> & Common) {
  const state = useSpending(value => value)
  const data = state.data
  if (!state.failed && (data === undefined || data.preferences.enabledPeriods.length === 0
    || (!hasBlockedSessions(data) && data.waiting === 0))) return null
  const blocked = data !== undefined && hasBlockedSessions(data)
  const label = t(state.failed ? 'spending.failedShort' : blocked
    ? (data.waiting > 0 ? 'spending.pausedWaiting' : 'spending.pausedShort') : 'spending.waiting', { count: data?.waiting ?? 0 })
  if (!wide) return <Tooltip label={label}><button className={css.railStatus} aria-label={blocked ? t('spending.resume') : t('spending.retry')} disabled={state.saving} onClick={() => { if (blocked && !state.failed) void resumeSpending(); else refreshSpending() }}><LimitIcon /></button></Tooltip>
  return <div className={css.sidebar} data-failed={state.failed} role="status">
    <span className={css.noticeIcon}><LimitIcon /></span><span className={css.noticeText}>{label}</span>
    {state.failed ? <Button size="sm" variant="ghost" onClick={refreshSpending}>{t('spending.retry')}</Button> : blocked && <Button size="sm" variant="ghost" disabled={state.saving} onClick={() => { void resumeSpending() }}>{t('spending.resume')}</Button>}
  </div>
}
