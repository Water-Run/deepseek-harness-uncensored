/** Balance and spending limits grouped under one settings navigation entry. */
import { useId, useState } from 'react'
import { SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './BudgetSection.module.css'

/**
 * Render the selected budget view while preserving each view's local draft.
 * @param props - Settings close action, feature slots and localized labels.
 * @returns Balance and spending tabs.
 */
export function BudgetSection({ close, renderSlot, t }: PropsRuntime<'settings.section'>
  & PropsRenderSlots<'settings.budget.item' | 'settings.budget.account'> & PropsLocale<'settings.account'>) {
  const id = useId()
  const [active, setActive] = useState<'balance' | 'spending'>('balance')
  return <section className={css.section}>
    <h2>{t('budget.title')}</h2>
    <SegmentedTabs label={t('budget.title')} value={active} onChange={setActive} items={[
      { value: 'balance', label: t('balance.title'), id: `${id}-balance`, panelId: `${id}-balance-panel` },
      { value: 'spending', label: t('spending.title'), id: `${id}-spending`, panelId: `${id}-spending-panel` },
    ]} />
    {(['balance', 'spending'] as const).map(tab => <div key={tab} role="tabpanel" hidden={active !== tab}
      id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}`} className={css.panel}>
      {tab === 'balance' && renderSlot('settings.budget.account', {})}
      {renderSlot('settings.budget.item', { close }, { only: tab })}
    </div>)}
  </section>
}
