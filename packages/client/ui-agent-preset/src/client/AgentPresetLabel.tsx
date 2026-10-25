/** Session-header mode card: a passive badge, or an inert card while mode switching is off. */

import { useEffect } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PresetIcon } from './PresetIcon.tsx'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { AgentPresetSettingsState } from './settings-store.ts'
import { presetDisplayText } from './locales.ts'
import { modeTone } from './mode-tone.ts'
import card from './ModeCard.module.css'
import css from './AgentPresetLabel.module.css'

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
 * @param props.locked - Render the mode-change affordance disabled: switching is off, so the card stays visible but inert.
 * @returns the mode card, or null when the session records no preset.
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

  if (preset === undefined) return null

  const option = options.find(entry => entry.id === preset)
  const text = option === undefined ? undefined : presetDisplayText(option, t)
  const name = text?.name ?? preset
  const tone = card[modeTone(preset)]
  if (locked) {
    return (
      <button type="button" className={`${card.card} ${tone} ${css.locked}`} disabled aria-disabled="true"
        aria-label={t('modeSwitch.current', { mode: name })} title={t('modeSwitch.disabled')}>
        <PresetIcon key={preset} id={preset} size={14} className={card.icon} />
        {name}
      </button>
    )
  }
  return (
    <span className={`${card.card} ${tone} ${css.passive}`} title={text?.description ?? t('headerHint')}>
      <PresetIcon key={preset} id={preset} size={14} className={card.icon} />
      {name}
    </span>
  )
}
