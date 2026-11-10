/** The existing overlay dispatches the latest Workspace notice to its keyed presentation. */
import type { KeyedRenderSlotArgs } from '@deepseek-ai/dsh-client-ui-slots'
import type { RowToastProps } from '../contract/slots.ts'
import type {} from '../contract/toast.ts'

/**
 * Dispatch the current notice without interpreting its business payload.
 * @param props - Current notice, dismissal, and the declared keyed renderer.
 * @returns The selected notice presentation, or nothing.
 */
export function RowActionToast({ useToast, dismissToast, renderSlot }: RowToastProps) {
  const notice = useToast(current => current)
  if (notice === null) return null
  // The selected key and its payload come from the same notice.
  const args = ['workspace.toast', { ...notice, dismissToast }, { entryKey: notice.kind }] as KeyedRenderSlotArgs<'workspace.toast'>
  return renderSlot(...args)
}
