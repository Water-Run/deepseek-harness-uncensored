/** Original two-bubble glyph for the native side-question tab and launcher. */
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './AsidePanel.module.css'

/** @param props - Shared icon sizing and theme class. @returns Decorative scalable side-question artwork. */
export function AsideIcon({ size = 16, className }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M5 4.5h10a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8l-3.5 3v-3.1A2.5 2.5 0 0 1 2.5 12V7A2.5 2.5 0 0 1 5 4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M11 18h6l3.5 2.5V11a2.5 2.5 0 0 0-1-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.5 8h7M6.5 11h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
}

/** @param props - Guide icon dimensions. @returns Colored counterpart matching the other Start actions. */
export function AsideGuideIcon(props: IconProps) { return <span className={css.guideIcon}><AsideIcon {...props} /></span> }
