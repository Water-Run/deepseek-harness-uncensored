/** Spending controls and accessible rolling-window bars over a root-owned controller. */
import { useId, useState } from 'react'
import { Button, Input, StateDot, Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SpendPeriod, SpendPreferences, SpendSnapshot, SpendWindow } from '@deepseek-ai/dsh-spend-limit/types'
import type { SpendingController } from './spending-controller.ts'
import css from './SpendingView.module.css'

/** Store and operations supplied once by the account plugin. */
export interface SpendingInjected {
  hooks: { spending: SpendingController['state'] }
  configureSpending(value: SpendPreferences): Promise<boolean>
  resetSpending(): Promise<boolean>
  resumeSpending(): Promise<boolean>
  refreshSpending(): void
  dismissSpendingToast(id: number): void
}
type Common = InjectFace<SpendingInjected> & PropsLocale<'settings.account'>
const money = (value: number): string => `¥${value.toFixed(value < 0.01 && value > 0 ? 4 : 2)}`
const invalidLimit = (value: string | undefined): boolean => value !== undefined
  && (!Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 1_000_000)

function Status({ data, t }: { data: SpendSnapshot; t: Common['t'] }) {
  return <span>{t(!data.preferences.enabled ? 'spending.off' : hasBlockedSessions(data) ? 'spending.paused' : data.waiting > 0 ? 'spending.waiting' : 'spending.active', { count: data.waiting })}</span>
}

function hasBlockedSessions(data: SpendSnapshot): boolean {
  return data.paused || data.pausedSessions.some(session => session.state === 'blocked')
}

function WindowBar({ window, label, t }: { window: SpendWindow; label: string; t: Common['t'] }) {
  const spent = Math.min(100, window.spent / window.limit * 100)
  const reserved = Math.min(100 - spent, window.reserved / window.limit * 100)
  return <div className={css.window}>
    <div className={css.heading}><span>{label}</span><span>{money(window.spent + window.reserved)} / {money(window.limit)}</span></div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={window.limit} aria-valuenow={Math.min(window.limit, window.spent + window.reserved)}
      aria-valuetext={`${t('spending.spent')} ${money(window.spent)}, ${t('spending.reserved')} ${money(window.reserved)}, ${t('spending.remaining')} ${money(window.remaining)}`} className={css.track}>
      <span className={css.spent} style={{ width: `${spent}%` }} /><span className={css.reserved} style={{ width: `${reserved}%` }} />
    </div>
    <div className={css.details}><span>{t('spending.spent')} {money(window.spent)}</span><span>{t('spending.reserved')} {money(window.reserved)}</span><span>{t('spending.remaining')} {money(window.remaining)}</span></div>
    {window.uncertain > 0 && <p className={css.hint}>{t('spending.unknown')} {money(window.uncertain)}</p>}
  </div>
}

