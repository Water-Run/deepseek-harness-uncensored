/** Balance and spending limits grouped under one settings navigation entry. */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './BudgetSection.module.css'

/**
 * Keep balance and rolling limits together, with independent local drafts.
 * @param props - Settings close action, feature slots and localized labels.
 * @returns One continuous budget page.
 */
export function BudgetSection({ close, renderSlot, t }: PropsRuntime<'settings.section'>
  & PropsRenderSlots<'settings.budget.item' | 'settings.budget.account'> & PropsLocale<'settings.account'>) {
  return <section className={css.section}>
    <header className={css.heading}><h2>{t('budget.title')}</h2>{renderSlot('settings.budget.account', {})}</header>
    <div className={css.panel}>{renderSlot('settings.budget.item', { close }, { only: 'balance' })}</div>
    <div className={css.panel}>{renderSlot('settings.budget.item', { close }, { only: 'spending' })}</div>
  </section>
}
