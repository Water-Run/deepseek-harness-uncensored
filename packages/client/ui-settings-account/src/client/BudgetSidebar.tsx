/** One sidebar region for account balance and spending admission feedback. */
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './BudgetSidebar.module.css'

/**
 * Own the shared layout while each feature retains its remote operations.
 * @param props - Sidebar width and independently registered budget features.
 * @returns One aligned vertical region.
 */
export function BudgetSidebar({ wide, renderSlot }: PropsRuntime<'sidebar.footer.action'> & PropsRenderSlots<'sidebar.footer.budget'>) {
  return <div className={css.group} data-wide={wide}>{renderSlot('sidebar.footer.budget', { wide })}</div>
}
