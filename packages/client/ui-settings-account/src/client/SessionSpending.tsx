/** Session cost and active-window readings in the conversation footer. */
import { useState } from 'react'
import { Button, StatPopover } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionSpendUsage, SpendWindow } from '@deepseek-ai/dsh-spend-limit/types'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type { SpendingInjected } from './SpendingView.tsx'
import { BalanceHistory } from './BalanceHistory.tsx'
import { ExpenseIcon, LimitIcon } from './BudgetIcons.tsx'
import css from './SessionSpending.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { 'session-cost': SessionSpendUsage }
}

const amount = (value: number): string => `￥${value.toFixed(value > 0 && value < 0.01 ? 6 : 2)}`
const occupancy = (window: SpendWindow): number => (window.spent + window.reserved) / window.limit * 100

/** @param props - Current Session, cost resource and global limit snapshot. @returns Two expandable footer readings. */
export function SessionSpending({ sessionId, useSession, useProjection, useResource, useSpending, t }:
PropsRuntime<'conversation.composer.dock'> & InjectFace<SpendingInjected> & PropsLocale<'settings.account'>) {
  const blank = useSession(value => value.blank)
  const running = useSession(value => value.running)
  const usage = useProjection('tokenUsage')
  const [revision, refresh] = useState(0)
  const meter = usage === undefined ? 'none' : [usage.uncachedInputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens].join('-')
  const result = useResource<'session-cost'>(blank ? '' : `dsh-resource://session-cost/${encodeURIComponent(sessionId)}?v=${meter}-${String(running)}-${revision}`)
  const limitState = useSpending(value => value)
  const limits = limitState.data
  if (blank) return null
  const cost = result.value
  const partial = cost !== undefined && cost.unpricedRequests > 0
  const label = cost === undefined ? '—' : amount(cost.total)
  const enabled = limits?.preferences.enabled === true
  const paused = limits?.paused === true || limits?.pausedSessions.some(value => value.state === 'blocked') === true
  const nearest = limits?.windows.reduce<SpendWindow | undefined>((best, window) =>
    best === undefined || occupancy(window) > occupancy(best) ? window : best, undefined)
  const percent = nearest === undefined ? 0 : occupancy(nearest)
  const shownPercent = percent < 100 ? Math.min(99, Math.round(percent)) : Math.round(percent)
  const nearestLabel = nearest === undefined ? '—' : `${nearest.period} ${shownPercent}%`
  return <div className={css.pills}>
    <StatPopover title={t('spending.sessionCost')} label={label} icon={<ExpenseIcon />}>
      {cost === undefined ? <p className={css.hint}>{t(result.status === 'failed' ? 'spending.sessionFailed' : 'spending.loading')}</p> : <>
        <div className={css.total}>{partial ? '≥ ' : ''}{amount(cost.total)}</div>
        <BalanceHistory samples={cost.points.map(point => ({ time: point.time, value: point.total }))} symbol="¥"
          label={t('spending.sessionCurve')} help={t('balance.historyHelp')} formatValue={amount} />
        <p className={css.hint}>{t('spending.sessionRequests', { count: cost.requests })}</p>
        {partial && <p className={css.hint}>{t('spending.sessionPartial', { count: cost.unpricedRequests })}</p>}
      </>}
      {result.status === 'failed' && <Button size="sm" onClick={() => { refresh(value => value + 1) }}>{t('spending.retry')}</Button>}
      <p className={css.hint}>{t('spending.sessionHint')}</p>
    </StatPopover>
    <StatPopover title={t('spending.title')} label={limitState.failed || limits === undefined ? '—'
      : enabled ? nearestLabel : t('spending.offShort')} icon={<LimitIcon className={paused ? css.paused : undefined} />}>
      <p className={css.hint}>{t(limitState.failed || limits === undefined ? 'spending.failed' : paused ? 'spending.paused' : enabled ? 'spending.active' : 'spending.off')}</p>
      {enabled && limits.windows.map((window) => {
        const percent = occupancy(window)
        return <div className={css.window} key={window.period}>
          <div className={css.row}><span>{t(`spending.${window.period}`)}</span><span>{percent.toFixed(1)}% · {amount(window.spent + window.reserved)} / {amount(window.limit)}</span></div>
          <div className={css.track} role="progressbar" aria-label={t(`spending.${window.period}`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)}>
            <span style={{ width: `${Math.min(100, percent)}%` }} data-full={percent >= 100} />
          </div>
        </div>
      })}
      <p className={css.hint}>{t('spending.footerHint')}</p>
    </StatPopover>
  </div>
}
