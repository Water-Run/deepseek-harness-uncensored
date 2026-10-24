/** Client-side first-entry acknowledgement for new Security conversations. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SecurityEntryChallenge, SecurityEntryChallengeId, SecurityEntryLocale, SecurityEntryState,
  SecurityProtectionStatus,
} from '@deepseek-ai/dsh-agent-preset-registry/types'

/** Host operations the confirmation dialog needs; failures are thrown by the registration owner. */
export interface SecurityEntryRemote {
  read(): Promise<SecurityEntryState>
  begin(sessionId: SessionId, locale: SecurityEntryLocale): Promise<SecurityEntryChallenge>
  confirm(id: SecurityEntryChallengeId, sessionId: SessionId, declaration: string): Promise<SecurityEntryState>
  cancel(id: SecurityEntryChallengeId): Promise<SecurityEntryState>
}

/** Failure the dialog reports, after mapping a Host error or a lost connection. */
export type SecurityEntryFailure = 'changed' | 'declaration' | 'disconnected' | 'expired' | 'failed'

/** One open confirmation; a null challenge means the dialog is loading or retrying. */
export interface SecurityEntryDialogState {
  readonly sessionId: SessionId
  readonly challenge: SecurityEntryChallenge | null
  readonly remaining: number
  readonly busy: boolean
  readonly error: SecurityEntryFailure | null
}

/** Dialog, policy and protection state the overlay renders. */
export interface SecurityEntrySnapshot {
  readonly status: 'loading' | 'ready' | 'error'
  readonly required: boolean
  readonly preset: string | null
  readonly acknowledged: boolean
  readonly protection: SecurityProtectionStatus | null
  readonly dialog: SecurityEntryDialogState | null
}

/**
 * Gate the seat controller consults before staging a protected preset.
 * `request` resolves false when the person cancels or the client unloads.
 */
export interface SecurityEntryGate {
  /** @param preset - Preset id the person selected. @returns Whether this deployment protects it. */
  protects(preset: string): boolean
  /** @param preset - Preset id the person selected. @returns Whether a policy read is needed before deciding. */
  mayProtect(preset: string): boolean
  /** @returns Whether this Host lifetime already recorded the acknowledgement. */
  acknowledged(): boolean
  /** @returns Completion of the first policy read, successful or not. */
  ready(): Promise<void>
  /** @param sessionId - Blank conversation the choice will apply to. @returns true after the confirmation succeeds. */
  request(sessionId: SessionId): Promise<boolean>
}

const INITIAL: SecurityEntrySnapshot = {
  status: 'loading', required: false, preset: 'security', acknowledged: false, protection: null, dialog: null,
}

interface Pending {
  readonly sessionId: SessionId
  readonly promise: Promise<boolean>
  resolve(value: boolean): void
}

/** @param left - First protection snapshot. @param right - Second protection snapshot. @returns Whether state, revision, or capabilities differ. */
export function protectionDiffers(left: SecurityProtectionStatus, right: SecurityProtectionStatus): boolean {
  return left.state !== right.state || left.revision !== right.revision
    || left.capabilities.length !== right.capabilities.length
    || left.capabilities.some((capability, index) => capability !== right.capabilities[index])
}

/**
 * Owns the acknowledgement dialog and the gate promise the seat awaits.
 *
 * Every late response is fenced by a dialog generation, so a confirmation that
 * settles after cancellation, navigation, or a protection change cannot reopen
 * the dialog or resume a selection.
 */
export class SecurityEntryController implements SecurityEntryGate {
  /** Snapshot the overlay and the seat read. */
  readonly store: SnapshotStore<SecurityEntrySnapshot> = createSnapshotStore(INITIAL)
  private pending: Pending | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private deadline = 0
  private readGeneration = 0
  private dialogGeneration = 0
  private closed = false

  /**
   * @param remote - Host confirmation operations.
   * @param locale - Active UI language, used for the Host-issued declaration.
   * @param now - Monotonic clock for the countdown.
   */
  constructor(private readonly remote: SecurityEntryRemote,
    private readonly locale: () => SecurityEntryLocale,
    private readonly now: () => number = () => performance.now()) {}

  /** @param preset - Preset id the person selected. @returns Whether the Host requires confirmation for it. */
  protects(preset: string): boolean {
    const snapshot = this.store.getSnapshot()
    return snapshot.required && snapshot.preset === preset
  }

  /** @param preset - Preset id the person selected. @returns Whether a policy read is needed before deciding. */
  mayProtect(preset: string): boolean { return preset === this.store.getSnapshot().preset }

  /** @returns Whether this Host lifetime already recorded the acknowledgement. */
  acknowledged(): boolean { return this.store.getSnapshot().acknowledged }

  /** @returns Completion of the policy read, even when it failed. */
  async ready(): Promise<void> {
    if (this.store.getSnapshot().status === 'ready') return
    await this.load()
  }

