/** Existing-conversation mode controls, temporary permission and its root-owned confirmation. */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { Button, Menu, Modal, Switch, Toast, Tooltip, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { AgentPresetLabel, type AgentPresetLabelProps } from './AgentPresetLabel.tsx'
import { PresetIcon } from './PresetIcon.tsx'
import { presetDisplayText } from './locales.ts'
import { modeTone } from './mode-tone.ts'
import type { ModeSwitchController } from './mode-policy-controller.ts'
import card from './ModeCard.module.css'
import css from './ModeSwitch.module.css'

export { ModeSwitchController } from './mode-policy-controller.ts'
export type { ModeSwitchPolicy } from '@deepseek-ai/dsh-agent-preset-registry/types'

/** Hold for a failure message: it names what to check and needs reading time. */
const FAILURE_HOLD_MS = 6000

/** Shared setting and operation sources supplied by the mode UI owner. */
export interface ModeSwitchInjected {
  hooks: { modePolicy: ModeSwitchController['policy']; modeSwitchState: ModeSwitchController['state'] }
  savePolicy(value: boolean): Promise<void>
  confirmPolicy(): Promise<void>
  cancelPolicy(): void
  loadPolicy(): Promise<void>
  dismissModeToast(id: number): void
  dismissNotice(id: number): void
}

type Common = InjectFace<ModeSwitchInjected> & PropsLocale<'settings.agentPreset'>

/** Existing conversations expose a selector only when the user enabled it in Settings. */
export function SessionModeControl(props: AgentPresetLabelProps & Common & { selectPreset(id: string): Promise<void> }) {
  const { sessionId, useSessions, useSession, useAgentPresets, useModePolicy, useModeSwitchState, t, load } = props
  const [open, setOpen] = useState(false)
  const allowed = useModePolicy(state => state.status === 'ready' && state.value.allowExistingSessionSwitch)
  const busy = useModeSwitchState(state => state.busy.has(sessionId))
  const running = useSession(state => state.running)
  const mode = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
  const options = useAgentPresets(state => state.options)
  useEffect(() => { void load() }, [load])
  // The control stays on screen while switching is off, inert: hiding it left
  // no hint that existing conversations are locked or where to unlock them.
  if (!allowed) return <AgentPresetLabel {...props} locked />
  const option = options.find(item => item.id === mode)
  const label = option === undefined ? mode ?? t('noDescription') : presetDisplayText(option, t).name
  // The card itself is the control: no chevron, so it reads as this
  // conversation's mode rather than as a select box. Clicking still opens the
  // roster, which keeps in-place switching available where it is allowed.
  return <Menu open={open && !running && !busy} onClose={() => { setOpen(false) }} selectedId={mode ?? undefined}
    items={options.map(item => ({ id: item.id, label: presetDisplayText(item, t).name, icon: <PresetIcon id={item.id} /> }))}
    onSelect={(id) => { setOpen(false); void props.selectPreset(id) }} align="start" portal
    anchor={<Tooltip label={running ? t('modeSwitch.running') : t('modeSwitch.choose')} side="bottom" portal>
      <button type="button" className={`${card.card} ${card[modeTone(mode)]}`} disabled={running || busy}
        aria-haspopup="menu" aria-expanded={open}
        aria-label={t('modeSwitch.current', { mode: label })} onClick={() => { setOpen(value => !value) }}>
        <PresetIcon id={mode ?? ''} size={14} className={card.icon} /><span className={css.name}>{label}</span>
      </button>
    </Tooltip>} />
}

/** Explicit opt-in for changing established, idle conversations. */
export function ModeSwitchSetting({ useModePolicy, useModeSwitchState, savePolicy, loadPolicy, t }: Common) {
  useEffect(() => { void loadPolicy() }, [loadPolicy])
  const policy = useModePolicy(value => value)
  const saving = useModeSwitchState(value => value.saving)
  return <div className={css.setting}>
    <div><div>{t('modeSwitch.allow')}</div><p>{t('modeSwitch.hint')}</p></div>
    {policy.status === 'error' && <Button variant="ghost" onClick={() => { void loadPolicy() }}>{t('modeSwitch.reload')}</Button>}
    <Switch label={t('modeSwitch.allow')} checked={policy.value.allowExistingSessionSwitch}
      disabled={policy.status !== 'ready' || !policy.writable || saving} onChange={(value) => { void savePolicy(value) }} />
  </div>
}

/** Feedback survives closing Settings or navigating away from the changed conversation. */
export function ModeSwitchToast({ useModeSwitchState, dismissModeToast, confirmPolicy, cancelPolicy, savePolicy, t }: PropsRuntime<'shell.overlay'> & Common) {
  const state = useModeSwitchState(value => value)
  const toast = state.toast
  const confirmation = state.confirmation
  return <>
    {toast === null ? null : <Toast key={toast.id} text={toast.text}
      {...toast.success ? { tone: 'success' as const } : { icon: <IconWarningOutlineRegular />, holdMs: FAILURE_HOLD_MS }}
      onDone={() => { dismissModeToast(toast.id) }} />}
    <Modal open={confirmation !== null} onClose={() => { if (!state.saving) cancelPolicy() }}
      closeLabel={t('close')} title={t('modeSwitch.confirmTitle')}
      footer={<>
        <Button variant="outline" disabled={state.saving} onClick={cancelPolicy}>{t('modeSwitch.cancel')}</Button>
        <Button variant="primary" disabled={state.saving || (confirmation?.remaining ?? 1) > 0}
          onClick={() => { void (confirmation?.error ? savePolicy(true) : confirmPolicy()) }}>
          {confirmation?.error ? t('modeSwitch.retry') : confirmation?.remaining
            ? t('modeSwitch.countdown', { seconds: String(confirmation.remaining) }) : t('modeSwitch.confirm')}
        </Button>
      </>}>
      <p className={css.warning}>{t('modeSwitch.warning')}</p>
      <p className={css.note}>{t('modeSwitch.sessionOnly')}</p>
      {confirmation?.error && <p role="alert" className={css.error}>{t('modeSwitch.saveFailed')}</p>}
    </Modal>
  </>
}
