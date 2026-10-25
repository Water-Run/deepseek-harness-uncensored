/** Runtime permission, confirmation countdown and asynchronous feedback for mode changes. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModeSwitchChallenge, ModeSwitchChallengeId, ModeSwitchPolicy } from '@deepseek-ai/dsh-agent-preset-registry/types'

/** Authenticated Host operations; rejected responses are thrown by the registration owner. */
export interface ModePolicyRemote {
  read(): Promise<ModeSwitchPolicy>
  begin(): Promise<ModeSwitchChallenge>
  confirm(id: ModeSwitchChallengeId): Promise<ModeSwitchPolicy>
  disable(): Promise<ModeSwitchPolicy>
}

interface PolicyState { status: 'loading' | 'ready' | 'error'; value: ModeSwitchPolicy; writable: boolean }
interface SwitchState {
  readonly busy: ReadonlySet<SessionId>
  readonly saving: boolean
  readonly confirmation: { readonly remaining: number; readonly error: boolean } | null
  readonly toast: { readonly id: number; readonly text: string; readonly success: boolean } | null
  /** A refusal reported in place, beside the control that refused it. */
  readonly notice: { readonly id: number; readonly text: string } | null
}

/** Owns a runtime permission and drains writes before its Remote provider unloads. */
export class ModeSwitchController {
  /** Last accepted Host permission and the status of its read. */
  readonly policy = createSnapshotStore<PolicyState>({ status: 'loading', value: { allowExistingSessionSwitch: false }, writable: false })
  /** Pending changes, confirmation and feedback shared by Settings and the shell. */
  readonly state = createSnapshotStore<SwitchState>({ busy: new Set(), saving: false, confirmation: null, toast: null, notice: null })
  private readonly pending = new Set<Promise<void>>()
  private readonly changes = new Map<SessionId, Promise<void>>()
  private saveTask: Promise<void> | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private challenge: ModeSwitchChallenge | undefined
  private generation = 0
  private readGeneration = 0
  private sequence = 0
  private noticeSequence = 0
  private closed = false

  /**
 * @param remote - Runtime permission API.
 * @param select - Host mode selection.
 * @param t - Localized feedback.
 */
  constructor(private readonly remote: ModePolicyRemote,
    private readonly select: (sessionId: SessionId, preset: string) => Promise<void>,
    private readonly t: TranslateNS<'settings.agentPreset'>) {}

  /**
 * Refresh the Host permission.
 * @returns Completion with non-writable state on failure.
 */
  load(): Promise<void> {
    if (this.closed) return Promise.resolve()
    const generation = ++this.readGeneration
    this.policy.set({ ...this.policy.getSnapshot(), status: 'loading', writable: false })
    return this.track(async () => {
      try {
        const value = await this.remote.read()
        if (!this.closed && generation === this.readGeneration) this.policy.set({ status: 'ready', value, writable: true })
      } catch (_failure) {
        if (!this.closed && generation === this.readGeneration) this.policy.set({ ...this.policy.getSnapshot(), status: 'error', writable: false })
      }
    })
  }

  /**
 * Accept a Host update and invalidate older reads.
 * @param value - Current permission.
 */
  accept(value: ModeSwitchPolicy): void {
    this.readGeneration++
    if (!this.closed) this.policy.set({ status: 'ready', value, writable: true })
  }

  /**
   * Change a captured conversation and retain feedback through navigation.
   * @param sessionId - Captured conversation.
   * @param preset - Requested mode.
   * @returns Completion with visible feedback.
   */
  change(sessionId: SessionId, preset: string): Promise<void> {
    if (this.closed) return Promise.resolve()
    const existing = this.changes.get(sessionId)
    if (existing !== undefined) return existing
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

  /**
   * Announce a change that was not attempted, beside the control that refused
   * it. The Settings page shows this in place, so no banner covers the dialog.
   * @param reason - the running task, or the conversation locked to its mode.
   */
  refuse(reason: 'running' | 'locked'): void {
    if (this.closed) return
    const text = this.t(reason === 'running' ? 'modeSwitch.running' : 'modeSwitch.blocked')
    this.state.set({ ...this.state.getSnapshot(), toast: null, notice: { id: ++this.noticeSequence, text } })
  }

  /**
   * Request a temporary permission change.
   * @param value - True opens confirmation; false immediately revokes permission.
   * @returns Request completion.
   */
  save(value: boolean): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (this.saveTask !== undefined) return this.saveTask
    this.cancel()
    const generation = this.generation
    return this.saving(async () => {
      try {
        if (!value) {
          const revision = this.readGeneration
          const policy = await this.remote.disable()
          if (revision === this.readGeneration) this.accept(policy)
          this.notify(this.t('modeSwitch.saved'), true)
          return
        }
        const challenge = await this.remote.begin()
        if (this.closed || generation !== this.generation) return
        this.challenge = challenge
        const deadline = performance.now() + challenge.waitMs
        const update = (): void => {
          const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000))
          this.state.set({ ...this.state.getSnapshot(), confirmation: { remaining, error: false } })
          if (remaining === 0) this.stopTimer()
        }
        update()
        if (challenge.waitMs > 0) this.timer = setInterval(update, 100)
      } catch (_failure) { this.notify(this.t('modeSwitch.saveFailed'), false) }
    })
  }

  /** Close an idle acknowledgement without changing the Host permission. */
  cancel(): void {
    this.generation++
    this.stopTimer()
    this.challenge = undefined
    if (!this.closed) this.state.set({ ...this.state.getSnapshot(), confirmation: null })
  }

  /**
 * Submit an explicit acknowledgement.
 * @returns Completion with accepted permission or a visible retryable error.
 */
  confirm(): Promise<void> {
    if (this.closed || this.saveTask !== undefined) return this.saveTask ?? Promise.resolve()
    const challenge = this.challenge
    if (challenge === undefined || this.state.getSnapshot().confirmation?.remaining !== 0) return Promise.resolve()
    return this.saving(async () => {
      try {
        const revision = this.readGeneration
        const policy = await this.remote.confirm(challenge.id)
        if (revision === this.readGeneration) this.accept(policy)
        this.cancel()
        this.notify(this.t('modeSwitch.saved'), true)
      } catch (_failure) {
        if (!this.closed) this.state.set({ ...this.state.getSnapshot(), confirmation: { remaining: 0, error: true } })
      }
    })
  }

  private saving(work: () => Promise<void>): Promise<void> {
    this.state.set({ ...this.state.getSnapshot(), saving: true })
    const task = this.track(work)
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

  private stopTimer(): void { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined }
  private notify(text: string, success: boolean): void {
    if (!this.closed) this.state.set({ ...this.state.getSnapshot(), notice: null, toast: { id: ++this.sequence, text, success } })
  }

  /**
   * Dismiss one in-place refusal notice.
   * @param id - Identity of the notice to clear.
   */
  dismissNotice(id: number): void {
    if (this.state.getSnapshot().notice?.id === id) this.state.set({ ...this.state.getSnapshot(), notice: null })
  }

  /**
 * Dismiss one notification.
 * @param id - Identity of the notification to acknowledge.
 */
  dismiss(id: number): void {
    if (this.state.getSnapshot().toast?.id === id) this.state.set({ ...this.state.getSnapshot(), toast: null })
  }

  /**
 * Stop new work and cancel timers.
 * @returns Quiescence after draining admitted requests.
 */
  async dispose(): Promise<void> { this.closed = true; this.cancel(); await Promise.allSettled([...this.pending]) }
}