  /**
   * Refresh the deployment policy and live protection state.
   * @returns Completion; a failed read leaves the last accepted policy visible.
   */
  async load(): Promise<void> {
    if (this.closed) return
    const generation = ++this.readGeneration
    if (this.store.getSnapshot().status !== 'ready') this.patch({ status: 'loading' })
    try {
      const state = await this.remote.read()
      if (this.closed || generation !== this.readGeneration) return
      this.accept(state)
    } catch (_failure) {
      if (!this.closed && generation === this.readGeneration) this.patch({ status: 'error' })
    }
  }

  /**
   * Accept a Host state read or pushed event.
   * @param state - Current deployment policy and protection state.
   */
  accept(state: SecurityEntryState): void {
    if (this.closed) return
    const dialog = this.store.getSnapshot().dialog
    const challenge = dialog?.challenge ?? null
    const protectionChanged = challenge !== null && protectionDiffers(challenge.protection, state.protection)
    this.patch({
      status: 'ready', required: state.required, preset: state.preset,
      acknowledged: state.acknowledged, protection: state.protection,
    })
    if (dialog === null) return
    if (!state.required) { this.finish(false); return }
    if (state.acknowledged) { this.finish(true); return }
    if (protectionChanged) this.restart(dialog.sessionId, 'changed')
  }

  /**
   * Ask for the first-entry acknowledgement before a preset is staged.
   * @param sessionId - Blank conversation that will receive the preset.
   * @returns true when the Host already acknowledged this launch or the person confirms.
   */
  async request(sessionId: SessionId): Promise<boolean> {
    if (this.closed) return false
    await this.ready()
    if (this.closed) return false
    const snapshot = this.store.getSnapshot()
    if (!snapshot.required || snapshot.acknowledged) return true
    if (this.pending?.sessionId === sessionId) return this.pending.promise
    if (this.pending !== undefined) this.finish(false)
    return this.begin(sessionId, null)
  }

  /**
   * Submit the typed declaration once the countdown finished.
   * @param declaration - Text the person typed; the Host validates the exact statement.
   * @returns Completion after acceptance, a retryable failure, or a refreshed challenge.
   */
  async confirm(declaration: string): Promise<void> {
    const dialog = this.store.getSnapshot().dialog
    if (this.closed || dialog === null || dialog.challenge === null || dialog.busy || dialog.remaining > 0) return
    const challenge = dialog.challenge
    const typed = declaration.trim()
    if (challenge.declaration !== '' && typed !== challenge.declaration) {
      this.patchDialog({ error: 'declaration' })
      return
    }
    const generation = this.dialogGeneration
    this.patchDialog({ busy: true, error: null })
    try {
      const state = await this.remote.confirm(challenge.id, dialog.sessionId, typed)
      if (this.closed || generation !== this.dialogGeneration) return
      this.accept(state)
    } catch (failure) {
      if (this.closed || generation !== this.dialogGeneration) return
      this.handleConfirmFailure(failure)
    } finally {
      if (!this.closed && generation === this.dialogGeneration) {
        const current = this.store.getSnapshot().dialog
        if (current !== null && current.busy) this.patchDialog({ busy: false })
      }
    }
  }

  /** Start a fresh reading interval for the same conversation after an expired or changed challenge. */
  retry(): void {
    const dialog = this.store.getSnapshot().dialog
    if (this.closed || dialog === null || dialog.busy) return
    void this.begin(dialog.sessionId, null)
  }

  /** Close the dialog without granting the acknowledgement. */
  cancel(): void {
    const dialog = this.store.getSnapshot().dialog
    if (this.closed || dialog === null || dialog.busy) return
    const challenge = dialog.challenge
    this.finish(false)
    if (challenge !== null) {
      void this.remote.cancel(challenge.id).catch((_failure: unknown) => {
        // The Host may have restarted; local cancellation already released the selection.
      })
    }
  }

  /** Keep the dialog retryable when the carrier is lost. */
  connectionLost(): void {
    const dialog = this.store.getSnapshot().dialog
    if (this.closed || dialog === null || dialog.busy) return
    this.stopTimer()
    this.patchDialog({ challenge: null, remaining: 0, error: 'disconnected' })
  }

  /**
   * Close a dialog whose conversation is no longer current.
   * @param sessionId - Conversation now shown, when one is.
   */
  sessionChanged(sessionId: SessionId | undefined): void {
    const dialog = this.store.getSnapshot().dialog
    if (dialog === null || dialog.sessionId === sessionId) return
    this.cancel()
  }

  /** Stop timers and release a waiting seat; a Host challenge left open expires on its own. */
  dispose(): void {
    if (this.closed) return
    this.closed = true
    this.stopTimer()
    const pending = this.pending
    this.pending = undefined
    if (this.store.getSnapshot().dialog !== null) this.patch({ dialog: null })
    pending?.resolve(false)
  }

  private ensurePending(sessionId: SessionId): Pending {
    if (this.pending?.sessionId === sessionId) return this.pending
    /* v8 ignore next -- request() finishes the previous session before begin(); a second begin for another session is not reachable from the UI. */
    if (this.pending !== undefined) this.finish(false)
    const deferred = Promise.withResolvers<boolean>()
    const pending: Pending = { sessionId, promise: deferred.promise, resolve: deferred.resolve }
    this.pending = pending
    return pending
  }

