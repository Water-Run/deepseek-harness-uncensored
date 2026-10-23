/** Human-authorized Session deletion: stop work, release writers, remove data, then purge derived state. */
import { setTimeout as delay } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import { SessionAlreadyOwnedError, SessionDeletionUnsupportedError } from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-jobs'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ApiSessionAgentController } from './agent.ts'
import { nativeAsideKind } from './aside-context.ts'
import type { SessionDeleteValue } from './types.ts'

interface DeletionPlan { ids: Set<SessionId>; delegated: Set<SessionId>; removed: Set<SessionId> }

/** Root-owned coordinator; retries retain the exact family through partial cleanup failures. */
export class SessionDeletionController {
  private readonly plans = new Map<SessionId, DeletionPlan>()
  private readonly pending = new Map<SessionId, Promise<SessionDeleteValue>>()
  private closed = false
  private recovery: Promise<void> | undefined

  /**
   * @param ctx - Host services and authenticated access policy.
   * @param agents - API-owned Agent lifecycle capabilities.
   * @param policy - Maximum task-drain duration and activity-check interval.
   * @param stopHistory - Close active history followers before removing their source.
   */
  constructor(private readonly ctx: Context, private readonly agents: ApiSessionAgentController,
    private readonly policy: { drainTimeoutMs: number; pollMs: number },
    private readonly stopHistory: (ids: readonly SessionId[]) => void) {
    ctx.on('session-persistence/deleted', (id) => {
      for (const plan of this.plans.values()) if (plan.ids.has(id)) plan.removed.add(id)
    })
  }

  /**
   * Delete one conversation after confirmation; overlapping requests are refused.
   * @param root - Ordinary conversation selected by the user.
   * @param allows - Authorization captured from this exact Remote invocation.
   * @returns Removed identities after physical and derived cleanup complete.
   */
  async delete(root: SessionId, allows: (id: SessionId) => boolean): Promise<SessionDeleteValue> {
    if (this.closed) return Promise.reject(new RemoteError('gateway/internal', 'Session deletion service is closing.', {}))
    this.authorize([root], allows)
    if (!this.ctx.get('sessionPersistence')?.supportsDeletion) {
      throw new RemoteError('session/delete-unsupported', 'The configured session storage does not support deletion.', {})
    }
    await this.recover()
    if (this.pending.has(root)) return Promise.reject(new RemoteError('session/agent-busy', 'Session deletion is in progress.', { reason: 'deleting' }))
    const operation = this.agents.withDeletion(root, include =>
      this.ctx.sessionPersistence.withCatalogMutation(root, () => this.run(root, include, allows))).catch((error: unknown) => {
      if (error instanceof SessionAlreadyOwnedError) {
        throw new RemoteError('session/writer-held', error.message, { sessionId: error.sessionId }, { cause: error })
      }
      throw error
    })
    this.pending.set(root, operation)
    const settle = (): void => { if (this.pending.get(root) === operation) this.pending.delete(root) }
    void operation.then(settle, settle)
    return operation
  }

  /**
   * Finish derived-data cleanup for previously committed deletions before catalog reads.
   * Failed recovery is retryable and never removes live Session files.
   * @returns Completion of identity-only cleanup.
   */
  recover(): Promise<void> {
    if (this.recovery !== undefined) return this.recovery
    const operation = (async () => {
      const persistence = this.ctx.get('sessionPersistence')
      if (!persistence?.supportsDeletion) return
      const ids = await persistence.deletedSessionIds()
      await this.clean(ids)
    })()
    this.recovery = operation
    void operation.catch(() => { if (this.recovery === operation) this.recovery = undefined })
    return operation
  }

  private authorize(ids: Iterable<SessionId>, allows: (id: SessionId) => boolean): void {
    for (const id of ids) {
      if (!allows(id)) {
        throw new RemoteError('remote-access/denied', 'Conversation deletion is not allowed.', { action: 'session/delete', reason: 'no-allow' })
      }
    }
  }

