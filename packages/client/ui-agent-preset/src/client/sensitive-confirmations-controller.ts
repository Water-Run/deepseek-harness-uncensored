/** Preference controller for the confirmation dialogs that guard sensitive actions. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SensitiveConfirmationChallenge, SensitiveConfirmationChallengeId, SensitiveConfirmationPolicy,
} from '@deepseek-ai/dsh-agent-preset-registry/types'

/** Authenticated Host operations; rejected responses are thrown by the registration owner. */
export interface SensitiveConfirmationsRemote {
  read(): Promise<SensitiveConfirmationPolicy>
  begin(confirmations: boolean): Promise<SensitiveConfirmationChallenge>
  confirm(id: SensitiveConfirmationChallengeId): Promise<SensitiveConfirmationPolicy>
}

/** Shared preference, countdown and feedback state. */
export interface SensitiveConfirmationsState {
  readonly status: 'loading' | 'ready' | 'error'
  readonly confirmations: boolean
  readonly writable: boolean
  readonly saving: boolean
  /** The open countdown; null while nothing is being confirmed. */
  readonly confirmation: { readonly remaining: number; readonly error: boolean } | null
  readonly toast: { readonly id: number; readonly text: string; readonly success: boolean } | null
}

const INITIAL: SensitiveConfirmationsState = {
  status: 'loading', confirmations: true, writable: false, saving: false, confirmation: null, toast: null,
}

/**
 * Owns the preference switch and the countdown its disabling needs.
 *
 * The Host decides the reading duration: enabling asks for none and commits at
 * once, disabling asks for one and only then opens the countdown. A preference
 * pushed from another window replaces this one, so a stale countdown cannot
 * commit over newer state.
 */
export class SensitiveConfirmationsController {
  /** Snapshot the settings row and the countdown overlay read. */
  readonly state = createSnapshotStore<SensitiveConfirmationsState>(INITIAL)
  private saveTask: Promise<void> | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private challenge: SensitiveConfirmationChallenge | undefined
  /** Value the open countdown would commit. */
  private pendingValue = true
  private deadline = 0
  private generation = 0
  private readGeneration = 0
  private sequence = 0
  private closed = false

  /**
   * @param remote - Host preference API.
   * @param t - Localized feedback.
   */
  constructor(private readonly remote: SensitiveConfirmationsRemote,
    private readonly t: TranslateNS<'settings.agentPreset'>) {}

  /**
   * Read the persisted preference.
   * @returns Completion with non-writable state on failure.
   */
  load(): Promise<void> {
    if (this.closed) return Promise.resolve()
    const generation = ++this.readGeneration
    this.patch({ status: 'loading', writable: false })
    return this.remote.read().then((policy) => {
      if (this.closed || generation !== this.readGeneration) return
      this.accept(policy)
    }, () => {
      if (!this.closed && generation === this.readGeneration) this.patch({ status: 'error', writable: false })
    })
  }

  /**
   * Accept the Host preference, abandoning a countdown it superseded.
   * @param policy - Current preference.
   */
  accept(policy: SensitiveConfirmationPolicy): void {
    this.readGeneration++
    this.patch({ status: 'ready', confirmations: policy.confirmations, writable: true })
    // Another window already reached this countdown's outcome; committing it
    // here would only repeat the answer the countdown was waiting for.
    if (this.state.getSnapshot().confirmation !== null && policy.confirmations === this.pendingValue) this.cancel()
  }

  /**
   * Request a preference change. Disabling opens the countdown; enabling commits at once.
   * @param confirmations - Requested preference.
   * @returns Completion once the request settles or the countdown opened.
   */
  save(confirmations: boolean): Promise<void> {
    if (this.closed) return Promise.resolve()
    if (this.saveTask !== undefined) return this.saveTask
    if (confirmations === this.state.getSnapshot().confirmations) return Promise.resolve()
    this.cancel()
    const generation = this.generation
    const task = this.beginSave(confirmations, generation)
    this.saveTask = task
    const finish = (): void => {
      // Saves are serialized, so the settled task is still the recorded one.
      this.saveTask = undefined
      if (!this.closed) this.patch({ saving: false })
    }
    void task.then(finish, finish)
    return task
  }

  /** Submit the open countdown once it finished. */
  confirm(): Promise<void> {
    const challenge = this.challenge
    const confirmation = this.state.getSnapshot().confirmation
    if (this.closed || challenge === undefined || confirmation === null || confirmation.remaining > 0) return Promise.resolve()
    return this.commit(challenge.id, this.pendingValue)
  }

  /** Abandon the open countdown without changing the preference. */
  cancel(): void {
    this.generation++
    this.stopTimer()
    this.challenge = undefined
    if (!this.closed) this.patch({ confirmation: null })
  }

  /**
   * Dismiss one notification.
   * @param id - Identity of the notification to acknowledge.
   */
  dismiss(id: number): void {
    if (this.state.getSnapshot().toast?.id === id) this.patch({ toast: null })
  }

  /** Stop timers and close the countdown without an answer. */
  dispose(): void {
    this.closed = true
    this.stopTimer()
    this.challenge = undefined
  }

  private async beginSave(confirmations: boolean, generation: number): Promise<void> {
    this.patch({ saving: true })
    let challenge: SensitiveConfirmationChallenge
    try {
      challenge = await this.remote.begin(confirmations)
    } catch (_failure) {
      if (!this.closed && generation === this.generation) this.notify(this.t('sensitive.saveFailed'), false)
      return
    }
    if (this.closed || generation !== this.generation) return
    this.challenge = challenge
    if (challenge.waitMs === 0) {
      await this.commit(challenge.id, confirmations)
      return
    }
    this.pendingValue = confirmations
    this.openCountdown(challenge.waitMs)
  }

  private async commit(id: SensitiveConfirmationChallengeId, confirmations: boolean): Promise<void> {
    this.patch({ saving: true })
    try {
      const policy = await this.remote.confirm(id)
      if (this.closed) return
      this.challenge = undefined
      this.accept(policy)
      this.cancel()
      this.notify(this.t(confirmations ? 'sensitive.saved' : 'sensitive.offSaved'), true)
    } catch (_failure) {
      if (this.closed) return
      if (this.state.getSnapshot().confirmation === null) {
        this.challenge = undefined
        this.cancel()
        this.notify(this.t('sensitive.saveFailed'), false)
      } else this.patch({ confirmation: { remaining: 0, error: true } })
    } finally {
      if (!this.closed) this.patch({ saving: false })
    }
  }

  private openCountdown(waitMs: number): void {
    this.deadline = performance.now() + waitMs
    const update = (): void => {
      const remaining = Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000))
      this.patch({ confirmation: { remaining, error: false } })
      if (remaining === 0) this.stopTimer()
    }
    update()
    this.timer = setInterval(update, 100)
  }

  private stopTimer(): void { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined }

  private notify(text: string, success: boolean): void {
    this.patch({ toast: { id: ++this.sequence, text, success } })
  }

  private patch(patch: Partial<SensitiveConfirmationsState>): void {
    this.state.set({ ...this.state.getSnapshot(), ...patch })
  }
}
