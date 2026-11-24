/** One polling lifetime shared by the balance settings page and sidebar. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { BalanceCleanupRequest, BalancePreferences, BalanceSnapshot } from '@deepseek-ai/dsh-balance/types'

/** Current query, clock, and settings-write feedback. */
export interface BalanceViewState {
  readonly data: BalanceSnapshot | undefined
  readonly loading: boolean
  readonly failed: boolean
  readonly now: number
  readonly saving: boolean
  readonly clearing: boolean
  readonly toast: 'saved' | 'saveFailed' | 'cleared' | 'clearFailed' | null
  readonly toastId: number
}

/** Coalesces refreshes and prevents late replies from repopulating a disposed or changed account view. */
export class BalanceController {
  /** Shared polling state and feedback for the sidebar and settings views. */
  readonly state = createSnapshotStore<BalanceViewState>({
    data: undefined, loading: false, failed: false, now: Date.now(), saving: false, clearing: false, toast: null, toastId: 0,
  })
  private readonly lifetime = new AbortController()
  private revision = 0
  private pending: Promise<void> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly clock: ReturnType<typeof setInterval>
  private readonly stopPreferences: () => void
  private readonly saves = new Set<Promise<boolean>>()

  /**
   * @param preferences - Shared Host-backed form.
   * @param query - Authenticated balance query.
   * @param clearSamples - Authenticated stored-sample cleanup.
   */
  constructor(readonly preferences: ConfigForm<BalancePreferences>, private readonly query: () => Promise<BalanceSnapshot>,
    private readonly clearSamples: (request: BalanceCleanupRequest) => Promise<BalanceSnapshot>) {
    this.stopPreferences = preferences.subscribe(() => { this.refresh() })
    this.clock = setInterval(() => { this.state.set({ ...this.state.getSnapshot(), now: Date.now() }) }, 60_000)
    this.refresh()
  }

  /** Coalesce repeated reads and hide the observation as soon as sampling is disabled. */
  readonly refresh = (): void => {
    if (this.lifetime.signal.aborted) return
    clearTimeout(this.timer)
    this.revision++
    if (!this.preferences.getSnapshot().value?.enabled) {
      this.state.set({ ...this.state.getSnapshot(), data: undefined, loading: false, failed: false })
      return
    }
    if (this.pending !== undefined) return
    this.pending = this.run().finally(() => {
      this.pending = undefined
      const value = this.preferences.getSnapshot().value
      if (!this.lifetime.signal.aborted && value?.enabled) this.timer = setTimeout(this.refresh, value.refreshSeconds * 1000)
    })
  }

  /** Clear an old account's data before querying another credential generation. */
  readonly invalidate = (): void => {
    this.state.set({ ...this.state.getSnapshot(), data: undefined, failed: false })
    this.refresh()
  }

  /**
   * Remove stored samples under the current account and publish the remaining history.
   * @param request - Cleanup mode and its bound.
   * @returns Whether the Host accepted the cleanup.
   */
  readonly clear = async (request: BalanceCleanupRequest): Promise<boolean> => {
    if (this.lifetime.signal.aborted) return false
    this.state.set({ ...this.state.getSnapshot(), clearing: true })
    let accepted = false
    try {
      const data = await this.clearSamples(request)
      accepted = true
      if (!this.lifetime.signal.aborted) {
        this.state.set({ ...this.state.getSnapshot(), data, failed: false, loading: false, now: Date.now() })
      }
    } catch (_error) {
      accepted = false
    }
    if (!this.lifetime.signal.aborted) {
      this.state.set({ ...this.state.getSnapshot(), clearing: false,
        toast: accepted ? 'cleared' : 'clearFailed', toastId: this.state.getSnapshot().toastId + 1 })
    }
    return accepted
  }

  private async run(): Promise<void> {
    while (!this.lifetime.signal.aborted && this.preferences.getSnapshot().value?.enabled) {
      const generation = this.revision
      this.state.set({ ...this.state.getSnapshot(), loading: true, failed: false })
      try {
        const data = await this.query()
        if (this.accepts(generation)) {
          this.state.set({ ...this.state.getSnapshot(), data, loading: false, now: Date.now(), failed: data.status === 'unavailable' })
        }
      } catch (_error) {
        if (this.accepts(generation)) {
          this.state.set({ ...this.state.getSnapshot(), loading: false, failed: true })
        }
      }
      if (generation === this.revision) return
    }
  }

  private accepts(generation: number): boolean {
    return !this.lifetime.signal.aborted && generation === this.revision
  }

  /**
   * Persist a sampling preference and publish its result.
   * @param field - Preference to change.
   * @param value - Requested value.
   * @returns Whether the Host accepted the change.
   */
  readonly save = <K extends keyof BalancePreferences>(field: K, value: BalancePreferences[K]): Promise<boolean> => {
    this.state.set({ ...this.state.getSnapshot(), saving: true })
    const operation = this.preferences.set(field, value).catch(() => false).then((accepted) => {
      if (!this.lifetime.signal.aborted) this.state.set({ ...this.state.getSnapshot(), toast: accepted ? 'saved' : 'saveFailed', toastId: this.state.getSnapshot().toastId + 1 })
      return accepted
    }).finally(() => {
      this.saves.delete(operation)
      if (!this.lifetime.signal.aborted) this.state.set({ ...this.state.getSnapshot(), saving: this.saves.size > 0 })
    })
    this.saves.add(operation)
    return operation
  }

  /**
   * Dismiss feedback without hiding a newer operation's result.
   * @param id - Identity of the currently visible toast.
   */
  readonly dismissToast = (id: number): void => {
    if (this.state.getSnapshot().toastId === id) this.state.set({ ...this.state.getSnapshot(), toast: null })
  }

  /** Stop timers and subscriptions, then await admitted reads and writes. @returns Quiescent completion. */
  async dispose(): Promise<void> {
    this.lifetime.abort(); this.stopPreferences(); clearTimeout(this.timer); clearInterval(this.clock)
    await Promise.allSettled([this.pending, ...this.saves])
  }
}
