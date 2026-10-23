/** Root-owned confirmation and settlement for permanent conversation deletion. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult, SessionDeleteValue } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** The selected identity and title stay fixed while a deletion is pending. */
export interface DeleteTarget { sessionId: SessionId; title: string; deletedIds?: readonly SessionId[] }
/** User-facing failure categories; protocol details remain in the data layer. */
export type DeleteFailure = 'busy' | 'timeout' | 'denied' | 'owned' | 'unsupported' | 'incomplete' | 'refresh' | 'failed'
/** Confirmation and feedback outlive the originating row menu. */
export interface DeleteState {
  target: DeleteTarget | null
  busy: boolean
  error: DeleteFailure | null
  notice: { id: number; retry: DeleteTarget | null } | null
}

/** Serializes deletion and view refresh, retaining a retry after an uncertain or partial failure. */
export class DeleteSessionController {
  /** Shared state bound by the confirmation dialog and its notification. */
  readonly state = createSnapshotStore<DeleteState>({ target: null, busy: false, error: null, notice: null })
  private closed = false
  private sequence = 0
  private pending: Promise<void> | undefined
  /**
   * @param remove - Authenticated destructive request.
   * @param refresh - Reconcile affected views after the Host confirms deletion.
   */
  constructor(private readonly remove: (id: SessionId) => Promise<RemoteResult<SessionDeleteValue>>,
    private readonly refresh: (ids: readonly SessionId[]) => Promise<void>) {}

  /** Open confirmation for one captured row. @param id - Session identity. @param title - Display title. */
  readonly request = (id: SessionId, title: string): void => {
    if (!this.closed && !this.pending) this.state.set({ target: { sessionId: id, title }, busy: false, error: null, notice: null })
  }

  /** Close an idle dialog; an incomplete operation remains reachable from its retry notice. */
  readonly cancel = (): void => {
    if (this.closed || this.pending) return
    const { target, error } = this.state.getSnapshot()
    this.state.set({ target: null, busy: false, error: null, notice: error === null ? null : { id: ++this.sequence, retry: target } })
  }

  /** Reopen the captured failed operation without losing a confirmed Host deletion. */
  readonly retry = (): void => {
    const target = this.state.getSnapshot().notice?.retry
    if (!this.closed && !this.pending && target) this.state.set({ target, busy: false, error: null, notice: null })
  }

  /** Dismiss the current notification without affecting a newer one. @param id - Notification identity. */
  readonly dismiss = (id: number): void => {
    if (this.state.getSnapshot().notice?.id === id) this.state.set({ ...this.state.getSnapshot(), notice: null })
  }

  /** Submit the captured confirmation once. @returns Completion of the current operation. */
  readonly confirm = (): Promise<void> => {
    if (this.pending !== undefined) return this.pending
    const target = this.state.getSnapshot().target
    if (this.closed || target === null) return Promise.resolve()
    this.state.set({ ...this.state.getSnapshot(), busy: true, error: null })
    const operation = this.run(target).finally(() => {
      this.pending = undefined
      if (!this.closed) this.state.set({ ...this.state.getSnapshot(), busy: false })
    })
    this.pending = operation
    return operation
  }

  private async run(target: DeleteTarget): Promise<void> {
    try {
      let deletedIds = target.deletedIds
      if (deletedIds === undefined) {
        const result = await this.remove(target.sessionId)
        if (this.closed) return
        if (!result.ok) {
          const failures: Partial<Record<typeof result.error.code, DeleteFailure>> = {
            'session/writer-held': 'busy', 'session/agent-busy': 'busy', 'session/delete-timeout': 'timeout',
            'remote-access/denied': 'denied', 'session/delete-owned': 'owned', 'session/delete-unsupported': 'unsupported',
            'session/delete-incomplete': 'incomplete',
          }
          this.fail(failures[result.error.code] ?? 'failed')
          return
        }
        deletedIds = result.value.deletedSessionIds
        target = { ...target, deletedIds }
        this.state.set({ ...this.state.getSnapshot(), target })
      }
      try { await this.refresh(deletedIds) }
      catch (_refreshFailed) { this.fail('refresh'); return }
      this.publishSuccess()
    } catch (_requestFailed) { this.fail('failed') }
  }

  private publishSuccess(): void {
    if (!this.closed) this.state.set({ target: null, busy: true, error: null, notice: { id: ++this.sequence, retry: null } })
  }

  private fail(error: DeleteFailure): void {
    if (!this.closed) this.state.set({ ...this.state.getSnapshot(), error })
  }

  /** Stop admissions and drain the destructive request before releasing its Remote provider. */
  async dispose(): Promise<void> { this.closed = true; await this.pending }
}
