/** Original two-bubble glyph for the native side-question tab and launcher. */
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** @param props - Shared icon sizing and theme class. @returns Decorative scalable side-question artwork. */
export function AsideIcon({ size = 16, className }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M14 14.5H8l-4 3v-3.3A4 4 0 0 1 2 10.7V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3.5a4 4 0 0 1-4 4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M9 17.5a3.5 3.5 0 0 0 3.5 3H17l3.5 2v-3A3.5 3.5 0 0 0 22 16.5V13a3.5 3.5 0 0 0-2-3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 7.4c.25-1.8 3.6-2 3.9-.1.2 1.2-1.9 1.35-1.9 2.55" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="9" cy="11.6" r=".8" fill="currentColor" />
  </svg>
}
