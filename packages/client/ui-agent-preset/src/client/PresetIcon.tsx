/** Stable visual identities for the four shipped modes. */
import { IconAgentPresetOutlineRegular, IconCodeOutlineRegular, IconListPenOutlineRegular, IconShieldOutlineRegular, IconInspectOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

/** @param props - Preset identity and host-controlled icon sizing. @returns Its mode glyph, or the generic custom-preset glyph. */
export function PresetIcon({ id, size = 16, className }: { id: string; size?: number; className?: string | undefined }) {
  const Icon = id === 'standard' ? IconCodeOutlineRegular : id === 'security' ? IconShieldOutlineRegular
    : id === 'reverse' ? IconInspectOutlineRegular : id === 'writing' ? IconListPenOutlineRegular : IconAgentPresetOutlineRegular
  return <Icon size={size} className={className} />
}
