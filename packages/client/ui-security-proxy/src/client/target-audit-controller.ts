/** Connection-scoped reads of the owner's persisted protection audit. @module */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TargetAuditHistory } from '@deepseek-ai/dsh-target-protection/settings'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

/** Read status and the latest accepted audit page. */
export interface TargetAuditView {
  history: TargetAuditHistory | null
  loading: boolean
  failure: 'notMounted' | 'denied' | 'failed' | null
}

const initial: TargetAuditView = { history: null, loading: false, failure: null }

/** Ignore late replies after a refresh, reconnect or disposal. */
export class TargetAuditController {
  /** Latest accepted records and the current read state for the settings panel. */
  readonly state = createSnapshotStore<TargetAuditView>(initial)
  private epoch = 0
  private disposed = false
  private visible = false
  private refreshPending = false

  /** @param read - The authenticated owner's audit endpoint. */
  constructor(private readonly read: () => Promise<RemoteResult<TargetAuditHistory>>) {}

  /**
   * Track whether the Security audit records are visible.
   * @param visible Whether the audit panel is mounted and expanded.
   */
  readonly setVisible = (visible: boolean): void => {
    if (this.disposed || this.visible === visible) return
    this.visible = visible
    if (visible) this.load()
    else {
      this.epoch++
      this.refreshPending = false
      this.patch({ loading: false })
    }
  }

  /** Refresh an expanded audit after the Host invalidates its status. */
  readonly refresh = (): void => {
    if (this.disposed || !this.visible) return
    if (this.state.getSnapshot().loading) { this.refreshPending = true; return }
    this.load()
  }

  /** Read the latest visible page while preserving an accepted page during refresh. */
  readonly load = (): void => {
    if (this.disposed || !this.visible) return
    this.refreshPending = false
    const epoch = ++this.epoch
    this.patch({ loading: true, failure: null })
    void this.read().then((result) => {
      if (!this.canPublish(epoch)) return
      if (result.ok) { this.patch({ history: result.value, loading: false }); return }
      const code: string = result.error.code
      const unavailable = ['gateway/invocation-unavailable', 'gateway/method-unavailable', 'gateway/definition-unavailable',
        'gateway/service-unavailable'].includes(code)
      const denied = code === 'target-protection/owner-required' || code === 'remote-access/denied'
      const failure = unavailable ? 'notMounted' : denied ? 'denied' : 'failed'
      this.patch({ loading: false, failure, ...(failure === 'failed' ? {} : { history: null }) })
    }, (_error: unknown) => {
      if (this.canPublish(epoch)) this.patch({ loading: false, failure: 'failed' })
    })
  }

  /** Drop the departed Host's records and refresh only while the audit is visible. */
  reset(): void {
    if (this.disposed) return
    this.epoch++
    this.refreshPending = false
    this.state.set(initial)
    if (this.visible) this.load()
  }

  /** Reject publication from any outstanding read. */
  dispose(): void { this.disposed = true; this.epoch++ }

  private canPublish(epoch: number): boolean {
    if (epoch !== this.epoch) return false
    if (!this.refreshPending) return true
    this.load()
    return false
  }

  private patch(value: Partial<TargetAuditView>): void { this.state.set({ ...this.state.getSnapshot(), ...value }) }
}
