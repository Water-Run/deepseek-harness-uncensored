/** Balance controls, observations and a shared sidebar hover card. */
import { useEffect, useId, useState } from 'react'
import { Big } from 'big.js'
import { Button, HoverCard, IconClockOutlineRegular, IconRefreshOutlineRegular, Input, PreferenceControlRow, Select, Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { BalanceCleanupRequest, BalancePreferences, BalanceSnapshot, BalanceWallet } from '@deepseek-ai/dsh-balance/types'
import type { BalanceController, BalanceViewState } from './balance-controller.ts'
import { BalanceHistory } from './BalanceHistory.tsx'
import { balancePeriod, balancePeriodEnd } from './balance-hours.ts'
import { formatBalance, formatBalanceDetail } from './formatBalance.ts'
import { RollingAmount } from './RollingAmount.tsx'
import css from './BalanceView.module.css'

/** Shared data and callbacks supplied by the account plugin. */
export interface BalanceInjected {
  hooks: { balance: SnapshotStore<BalanceViewState>; balancePreferences: ConfigForm<BalancePreferences> }
  refresh: () => void
  save: BalanceController['save']
  clear: BalanceController['clear']
  dismissToast: (id: number) => void
}
type SharedProps = PropsLocale<'settings.account'> & InjectFace<BalanceInjected>
type BalanceSettingsProps = PropsRuntime<'settings.budget.item'> & SharedProps
type BalanceSidebarProps = PropsRuntime<'sidebar.footer.budget'> & SharedProps

/** Seconds between sidebar clock ticks: the period row counts down between samples. */
const COUNTDOWN_TICK_MS = 1_000

/**
 * Re-read the wall clock every {@link COUNTDOWN_TICK_MS} while the row is shown.
 * The stored balance sample runs on its own slower cadence; the countdown
 * would otherwise hold still between samples.
 * @param active - whether a period row is on screen and worth ticking.
 * @returns the live epoch milliseconds.
 */
function useLiveClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => { setNow(Date.now()) }, COUNTDOWN_TICK_MS)
    return () => { window.clearInterval(timer) }
  }, [active])
  return now
}

/**
 * Format time left in the current pricing window.
 * @param ms - remaining milliseconds; clamped at zero across a boundary.
 * @returns `HH:MM:SS`, with hours allowed past two digits for long holidays.
 */
function remainingTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000))
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(Math.floor(seconds / 3_600))}:${pad(Math.floor((seconds % 3_600) / 60))}:${pad(seconds % 60)}`
}

function amount(value: string, currency: BalanceWallet['currency']): string { return formatBalance(value, currency === 'CNY' ? '¥' : '$') }
function total(wallet: BalanceWallet): Big { return new Big(wallet.toppedUp).plus(wallet.granted) }

function BalanceDetails({ data, refreshing = false, t }: { data: BalanceSnapshot | undefined; refreshing?: boolean; t: SharedProps['t'] }) {
  const [selected, select] = useState<BalanceWallet['currency']>('CNY')
  const latest = data?.samples.at(-1)
  const currency = latest?.wallets.some(wallet => wallet.currency === selected) ? selected : latest?.wallets[0]?.currency ?? 'CNY'
  const wallet = latest?.wallets.find(entry => entry.currency === currency)
  if (data?.status === 'signed-out') return <p className={css.hint}>{t('balance.credentials')}</p>
  if (data === undefined || wallet === undefined || latest === undefined) {
    return <p className={css.hint}>{t(data?.status === 'disabled' ? 'balance.disabled' : 'balance.empty')}</p>
  }
  const samples = data.samples.flatMap((sample) => {
    const entry = sample.wallets.find(value => value.currency === currency)
    return entry === undefined ? [] : [{ time: sample.time, value: total(entry).toNumber(), exactValue: total(entry).toString() }]
  })
  const first = data.samples.find(sample => sample.wallets.some(entry => entry.currency === currency))
    ?.wallets.find(entry => entry.currency === currency)
  return <div className={css.details}>
    {latest.wallets.length > 1 && <div className={css.currencies}>{latest.wallets.map(entry => <Button key={entry.currency} size="sm" aria-pressed={entry.currency === currency} onClick={() => { select(entry.currency) }}>{entry.currency}</Button>)}</div>}
    <div className={css.total}>
      <span>{t('balance.total')}</span>
      <strong><RollingAmount text={amount(total(wallet).toString(), currency)} /></strong>
      <span className={css.refreshState} role="status" aria-label={refreshing ? t('balance.refreshing') : undefined}>
        {refreshing && <IconRefreshOutlineRegular className={css.refreshIcon} />}
      </span>
    </div>
    {new Big(wallet.granted).gt(0) && <div className={css.breakdown}>
      <span>{t('bonusBalance')} <b>{amount(wallet.granted, currency)}</b></span>
      <span>{t('balance')} <b>{amount(wallet.toppedUp, currency)}</b></span>
    </div>}
    <BalanceHistory samples={samples} symbol={currency === 'CNY' ? '¥' : '$'} label={t('balance.curve')}
      help={t('balance.historyHelp')} dashHint={t('balance.dashHint')} stepIncreases />
    {samples.length === 1 && <p className={css.hint}>{t('balance.single')}</p>}
    <dl className={css.stats}>
      <div><dt>{t('balance.change')}</dt><dd>{formatBalanceDetail(total(wallet).minus(first === undefined ? total(wallet) : total(first)).toString(), currency === 'CNY' ? '¥' : '$')}</dd></div>
      <div><dt>{t('balance.samples')}</dt><dd>{data.sampleCount}</dd></div>
      <div><dt>{t('balance.updated')}</dt><dd>{new Date(latest.time).toLocaleString()}</dd></div>
    </dl>
    <p className={css.hint}>{t('balance.changeHint')}</p>
  </div>
}

/** Cleanup modes offered for stored samples. */
type CleanupMode = BalanceCleanupRequest['mode']

/** Toast copy per controller outcome. */
const TOAST_KEYS = {
  saved: 'balance.saved',
  saveFailed: 'balance.saveFailed',
  cleared: 'balance.cleared',
  clearFailed: 'balance.clearFailed',
} as const

/** @param props - Shared balance state and live preferences. @returns The built-in settings section. */
export function BalanceSettings({ useBalance, useBalancePreferences, refresh, save, clear, t }: BalanceSettingsProps) {
  const state = useBalance(value => value)
  const form = useBalancePreferences(value => value)
  const preferences = form.value
  const [draft, setDraft] = useState<string | null>(null)
  const [retainDraft, setRetainDraft] = useState<string | null>(null)
  const [cleanupMode, setCleanupMode] = useState<CleanupMode>('age')
  const [cleanupDraft, setCleanupDraft] = useState('30')
  const [armed, setArmed] = useState(false)
  const id = useId()
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => { setArmed(false) }, 5_000)
    return () => { window.clearTimeout(timer) }
  }, [armed])
  if (preferences === undefined) return null
  const interval = draft ?? String(preferences.refreshSeconds)
  const invalid = draft !== null && (!Number.isInteger(Number(draft)) || Number(draft) < 3 || Number(draft) > 3600)
  const retainField = preferences.autoCleanup === 'count' ? 'retainCount' : 'retainDays'
  const retainLimit = preferences.autoCleanup === 'count' ? 40320 : 3650
  const retainValue = retainDraft ?? String(preferences[retainField])
  const retainInvalid = retainDraft !== null && (!Number.isInteger(Number(retainDraft))
    || Number(retainDraft) < (preferences.autoCleanup === 'count' ? 2 : 1) || Number(retainDraft) > retainLimit)
  const cleanupValue = Number(cleanupDraft)
  const cleanupInvalid = cleanupMode !== 'all'
    && (!Number.isInteger(cleanupValue) || cleanupValue < 1 || cleanupValue > (cleanupMode === 'count' ? 40320 : 3650))
  const request: BalanceCleanupRequest = cleanupMode === 'all' ? { mode: 'all' }
    : cleanupMode === 'count' ? { mode: 'count', keep: cleanupValue } : { mode: 'age', days: cleanupValue }
  const busy = state.saving || state.clearing
  return <section className={css.settings}>
    <header className={css.sectionHead}><h3>{t('balance.title')}</h3><Switch label={t('balance.enabled')} checked={preferences.enabled} busy={state.saving} disabled={!form.writable} onChange={(value) => { void save('enabled', value) }} /></header>
    <div className={css.observation}>
      <div className={css.row}>
        <Select label={t('balance.source')} value={preferences.source} disabled={state.saving || !form.writable}
          options={[{ value: 'local', label: t('balance.local') }, { value: 'api', label: t('balance.api') }]}
          onChange={(value) => { void save('source', value) }} />
        <Button variant="ghost" size="sm" disabled={state.loading || !preferences.enabled} onClick={refresh}><IconRefreshOutlineRegular />{t('balance.refresh')}</Button>
      </div>
      {preferences.enabled && state.failed && <p role="alert" className={css.error}>{t('balance.failed')}</p>}
      {preferences.enabled ? <BalanceDetails data={state.data} refreshing={state.loading && state.data !== undefined} t={t} />
        : <p className={css.hint}>{t('balance.disabled')}</p>}
    </div>
    <details className={css.preferences}><summary>{t('balance.sampling')}</summary>
      <PreferenceControlRow title={t('balance.interval')}>
        <div className={css.interval}><Input id={`${id}-interval`} aria-label={t('balance.interval')} type="number" min={3} max={3600} step={1} value={interval} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} disabled={state.saving || !form.writable}
          onChange={(event) => { setDraft(event.target.value) }} onBlur={() => { if (!invalid && draft !== null) void save('refreshSeconds', Number(draft)).then((ok) => { if (ok) setDraft(null) }) }} /></div>
      </PreferenceControlRow>
      {invalid && <p id={`${id}-error`} role="alert" className={css.error}>{t('balance.intervalError')}</p>}
      <PreferenceControlRow title={t('balance.cleanup')}>
        <div className={css.cleanup}>
          <Select label={t('balance.cleanup')} value={cleanupMode} disabled={busy || !preferences.enabled}
            options={[{ value: 'age', label: t('balance.cleanupByAge') }, { value: 'count', label: t('balance.cleanupByCount') }, { value: 'all', label: t('balance.cleanupAll') }]}
            onChange={(value) => { setCleanupMode(value); setArmed(false) }} />
          {cleanupMode !== 'all' && <div className={css.interval}><Input id={`${id}-cleanup`} aria-label={t(cleanupMode === 'count' ? 'balance.keepCount' : 'balance.keepDays')} type="number" min={1} max={cleanupMode === 'count' ? 40320 : 3650} step={1}
            value={cleanupDraft} aria-invalid={cleanupInvalid} aria-describedby={cleanupInvalid ? `${id}-cleanup-error` : undefined} disabled={busy || !preferences.enabled}
            onChange={(event) => { setCleanupDraft(event.target.value); setArmed(false) }} /></div>}
          <Button size="sm" variant={armed ? 'primary' : 'outline'} disabled={cleanupInvalid || busy || !preferences.enabled}
            onClick={() => {
              if (cleanupMode === 'all' && !armed) { setArmed(true); return }
              setArmed(false)
              void clear(request)
            }}>{armed ? t('balance.cleanupConfirm') : t('balance.cleanupNow')}</Button>
        </div>
      </PreferenceControlRow>
      {cleanupInvalid && <p id={`${id}-cleanup-error`} role="alert" className={css.error}>{t(cleanupMode === 'count' ? 'balance.keepCountError' : 'balance.keepDaysError')}</p>}
      <p className={css.hint}>{t('balance.cleanupHint')}</p>
      <PreferenceControlRow title={t('balance.autoCleanup')}>
        <div className={css.cleanup}>
          <Select label={t('balance.autoCleanup')} value={preferences.autoCleanup} disabled={state.saving || !form.writable}
            options={[{ value: 'off', label: t('balance.autoOff') }, { value: 'count', label: t('balance.cleanupByCount') }, { value: 'age', label: t('balance.cleanupByAge') }]}
            onChange={(value) => { setRetainDraft(null); void save('autoCleanup', value) }} />
          {preferences.autoCleanup !== 'off' && <div className={css.interval}><Input id={`${id}-retain`} aria-label={t(preferences.autoCleanup === 'count' ? 'balance.keepCount' : 'balance.keepDays')} type="number" min={preferences.autoCleanup === 'count' ? 2 : 1} max={retainLimit} step={1}
            value={retainValue} aria-invalid={retainInvalid} aria-describedby={retainInvalid ? `${id}-retain-error` : undefined} disabled={state.saving || !form.writable}
            onChange={(event) => { setRetainDraft(event.target.value) }}
            onBlur={() => {
              if (retainInvalid || retainDraft === null) return
              void save(retainField, Number(retainDraft)).then((ok) => { if (ok) setRetainDraft(null) })
            }} /></div>}
        </div>
      </PreferenceControlRow>
      {retainInvalid && <p id={`${id}-retain-error`} role="alert" className={css.error}>{t(preferences.autoCleanup === 'count' ? 'balance.keepCountError' : 'balance.keepDaysError')}</p>}
      <p className={css.hint}>{t('balance.autoCleanupHint')}</p>
      <p className={css.hint}>{t(preferences.source === 'api' ? 'balance.apiHint' : 'balance.localHint')}</p>
      <a href="https://api-docs.deepseek.com/quick_start/pricing/" target="_blank" rel="noreferrer">{t('balance.pricing')}</a>
    </details>
  </section>
}

/** @param props - Sidebar geometry and shared balance observations. @returns Parallel balances and a keyboard-accessible hover card. */
export function BalanceSidebar({ wide, useBalance, useBalancePreferences, refresh, dismissToast, t }: BalanceSidebarProps) {
  const state = useBalance(value => value)
  const enabled = useBalancePreferences(value => value.value?.enabled === true)
  const wallet = state.data?.samples.at(-1)?.wallets[0]
  // The row's period and its countdown follow the wall clock, not the slower
  // balance sampling cadence, so crossing a boundary or a tick is immediate.
  const now = useLiveClock(enabled && wallet !== undefined)
  const period = balancePeriod(now)
  const periodLabel = t(period === 'peak' ? 'balance.peak' : period === 'valley' ? 'balance.valley' : 'balance.unknownPeriod')
  const endsAt = balancePeriodEnd(now)
  const left = endsAt === undefined ? undefined : remainingTime(endsAt - now)
  return <>
    {state.toast !== null && <Toast key={state.toastId} text={t(TOAST_KEYS[state.toast])} onDone={() => { dismissToast(state.toastId) }} />}
    {enabled && wallet !== undefined && <div className={css.sidebar}>
      <HoverCard inline anchor={<button type="button" onClick={refresh} className={css.summary} data-period={period} data-wide={wide} data-failed={state.failed}
        aria-label={t('balance.title')} aria-busy={state.loading}>
        {wide ? <><span className={css.period}>
          <span className={css.periodLabel}><i className={css.periodDot} />{periodLabel}</span>
          {left !== undefined && <span className={css.remaining} aria-label={t('balance.periodLeftLabel', { period: periodLabel, time: left })}><IconClockOutlineRegular size={12} />{left}</span>}
        </span>
        <div className={css.wallets}>{new Big(wallet.granted).gt(0) && <div><span>{t('bonusBalance')}</span><strong><RollingAmount text={amount(wallet.granted, wallet.currency)} /></strong></div>}<div><span>{t('balance')}</span><strong><RollingAmount text={amount(wallet.toppedUp, wallet.currency)} /></strong></div></div>
        </>
          : <strong>{wallet.currency === 'CNY' ? '¥' : '$'}</strong>}
      </button>} content={<div className={css.hover}><h3>{t('balance.title')}</h3>{state.failed && <p role="alert" className={css.error}>{t('balance.failed')}</p>}<BalanceDetails data={state.data} refreshing={state.loading} t={t} /></div>} />
    </div>}
  </>
}