/** @param props - Shared ledger state and authenticated mutations. @returns Limits, progress and recovery controls. */
export function SpendingSettings({ useSpending, configureSpending, resetSpending, resumeSpending, refreshSpending, t }: PropsRuntime<'settings.budget.item'> & Common) {
  const state = useSpending(value => value)
  const data = state.data
  const [draft, setDraft] = useState<Partial<Record<SpendPeriod, string>>>({})
  const [confirm, setConfirm] = useState(false)
  const id = useId()
  const invalid = Object.values(draft).some(invalidLimit)
  if (data === undefined) return <section className={css.settings} aria-busy={!state.failed}>{state.failed ? <><p role="alert">{t('spending.failed')}</p><Button onClick={refreshSpending}>{t('spending.retry')}</Button></> : <span className={css.spinner} role="status" aria-label={t('spending.loading')}><StateDot state="ongoing" size={20} /></span>}</section>
  return <section className={css.settings}>
    <header className={css.sectionHead}><h3>{t('spending.title')}</h3><Switch label={t('spending.enabled')} checked={data.preferences.enabled} busy={state.saving} onChange={(value) => { void configureSpending({ ...data.preferences, enabled: value }) }} /></header>
    <p className={css.hint}>{t('spending.summary')}</p>
    {state.failed && <div role="alert" className={css.row}><span>{t('spending.failed')}</span><Button size="sm" onClick={refreshSpending}>{t('spending.retry')}</Button></div>}
    <div className={css.row}><div><span>{t('spending.auto')}</span><p className={css.hint}>{t('spending.autoHint')}</p></div><Switch label={t('spending.auto')} checked={data.preferences.autoResume} busy={state.saving} onChange={(value) => { void configureSpending({ ...data.preferences, autoResume: value }) }} /></div>
    <div className={css.status} role="status" data-paused={hasBlockedSessions(data)}><Status data={data} t={t} />{hasBlockedSessions(data) && <Button size="sm" disabled={state.saving} onClick={() => { void resumeSpending() }}>{t('spending.resume')}</Button>}</div>
    {data.pausedSessions.length > 0 && <p className={css.hint}>{t('spending.pausedSessions', { count: data.pausedSessions.length })}</p>}
    <div className={css.grid}>{data.windows.map(window => <div className={css.card} key={window.period}>
      <WindowBar window={window} label={t(`spending.${window.period}`)} t={t} />
      <div className={css.row}><label htmlFor={`${id}-${window.period}`}>{t('spending.limit', { period: t(`spending.${window.period}`) })}</label><Input id={`${id}-${window.period}`} type="number" min={0.000001} max={1_000_000} step="any" value={draft[window.period] ?? String(window.limit)} aria-invalid={invalidLimit(draft[window.period])} aria-describedby={invalidLimit(draft[window.period]) ? `${id}-invalid` : undefined} disabled={state.saving} onChange={(event) => { setDraft(current => ({ ...current, [window.period]: event.target.value })) }} /></div>
    </div>)}</div>
    {invalid && <p id={`${id}-invalid`} role="alert" className={css.error}>{t('spending.invalid')}</p>}
    <div className={css.actions}><Button disabled={state.saving || invalid || Object.keys(draft).length === 0} onClick={() => {
      const limits = { ...data.preferences.limits }
      for (const [period, value] of Object.entries(draft)) limits[period as SpendPeriod] = Number(value)
      void configureSpending({ ...data.preferences, limits }).then((ok) => { if (ok) setDraft({}) })
    }}>{t('spending.save')}</Button><Button className={css.reset} variant="outline" disabled={state.saving} onClick={() => { setConfirm(true) }}>{t('spending.reset')}</Button></div>
    {confirm && <div className={css.confirm}><p>{t('spending.resetHint')}</p><div className={css.actions}><Button disabled={state.saving} onClick={() => { void resetSpending().then((ok) => { if (ok) setConfirm(false) }) }}>{t('spending.resetConfirm')}</Button><Button className={css.reset} variant="outline" onClick={() => { setConfirm(false) }}>{t('spending.cancel')}</Button></div></div>}
    <p className={css.hint}>{t('spending.estimate')}</p><p className={css.hint}>{t('spending.coverage')}</p><p className={css.hint}>{t('spending.uncertain')}</p>
  </section>
}

/** @param props - Root-owned operation feedback. @returns A notification that survives closing Settings. */
export function SpendingToast({ useSpending, dismissSpendingToast, t }: PropsRuntime<'shell.overlay'> & Common) {
  const toast = useSpending(value => value.toast)
  return toast === null ? null : <Toast key={toast.id} text={t(toast.success ? 'spending.saved' : 'spending.saveFailed')} {...toast.success ? { tone: 'success' as const } : {}} onDone={() => { dismissSpendingToast(toast.id) }} />
}

/** @param props - Shared spending state. @returns Persistent feedback while admission waits. */
export function SpendingSidebar({ useSpending, wide, t }: PropsRuntime<'sidebar.footer.action'> & Common) {
  const data = useSpending(value => value.data)
  if (!data?.preferences.enabled || (!hasBlockedSessions(data) && data.waiting === 0)) return null
  return <div className={css.sidebar} role="status" aria-label={t('spending.title')}>{wide ? <Status data={data} t={t} /> : '¥'}</div>
}
