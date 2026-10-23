import { BrandWordmark, FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'

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
 * @param props - Root-scoped session list, including the active main conversation.
 * @returns the name wordmark in the active conversation's mode color.
 */
export function OfficialBrandName({ useSessions }: Pick<PropsRuntime<'sidebar.brand.name'>, 'useSessions'>) {
  const mode = useSessions(state => Object.values(state.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.projectionValues?.agentPreset)
  const tone = mode === undefined || mode === 'standard' ? 'blue'
    : mode === 'security' ? 'red' : mode === 'writing' ? 'yellow' : 'green'
  return <BrandWordmark includeMark={false} tone={tone} layout="stacked" size={40} />
}
