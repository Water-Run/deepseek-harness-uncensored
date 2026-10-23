/** Balance controls, observations and a shared sidebar hover card. */
import { useId, useState } from 'react'
import { Big } from 'big.js'
import { Button, HoverCard, Input, SegmentedTabs, Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { BalancePreferences, BalanceSnapshot, BalanceWallet } from '@deepseek-ai/dsh-balance/types'
import type { BalanceController, BalanceViewState } from './balance-controller.ts'
import { balancePeriod } from './balance-hours.ts'
import { formatBalance } from './formatBalance.ts'
import css from './BalanceView.module.css'

/** Shared data and callbacks supplied by the account plugin. */
export interface BalanceInjected {
  hooks: { balance: SnapshotStore<BalanceViewState>; balancePreferences: ConfigForm<BalancePreferences> }
  refresh: () => void
  save: BalanceController['save']
  dismissToast: (id: number) => void
}
type SharedProps = PropsLocale<'settings.account'> & InjectFace<BalanceInjected>
type BalanceSettingsProps = PropsRuntime<'settings.section'> & SharedProps
type BalanceSidebarProps = PropsRuntime<'sidebar.footer.action'> & SharedProps

function amount(value: string, currency: BalanceWallet['currency']): string { return formatBalance(value, currency === 'CNY' ? '¥' : '$') }
function total(wallet: BalanceWallet): Big { return new Big(wallet.toppedUp).plus(wallet.granted) }

function BalanceDetails({ data, t }: { data: BalanceSnapshot | undefined; t: SharedProps['t'] }) {
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
    return entry === undefined ? [] : [{ time: sample.time, value: total(entry).toNumber() }]
  })
  const values = samples.map(sample => sample.value)
  const low = Math.min(...values), high = Math.max(...values)
  const start = samples[0]?.time ?? latest.time
  const end = latest.time
  const points = samples.map((sample, index) => {
    const x = end === start ? 12 + index * 276 / Math.max(1, samples.length - 1) : 12 + (sample.time - start) * 276 / (end - start)
    const y = high === low ? 55 : 98 - (sample.value - low) * 86 / (high - low)
    return `${x},${y}`
  }).join(' ')
  const first = data.samples.find(sample => sample.wallets.some(entry => entry.currency === currency))
    ?.wallets.find(entry => entry.currency === currency)
  return <div className={css.details}>
    {latest.wallets.length > 1 && <div className={css.currencies}>{latest.wallets.map(entry => <Button key={entry.currency} size="sm" aria-pressed={entry.currency === currency} onClick={() => { select(entry.currency) }}>{entry.currency}</Button>)}</div>}
    <div className={css.wallets}>
      {new Big(wallet.granted).gt(0) && <div><span>{t('bonusBalance')}</span><strong>{amount(wallet.granted, currency)}</strong></div>}
      <div><span>{t('balance')}</span><strong>{amount(wallet.toppedUp, currency)}</strong></div>
    </div>
    {samples.length > 1 ? <svg className={css.chart} viewBox="0 0 300 110" role="img" aria-label={t('balance.curve')}>
      <path d="M12 98H288" className={css.axis} />
      <polyline points={points} className={css.line} />
    </svg> : <p className={css.hint}>{t('balance.collecting')}</p>}
    <dl className={css.stats}>
      <dt>{t('balance.total')}</dt><dd>{amount(total(wallet).toString(), currency)}</dd>
      <dt>{t('balance.change')}</dt><dd>{amount(total(wallet).minus(first === undefined ? total(wallet) : total(first)).toString(), currency)}</dd>
      <dt>{t('balance.samples')}</dt><dd>{data.sampleCount}</dd>
      <dt>{t('balance.updated')}</dt><dd>{new Date(latest.time).toLocaleString()}</dd>
    </dl>
    <p className={css.hint}>{t('balance.changeHint')}</p>
  </div>
}

