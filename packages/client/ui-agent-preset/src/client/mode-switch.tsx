/** Existing-conversation mode controls and their root-owned asynchronous feedback. */
import { useEffect, useState } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { IconChevronDownOutlineRegular, Menu, Switch, Toast, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { AgentPresetLabel, type AgentPresetLabelProps } from './AgentPresetLabel.tsx'
import { PresetIcon } from './PresetIcon.tsx'
import { presetDisplayText } from './locales.ts'
import css from './ModeSwitch.module.css'

/** Preference consumed by both the settings row and existing-session selector. */
export interface ModeSwitchPolicy { allowExistingSessionSwitch: boolean }

interface SwitchState {
  readonly busy: ReadonlySet<SessionId>
  readonly saving: boolean
  readonly toast: { readonly id: number; readonly text: string; readonly success: boolean } | null
}

/** Tracks accepted requests until completion and keeps their feedback alive across panel navigation. */
export class ModeSwitchController {
  readonly state = createSnapshotStore<SwitchState>({ busy: new Set(), saving: false, toast: null })
  private readonly pending = new Set<Promise<void>>()
  private readonly changes = new Map<SessionId, Promise<void>>()
  private saveTask: Promise<void> | undefined
  private sequence = 0
  private closed = false

  /** @param policy - Live Host setting. @param select - Host-enforced mode change. @param t - Mode dictionary. */
  constructor(readonly policy: ConfigForm<ModeSwitchPolicy>,
    private readonly select: (sessionId: SessionId, preset: string) => Promise<void>,
    private readonly t: TranslateNS<'settings.agentPreset'>) {}

  /** @param sessionId - Exact owning session. @param preset - Requested mode. @returns Confirmed completion or visible failure. */
  change(sessionId: SessionId, preset: string): Promise<void> {
    if (this.closed) return Promise.resolve()
    const pending = this.changes.get(sessionId)
    if (pending !== undefined) return pending
    this.state.set({ ...this.state.getSnapshot(), busy: new Set([...this.state.getSnapshot().busy, sessionId]) })
    const task = this.track(async () => {
      try { await this.select(sessionId, preset); this.notify(this.t('modeSwitch.done'), true) }
      catch (_failure) { this.notify(this.t('modeSwitch.failed'), false) }
      finally {
        if (!this.closed) {
          const busy = new Set(this.state.getSnapshot().busy)
          busy.delete(sessionId)
          this.state.set({ ...this.state.getSnapshot(), busy })
        }
      }
    })
    this.changes.set(sessionId, task)
    const finish = (): void => { this.changes.delete(sessionId) }
    void task.then(finish, finish)
    return task
  }

  /** @param value - Permission to switch idle established conversations. @returns Persistence completion. */
  save(value: boolean): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (this.saveTask !== undefined) return this.saveTask
    this.state.set({ ...this.state.getSnapshot(), saving: true })
    const task = this.track(async () => {
      try {
        const saved = await this.policy.set('allowExistingSessionSwitch', value)
        this.notify(this.t(saved ? 'modeSwitch.saved' : 'modeSwitch.saveFailed'), saved)
      } catch (_failure) { this.notify(this.t('modeSwitch.saveFailed'), false) }
    })
    this.saveTask = task
    const finish = (): void => {
      if (this.saveTask === task) this.saveTask = undefined
      if (!this.closed) this.state.set({ ...this.state.getSnapshot(), saving: false })
    }
    void task.then(finish, finish)
    return task
  }

  private track(work: () => Promise<void>): Promise<void> {
    const task = work().finally(() => { this.pending.delete(task) })
    this.pending.add(task)
    return task
  }

  private notify(text: string, success: boolean): void {
    if (!this.closed) this.state.set({ ...this.state.getSnapshot(), toast: { id: ++this.sequence, text, success } })
  }

  /** @param id - Dismiss only the currently displayed notification. */
  dismiss(id: number): void {
    if (this.state.getSnapshot().toast?.id === id) this.state.set({ ...this.state.getSnapshot(), toast: null })
  }

  /** Drain admitted writes before dependencies can be released. @returns Quiescent completion. */
  async dispose(): Promise<void> { this.closed = true; await Promise.allSettled([...this.pending]) }
}

/** Shared setting and operation sources supplied by the mode UI owner. */
export interface ModeSwitchInjected {
  hooks: { modePolicy: ConfigForm<ModeSwitchPolicy>; modeSwitchState: ModeSwitchController['state'] }
  savePolicy(value: boolean): Promise<void>
  dismissModeToast(id: number): void
}

type Common = InjectFace<ModeSwitchInjected> & PropsLocale<'settings.agentPreset'>

/** Existing conversations expose a selector only when the user enabled it in Settings. */
export function SessionModeControl(props: AgentPresetLabelProps & Common & { selectPreset(id: string): Promise<void> }) {
  const { sessionId, useSessions, useSession, useAgentPresets, useModePolicy, useModeSwitchState, t, load } = props
  const [open, setOpen] = useState(false)
  const allowed = useModePolicy(state => state.value?.allowExistingSessionSwitch === true)
  const busy = useModeSwitchState(state => state.busy.has(sessionId))
  const running = useSession(state => state.running)
  const mode = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
  const options = useAgentPresets(state => state.options)
  useEffect(() => { void load() }, [load])
  if (!allowed) return <AgentPresetLabel {...props} />
  const option = options.find(item => item.id === mode)
  const label = option === undefined ? mode ?? t('noDescription') : presetDisplayText(option, t).name
  return <Menu open={open && !running && !busy} onClose={() => { setOpen(false) }} selectedId={mode ?? undefined}
    items={options.map(item => ({ id: item.id, label: presetDisplayText(item, t).name, icon: <PresetIcon id={item.id} /> }))}
    onSelect={(id) => { setOpen(false); void props.selectPreset(id) }} align="start" portal
    anchor={<Tooltip label={running ? t('modeSwitch.running') : t('modeSwitch.choose')} side="bottom" portal>
      <button type="button" className={css.trigger} disabled={running || busy} aria-haspopup="menu" aria-expanded={open}
        aria-label={t('modeSwitch.current', { mode: label })} onClick={() => { setOpen(value => !value) }}>
        <PresetIcon id={mode ?? ''} size={14} /><span className={css.name}>{label}</span><IconChevronDownOutlineRegular size={12} />
      </button>
    </Tooltip>} />
}

/** Explicit opt-in for changing established, idle conversations. */
export function ModeSwitchSetting({ useModePolicy, useModeSwitchState, savePolicy, t }: PropsRuntime<'settings.general.item'> & Common) {
  const policy = useModePolicy(value => value)
  const saving = useModeSwitchState(value => value.saving)
  return <div className={css.setting}>
    <div><div>{t('modeSwitch.allow')}</div><p>{t('modeSwitch.hint')}</p></div>
    <Switch label={t('modeSwitch.allow')} checked={policy.value?.allowExistingSessionSwitch === true}
      disabled={policy.status !== 'ready' || !policy.writable || saving} onChange={(value) => { void savePolicy(value) }} />
  </div>
}

/** Feedback survives closing Settings or navigating away from the changed conversation. */
export function ModeSwitchToast({ useModeSwitchState, dismissModeToast }: PropsRuntime<'shell.overlay'> & Common) {
  const toast = useModeSwitchState(value => value.toast)
  return toast === null ? null : <Toast key={toast.id} text={toast.text} {...toast.success ? { tone: 'success' as const } : {}}
    onDone={() => { dismissModeToast(toast.id) }} />
}
