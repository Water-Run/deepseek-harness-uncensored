import { BrandWordmark, FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official whale mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <FishLogo size={size} />
}

/**
 * Render the official name artwork without its independently slotted mark.
 * The release marker follows the main view's conversation mode, including a mode
 * picked for a new conversation, through the theme's mode accent.
 * @returns the name wordmark.
 */
export function OfficialBrandName() {
  return <BrandWordmark includeMark={false} tone="mode" layout="stacked" size={40} />
}