  private async begin(sessionId: SessionId, error: SecurityEntryFailure | null): Promise<boolean> {
    const pending = this.ensurePending(sessionId)
    const generation = ++this.dialogGeneration
    this.patch({ dialog: { sessionId, challenge: null, remaining: 0, busy: true, error } })
    try {
      const challenge = await this.remote.begin(sessionId, this.locale())
      if (this.closed || this.pending !== pending || generation !== this.dialogGeneration) return pending.promise
      this.patch({ dialog: { sessionId, challenge, remaining: Math.ceil(challenge.waitMs / 1000), busy: false, error } })
      this.startTimer(challenge.waitMs)
    } catch (failure) {
      /* v8 ignore next -- a begin superseded by a newer dialog generation returns before this branch in every UI path. */
      if (this.closed || this.pending !== pending || generation !== this.dialogGeneration) return pending.promise
      const remote = remoteErrorOf(failure)
      if (remote?.code === 'security-entry/consumed' && remote.details.acknowledged) {
        this.patch({ acknowledged: true })
        this.finish(true)
        return pending.promise
      }
      if (remote?.code === 'security-entry/disabled') {
        this.patch({ required: false })
        this.finish(true)
        return pending.promise
      }
      this.openError(sessionId, 'failed')
    }
    return pending.promise
  }

  private handleConfirmFailure(failure: unknown): void {
    const dialog = this.store.getSnapshot().dialog
    /* v8 ignore next -- confirm() returns while the dialog is closed, and a push that closes it also advances the generation first. */
    if (dialog === null) return
    const remote = remoteErrorOf(failure)
    if (remote === undefined) {
      this.patchDialog({ busy: false, error: 'failed' })
      return
    }
    switch (remote.code) {
      case 'security-entry/changed':
        this.patch({ protection: remote.details.protection })
        this.restart(dialog.sessionId, 'changed')
        return
      case 'security-entry/wait':
        this.patchDialog({ busy: false, error: null })
        this.startTimer(remote.details.remainingMs)
        return
      case 'security-entry/declaration':
        this.patchDialog({ busy: false, error: 'declaration' })
        return
      case 'security-entry/consumed':
        this.patchDialog({ busy: false })
        this.dialogGeneration++
        void this.reconcile()
        return
      case 'security-entry/confirmation':
        this.stopTimer()
        this.patchDialog({ challenge: null, remaining: 0, busy: false, error: 'expired' })
        return
      default:
        this.patchDialog({ busy: false, error: 'failed' })
    }
  }

  private async reconcile(): Promise<void> {
    const before = this.store.getSnapshot().dialog
    /* v8 ignore next -- reconcile() starts only from a submitted dialog, before any push can close it. */
    if (before === null) return
    const expected = before.challenge?.id
    await this.load()
    if (this.closed) return
    if (this.store.getSnapshot().acknowledged) { this.finish(true); return }
    const dialog = this.store.getSnapshot().dialog
    /* v8 ignore next -- a push that closes the dialog also advances the generation before reconcile resumes. */
    if (dialog === null) return
    if (dialog.busy) return
    // A protection change during the read already replaced the challenge;
    // keep that fresh confirmation instead of overwriting it as expired.
    if (dialog.challenge?.id !== expected) return
    this.stopTimer()
    this.patchDialog({ challenge: null, remaining: 0, error: 'expired' })
  }

  private restart(sessionId: SessionId, error: SecurityEntryFailure): void {
    void this.begin(sessionId, error)
  }

  private openError(sessionId: SessionId, error: SecurityEntryFailure): void {
    this.stopTimer()
    this.dialogGeneration++
    this.patch({ dialog: { sessionId, challenge: null, remaining: 0, busy: false, error } })
  }

  private finish(success: boolean): void {
    this.stopTimer()
    const pending = this.pending
    this.pending = undefined
    this.dialogGeneration++
    if (this.store.getSnapshot().dialog !== null) this.patch({ dialog: null })
    pending?.resolve(success)
  }

  private startTimer(waitMs: number): void {
    this.stopTimer()
    this.deadline = this.now() + waitMs
    this.tick()
    if (waitMs > 0) this.timer = setInterval(() => { this.tick() }, 100)
  }

  private tick(): void {
    const dialog = this.store.getSnapshot().dialog
    /* v8 ignore next -- every path that drops the challenge stops the timer first. */
    if (dialog === null || dialog.challenge === null) { this.stopTimer(); return }
    const remaining = Math.max(0, Math.ceil((this.deadline - this.now()) / 1000))
    if (remaining !== dialog.remaining) this.patchDialog({ remaining })
    if (remaining === 0) this.stopTimer()
  }

  private stopTimer(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  private patch(patch: Partial<SecurityEntrySnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private patchDialog(patch: Partial<SecurityEntryDialogState>): void {
    const dialog = this.store.getSnapshot().dialog
    /* v8 ignore next -- callers act only on a dialog they just read while it was open. */
    if (dialog === null) return
    this.patch({ dialog: { ...dialog, ...patch } })
  }
}