/** @param props - Shared balance state and live preferences. @returns The built-in settings section. */
export function BalanceSettings({ useBalance, useBalancePreferences, refresh, save, t }: BalanceSettingsProps) {
  const state = useBalance(value => value)
  const form = useBalancePreferences(value => value)
  const preferences = form.value
  const [draft, setDraft] = useState<string | null>(null)
  const id = useId()
  if (preferences === undefined) return null
  const interval = draft ?? String(preferences.refreshSeconds)
  const invalid = draft !== null && (!Number.isInteger(Number(draft)) || Number(draft) < 15 || Number(draft) > 3600)
  return <section className={css.settings}>
    <h2>{t('balance.title')}</h2>
    <div className={css.row}><span>{t('balance.enabled')}</span><Switch label={t('balance.enabled')} checked={preferences.enabled} disabled={state.saving || !form.writable} onChange={(value) => { void save('enabled', value) }} /></div>
    <div className={css.row}><label htmlFor={`${id}-interval`}>{t('balance.interval')}</label><Input id={`${id}-interval`} type="number" min={15} max={3600} step={1} value={interval} aria-invalid={invalid} disabled={state.saving || !form.writable}
      onChange={(event) => { setDraft(event.target.value) }} onBlur={() => { if (!invalid && draft !== null) void save('refreshSeconds', Number(draft)).then((ok) => { if (ok) setDraft(null) }) }} /></div>
    {invalid && <p role="alert" className={css.hint}>{t('balance.intervalError')}</p>}
    <SegmentedTabs label={t('balance.source')} value={preferences.source} onChange={(value) => { if (!state.saving && form.writable) void save('source', value) }} items={[
      { value: 'local', label: t('balance.local'), id: `${id}-local-tab`, panelId: `${id}-local-panel` },
      { value: 'api', label: t('balance.api'), id: `${id}-api-tab`, panelId: `${id}-api-panel` },
    ]} />
    <div role="tabpanel" id={`${id}-${preferences.source}-panel`} aria-labelledby={`${id}-${preferences.source}-tab`}>
      <p className={css.hint}>{t(preferences.source === 'api' ? 'balance.apiHint' : 'balance.localHint')}</p>
      <div className={css.row}><span>{t('balance.current')}</span><Button variant="outline" size="sm" disabled={state.loading || !preferences.enabled} onClick={refresh}>{t('balance.refresh')}</Button></div>
      {state.failed && <p role="alert" className={css.hint}>{t('balance.failed')}</p>}
      <BalanceDetails data={state.data} t={t} />
    </div>
    <a href="https://api-docs.deepseek.com/quick_start/pricing/" target="_blank" rel="noreferrer">{t('balance.pricing')}</a>
  </section>
}

/** @param props - Sidebar geometry and shared balance observations. @returns Parallel balances and a keyboard-accessible hover card. */
export function BalanceSidebar({ wide, useBalance, useBalancePreferences, dismissToast, t }: BalanceSidebarProps) {
  const state = useBalance(value => value)
  const enabled = useBalancePreferences(value => value.value?.enabled === true)
  const wallet = state.data?.samples.at(-1)?.wallets[0]
  const period = balancePeriod(state.now)
  return <>
    {state.toast !== null && <Toast key={state.toastId} text={t(state.toast === 'saved' ? 'balance.saved' : 'balance.saveFailed')} onDone={() => { dismissToast(state.toastId) }} />}
    {enabled && wallet !== undefined && <div className={css.sidebar}>
      <HoverCard inline anchor={<div tabIndex={0} className={css.summary} data-period={period} aria-label={t('balance.title')}>
        {wide ? <><span className={css.period}>{t(period === 'peak' ? 'balance.peak' : period === 'valley' ? 'balance.valley' : 'balance.unknownPeriod')}</span>
          <div className={css.wallets}>{new Big(wallet.granted).gt(0) && <div><span>{t('bonusBalance')}</span><strong>{amount(wallet.granted, wallet.currency)}</strong></div>}<div><span>{t('balance')}</span><strong>{amount(wallet.toppedUp, wallet.currency)}</strong></div></div></>
          : <strong>{wallet.currency === 'CNY' ? '¥' : '$'}</strong>}
      </div>} content={<div className={css.hover}>{state.failed && <p role="status">{t('balance.failed')}</p>}<BalanceDetails data={state.data} t={t} /><p className={css.hint}>{t('balance.hours')}</p></div>} />
    </div>}
  </>
}
