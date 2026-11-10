/** Versioned rule settings requests for the mode panel. @module */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TargetProtectionSettingsState, TargetProtectionSettingsUpdate } from '@deepseek-ai/dsh-target-protection/settings'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

/** Error and readiness states displayed beside the owner's unsaved edits. */
export type TargetSettingsFailure = 'notMounted' | 'denied' | 'conflict' | 'invalid' | 'unavailable' | 'countryUpdate' | 'failed'

/** The latest accepted state and the current Remote operation. */
export interface TargetSettingsView {
  value: TargetProtectionSettingsState | null
  loading: boolean
  saving: boolean
  failure: TargetSettingsFailure | null
  saved: boolean
  updatingCountry: boolean
  countryChecked: boolean
  generation: number
}

/** Typed methods supplied by the optional Host settings service. */
export interface TargetSettingsRemote {
  get(): Promise<RemoteResult<TargetProtectionSettingsState>>
  configure(update: TargetProtectionSettingsUpdate): Promise<RemoteResult<TargetProtectionSettingsState>>
  updateCountry(): Promise<RemoteResult<TargetProtectionSettingsState>>
}

const initial: TargetSettingsView = {
  value: null, loading: true, saving: false, failure: null, saved: false, generation: 0, updatingCountry: false, countryChecked: false,
}

function classify(code: string): TargetSettingsFailure {
  switch (code) {
    case 'gateway/definition-unavailable':
    case 'gateway/invocation-unavailable':
    case 'gateway/method-unavailable':
    case 'gateway/service-unavailable': return 'notMounted'
    case 'remote-access/denied':
    case 'target-protection/owner-required': return 'denied'
    case 'target-protection/conflict': return 'conflict'
    case 'target-protection/invalid': return 'invalid'
    case 'target-protection/unavailable': return 'unavailable'
    case 'target-protection/country-update-failed': return 'countryUpdate'
    default: return 'failed'
  }
}

/** Keep stale replies from replacing the current connection's settings. */
export class TargetSettingsController {
  /** Current settings response and connection-local operation status. */
  readonly state = createSnapshotStore<TargetSettingsView>(initial)
  private epoch = 0
  private disposed = false
  private requested = false
  private refreshPending = false

  /** @param remote - Narrow settings operations for this connection. */
  constructor(private readonly remote: TargetSettingsRemote) {}

  /** Refresh the authoritative revision without altering the editor's draft. */
  readonly load = (): void => {
    if (this.busy()) return
    this.requested = true
    this.patch({ loading: true, failure: null, saved: false, countryChecked: false })
    void this.run(() => this.remote.get(), 'read')
  }

  /** Refresh an opened settings snapshot after a Host notification, preserving feedback and drafts. */
  readonly refresh = (): void => {
    if (!this.requested || this.disposed) return
    if (this.busy() || this.state.getSnapshot().loading) { this.refreshPending = true; return }
    void this.run(() => this.remote.get(), 'refresh')
  }

  /**
   * Save the draft using the revision on which it was based.
   * @param update - Draft preferences and base revision.
   * @returns Whether the current connection accepted the change.
   */
  readonly save = (update: TargetProtectionSettingsUpdate): Promise<boolean> => {
    if (this.busy()) return Promise.resolve(false)
    this.patch({ loading: false, saving: true, failure: null, saved: false, countryChecked: false })
    return this.run(() => this.remote.configure(update), 'rules')
  }

  /** Check for a newer database independently of the local rule draft. */
  readonly updateCountry = (): void => {
    if (this.busy()) return
    this.patch({ loading: false, updatingCountry: true, failure: null, saved: false, countryChecked: false })
    void this.run(() => this.remote.updateCountry(), 'country')
  }

  /** Drop data from the departed connection and read the current Host. */
  reset(): void {
    if (this.disposed) return
    this.refreshPending = false
    this.state.set({ ...initial, generation: this.state.getSnapshot().generation + 1 })
    this.load()
  }

  /** Ignore all replies from operations belonging to this controller. */
  dispose(): void { this.disposed = true; this.epoch++ }

  private patch(value: Partial<TargetSettingsView>): void { this.state.set({ ...this.state.getSnapshot(), ...value }) }

  private busy(): boolean {
    const { saving, updatingCountry } = this.state.getSnapshot()
    return this.disposed || saving || updatingCountry
  }

  private async run(
    call: () => Promise<RemoteResult<TargetProtectionSettingsState>>, action: 'read' | 'rules' | 'country' | 'refresh',
  ): Promise<boolean> {
    const epoch = ++this.epoch
    try {
      const result = await call()
      if (epoch !== this.epoch) return false
      if (result.ok) {
        this.patch({ loading: false, saving: false, updatingCountry: false, failure: null, value: result.value,
          ...(action === 'refresh' ? {} : { saved: action === 'rules', countryChecked: action === 'country' }) })
        return true
      }
      const failure = classify(result.error.code)
      this.patch({ failure, loading: false, saving: false, updatingCountry: false,
        ...(failure === 'notMounted' || failure === 'denied' ? { value: null } : {}) })
    } catch (_error) {
      if (epoch === this.epoch) this.patch({ failure: 'failed', loading: false, saving: false, updatingCountry: false })
    } finally {
      if (epoch === this.epoch && this.refreshPending) {
        this.refreshPending = false
        this.refresh()
      }
    }
    return false
  }
}
