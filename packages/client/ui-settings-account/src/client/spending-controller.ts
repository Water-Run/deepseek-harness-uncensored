/** Root-owned spending polling and serialized writes; closing Settings never owns a request. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SpendSnapshot } from '@deepseek-ai/dsh-spend-limit/types'

/** Shared query state and operation feedback. */
export interface SpendingState {
  data: SpendSnapshot | undefined
  failed: boolean
  saving: boolean
  toast: { id: number; success: boolean } | null
}

/** Polls the durable ledger without overlapping reads or publishing stale pre-write results. */
export class SpendingController {
  /** Shared observations and feedback, retained independently of visible Settings panels. */
  readonly state = createSnapshotStore<SpendingState>({ data: undefined, failed: false, saving: false, toast: null })
  private closed = false
  private revision = 0
  private sequence = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private read: Promise<void> | undefined
  private write: Promise<boolean> | undefined
  /** @param query - Authenticated ledger read. @param pollMs - UI refresh interval. */
  constructor(private readonly query: () => Promise<SpendSnapshot>, private readonly pollMs = 2000) { this.refresh() }

  /** Refresh coalesces behind a pending read and never races a settings write. */
  readonly refresh = (): void => {
    clearTimeout(this.timer)
    if (this.closed || this.read !== undefined || this.write !== undefined) return
    const revision = this.revision
    this.read = Promise.resolve().then(this.query).then((data) => {
      if (!this.closed && revision === this.revision) this.state.set({ ...this.state.getSnapshot(), data, failed: false })
    }, () => {
      if (!this.closed && revision === this.revision) this.state.set({ ...this.state.getSnapshot(), failed: true })
    }).finally(() => {
      this.read = undefined
      if (!this.closed) this.timer = setTimeout(this.refresh, this.pollMs)
    })
  }

  /**
   * Persist one mutation and replace observations only with its committed response.
   * @param operation - Host mutation; synchronous throws are also reported.
   * @returns Whether this mutation succeeded.
   */
  readonly mutate = (operation: () => Promise<SpendSnapshot>): Promise<boolean> => {
    if (this.closed || this.write !== undefined) return Promise.resolve(false)
    this.revision++
    clearTimeout(this.timer)
    this.state.set({ ...this.state.getSnapshot(), saving: true })
    this.write = Promise.resolve().then(operation).then((data) => {
      if (!this.closed) this.state.set({ ...this.state.getSnapshot(), data, failed: false, toast: { id: ++this.sequence, success: true } })
      return true
    }, () => {
      if (!this.closed) this.state.set({ ...this.state.getSnapshot(), toast: { id: ++this.sequence, success: false } })
      return false
    }).finally(() => {
      this.write = undefined
      if (!this.closed) { this.state.set({ ...this.state.getSnapshot(), saving: false }); this.refresh() }
    })
    return this.write
  }

  /** Clear the current feedback without dismissing a newer operation. @param id - Notification identity. */
  readonly dismiss = (id: number): void => {
    if (this.state.getSnapshot().toast?.id === id) this.state.set({ ...this.state.getSnapshot(), toast: null })
  }
  /** Stop polling and drain requests before releasing the Remote connection. @returns Quiescent completion. */
  async dispose(): Promise<void> { this.closed = true; clearTimeout(this.timer); await Promise.allSettled([this.read, this.write]) }
}