  private async family(root: SessionId, allows: (id: SessionId) => boolean): Promise<{ ids: SessionId[]; delegated: Set<SessionId> }> {
    const headers = new Map<SessionId, SessionHeader>()
    for (const entry of await this.ctx.sessionPersistence.list()) headers.set(entry.header.id, entry.header)
    for (const session of this.ctx.sessions.list()) headers.set(session.id, session.header)
    const header = headers.get(root)
    if (header?.parentSession !== undefined && (header.origin === 'subagent' || nativeAsideKind(root, header.parentSession) !== undefined)) {
      throw new RemoteError('session/delete-owned', 'Delete this child conversation with its owning conversation.',
        { sessionId: root, parentSessionId: header.parentSession })
    }
    const nativeChildren = new Map<SessionId, SessionId[]>()
    for (const candidate of headers.values()) {
      if (candidate.parentSession === undefined || nativeAsideKind(candidate.id, candidate.parentSession) === undefined) continue
      const children = nativeChildren.get(candidate.parentSession) ?? []
      children.push(candidate.id); nativeChildren.set(candidate.parentSession, children)
    }
    const ids = new Set([root]), queue = [root], delegated = new Set<SessionId>(), catalogued = new Set<SessionId>()
    const add = (id: SessionId): void => { if (!ids.has(id)) { ids.add(id); queue.push(id) } }
    const subagents = this.ctx.get('subagents')
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index] as SessionId
      for (const child of nativeChildren.get(id) ?? []) add(child)
      if (subagents === undefined || catalogued.has(id) || !headers.has(id)) continue
      this.authorize([id], allows)
      for (const child of await subagents.listDescendants(id)) {
        if (child.kind === 'diagnostic') {
          if (child.reason === 'unavailable' && !headers.has(child.id)) { add(child.id); delegated.add(child.id); continue }
          throw new RemoteError('gateway/internal', 'Associated conversation data could not be fully inspected. Nothing was deleted.', {})
        }
        const stored = headers.get(child.id)
        if (stored !== undefined && stored.parentSession !== child.parentId) {
          throw new RemoteError('gateway/internal', 'Associated conversation ownership does not match its stored parent.', {})
        }
        add(child.id); delegated.add(child.id); catalogued.add(child.id); catalogued.add(child.parentId)
      }
      catalogued.add(id)
    }
    return { ids: [...ids], delegated }
  }

  private async run(root: SessionId, include: (ids: readonly SessionId[]) => void,
    allows: (id: SessionId) => boolean): Promise<SessionDeleteValue> {
    this.authorize([root], allows)
    const plan = this.plans.get(root) ?? { ids: new Set<SessionId>([root]), delegated: new Set<SessionId>(), removed: new Set<SessionId>() }
    this.plans.set(root, plan)
    const collect = async (): Promise<void> => {
      const discovered = await this.family(root, allows)
      this.authorize(discovered.ids, allows)
      for (const id of discovered.ids) plan.ids.add(id)
      for (const id of discovered.delegated) plan.delegated.add(id)
      this.authorize(plan.ids, allows)
      include([...plan.ids])
    }
    await collect()
    const parents: Agent[] = []
    for (const id of plan.ids) {
      if (plan.delegated.has(id)) continue
      this.agents.assertOwnedOrCold(id)
      const agent = this.ctx.agents.get(id)
      if (agent !== undefined) parents.push(agent)
    }
    await Promise.all([...plan.ids].map(sessionId => this.ctx.parallel('workspace/session-stop', { sessionId })))
    await this.ctx.get('subagents')?.drainDescendants(parents)
    await collect()
    await Promise.all([...plan.ids].map(sessionId => this.ctx.parallel('workspace/session-stop', { sessionId })))
    const deadline = performance.now() + this.policy.drainTimeoutMs
    for (;;) {
      const activities = await Promise.all([...plan.ids].map(sessionId =>
        this.ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]))))
      if (activities.every(activity => activity.length === 0)) break
      if (performance.now() >= deadline) throw new RemoteError('session/delete-timeout', 'Tasks have not stopped. Wait for them to finish and retry deletion.', { sessionId: root })
      await delay(this.policy.pollMs)
    }
    const ids = [...plan.ids].filter(id => id !== root).reverse().concat(root)
    this.stopHistory(ids)
    for (const id of ids) await this.agents.disposeOwned(id)
    try {
      await this.ctx.sessionPersistence.deleteSessions(ids)
      for (const id of ids) plan.removed.add(id)
    } catch (error) {
      if (error instanceof SessionDeletionUnsupportedError) {
        throw new RemoteError('session/delete-unsupported', error.message, {}, { cause: error })
      }
      if (error instanceof SessionAlreadyOwnedError && plan.removed.size === 0) {
        throw new RemoteError('session/writer-held', error.message, { sessionId: error.sessionId }, { cause: error })
      }
      let cause = error
      try { await this.clean([...plan.removed]) }
      catch (cleanup) { cause = new AggregateError([error, cleanup], 'Session deletion cleanup failed.') }
      throw new RemoteError('session/delete-incomplete', 'Conversation deletion did not finish. Retry to complete cleanup.',
        { deletedSessionIds: [...plan.removed] }, { cause })
    }
    try { await this.clean(ids) }
    catch (cause) {
      throw new RemoteError('session/delete-incomplete', 'Conversation deletion did not finish. Retry to complete cleanup.',
        { deletedSessionIds: [...plan.removed] }, { cause })
    }
    this.plans.delete(root)
    return { deletedSessionIds: ids }
  }

  private async clean(ids: readonly SessionId[]): Promise<void> {
    if (ids.length === 0) return
    await this.ctx.sessionQuery.forgetSessions(ids)
    await this.ctx.get('sessionProjectionCache')?.forgetSessions(ids)
    await this.ctx.workspaceRegistry.forgetSessions(ids)
    const jobs = this.ctx.get('jobs')
    for (const id of ids) {
      for (const job of jobs?.list(id) ?? []) if (job.owner === id) jobs?.remove(job.id, id)
      this.ctx.emit('api-session/deleted', id)
    }
  }

  /** Stop new deletions and drain every admitted operation before its services unload. */
  async close(): Promise<void> { this.closed = true; await Promise.allSettled([...this.pending.values(), this.recovery]) }
}
