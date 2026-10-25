/** Independent wallet and limit-dial artwork on the shared 16px control grid. */
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** @param props - Shared icon size and styling. @returns Decorative conversation-cost wallet. */
export function ExpenseIcon({ size = 16, className }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <path d="M12 4V2.5L3.5 4A1.8 1.8 0 0 0 2 5.8V12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 12V5.5A1.5 1.5 0 0 0 12.5 4H4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 7.5h-3a1.5 1.5 0 0 0 0 3h3" stroke="currentColor" strokeWidth="1.2" /><circle cx="11" cy="9" r=".6" fill="currentColor" />
  </svg>
}

/** @param props - Shared icon size and styling. @returns Three usage bars below a fixed limit. */
export function LimitIcon({ size = 16, className }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <path d="M2 3h12M2.5 13h11M4 10.5V8.5M8 10.5V6.5M12 10.5V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
}
