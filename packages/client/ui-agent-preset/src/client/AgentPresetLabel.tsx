/** Session-header mode label: passive while mode switching is allowed, a grayed and disabled control while it is off. */

import { useEffect } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { PresetIcon } from './PresetIcon.tsx'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { AgentPresetSettingsState } from './settings-store.ts'
import { presetDisplayText } from './locales.ts'
import css from './AgentPresetLabel.module.css'

const MODE_TONES: Readonly<Record<string, 'blue' | 'yellow' | 'red' | 'green'>> = { standard: 'blue', security: 'red', reverse: 'green', writing: 'yellow' }

/** Hidden legacy and custom presets have no mode color. */
const NEUTRAL_TONE = 'neutral'

/** Registration-side business face for the header label. */
export interface AgentPresetLabelInjected {
  hooks: {
    /** Roster snapshot bound by the renderer as useAgentPresets. */
    agentPresets: SnapshotStore<AgentPresetSettingsState>
  }
  /** Read the roster, so the label can show a name rather than an id. */
  load: () => Promise<void>
}

/** Full component props. */
export type AgentPresetLabelProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetLabelInjected>

/**
 * Render this session's agent-preset name beside its title.
 * @param props - composed slot props.
 * @param props.locked - Render the mode-change affordance disabled: switching is off, so the control stays visible but grayed.
 * @returns the label, or null when the session records no preset.
 */
export function AgentPresetLabel({
  sessionId, useSessions, useAgentPresets, load, t, locked = false,
}: AgentPresetLabelProps & { locked?: boolean }) {
  const preset = useSessions((state) => {
    const value = state.byId[sessionId]?.projectionValues?.agentPreset
    return typeof value === 'string' ? value : undefined
  })
  const options = useAgentPresets(state => state.options)

  useEffect(() => {
    // Deployments that compose no presets never label anything, so the roster
    // is only worth a request once a session reports one.
    if (preset !== undefined) void load()
  }, [preset, load])

  const tone = MODE_TONES[preset ?? ''] ?? NEUTRAL_TONE

  if (preset === undefined) return null

  const option = options.find(entry => entry.id === preset)
  const text = option === undefined ? undefined : presetDisplayText(option, t)
  const name = text?.name ?? preset
  if (locked) {
    return (
      <button type="button" className={`${css.label} ${css.locked}`} disabled aria-disabled="true"
        aria-haspopup="menu" aria-expanded={false} title={t('modeSwitch.disabled')}
        aria-label={t('modeSwitch.current', { mode: name })}>
        <PresetIcon key={preset} id={preset} size={14} className={css.icon} />
        {name}
        <IconChevronDownOutlineRegular size={12} className={css.lockChevron} />
      </button>
    )
  }
  return (
    <span className={`${css.label} ${css[tone]}`} title={text?.description ?? t('headerHint')}>
      <PresetIcon key={preset} id={preset} size={14} className={css.icon} />
      {name}
    </span>
  )
}
