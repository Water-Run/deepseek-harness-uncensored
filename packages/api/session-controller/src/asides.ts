/** Native side conversations with durable identities and logged context notes. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionLogOffset, type SessionId } from '@deepseek-ai/dsh-session'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ApiSessionAgentController } from './agent.ts'
import type { SessionAsideRequest, SessionForkValue } from './types.ts'
import { latestCompletedPrefixBoundary } from './commands.ts'
import { sideIdentity } from './aside-context.ts'

/** Owns concurrent native aside creation until every admitted request finishes. */
export class SessionAsideController {
  private readonly opening = new Map<SessionId, Promise<SessionForkValue>>()
  private readonly pending = new Set<Promise<SessionForkValue>>()
  private closed = false

  /** @param ctx - Host session services. @param agents - Shared composition and resume owner. */
  constructor(private readonly ctx: Context, private readonly agents: ApiSessionAgentController) {}

  /**
   * Open a persistent side question, or create a fresh inline question.
   * @param request - Parent session and requested presentation semantics.
   * @returns Independent child identity; no model request is started.
   */
  open(request: SessionAsideRequest): Promise<SessionForkValue> {
    if (this.closed) return Promise.reject(new RemoteError('gateway/internal', 'Session service is closing', {}))
    if (request.kind === 'side') {
      const existing = this.opening.get(request.sessionId)
      if (existing !== undefined) return existing
    }
    const operation = this.create(request)
    this.pending.add(operation)
    if (request.kind === 'side') this.opening.set(request.sessionId, operation)
    const finished = (): void => {
      this.pending.delete(operation)
      if (this.opening.get(request.sessionId) === operation) this.opening.delete(request.sessionId)
    }
    void operation.then(finished, finished)
    return operation
  }

  /** Stop admissions and drain work before the session providers are released. */
  async close(): Promise<void> {
    this.closed = true
    await Promise.allSettled([...this.pending])
  }

  private async create(request: SessionAsideRequest): Promise<SessionForkValue> {
    using source = await this.ctx.sessionQuery.observeSession(request.sessionId)
    const childId = request.kind === 'side' ? sideIdentity(request.sessionId)
      : brandString<SessionId>(`session-btw-${randomUUID()}`)
    if (!this.ctx.remoteAccess.allows({ kind: 'session', id: childId })) {
      throw new RemoteError('remote-access/denied', 'Side conversation access denied', { action: 'session/aside', reason: 'no-allow' })
    }
    if (request.kind === 'side') {
      let exists = false
      try {
        using child = await this.ctx.sessionQuery.observeSession(childId)
        if (child.header.parentSession !== request.sessionId) {
          throw new RemoteError('gateway/internal', 'Side conversation belongs to another parent', {})
        }
        exists = true
      } catch (error) {
        if (!(error instanceof SessionQueryError && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND')) throw error
      }
      if (exists) {
        const resumed = await this.agents.resolveAgent(childId)
        if ('error' in resumed) throw resumed.error
        return { sessionId: childId }
      }
    }
    const boundary = request.kind === 'side' ? latestCompletedPrefixBoundary(source.events) : undefined
    const composition = await this.agents.composeAgent(this.agents.presetForObservation(source))
    const latestConfig = source.events.findLast(event => event.type === 'request/header')?.data.header.config
    const selection = latestConfig === undefined ? this.ctx.agentDefaultModel.currentSelection() : {
      provider: latestConfig.provider, model: latestConfig.model,
      ...(latestConfig.reasoningEffort === undefined ? {} : { reasoningEffort: latestConfig.reasoningEffort }),
    }
    await this.ctx.agents.create({
      sessionId: childId,
      ...(boundary === undefined ? {} : {
        seed: buildForkSeed(source.events, boundary), inheritedEventCount: SessionLogOffset(boundary + 1),
      }),
      meta: {
        parentSession: request.sessionId,
        ...(boundary === undefined ? {} : { isSeeded: true }),
        ...(source.header.cwd === undefined ? {} : { cwd: source.header.cwd }),
        ...(composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset }),
      },
      agentOptions: selection,
      setup: composition.setup,
    })
    return { sessionId: childId }
  }
}
