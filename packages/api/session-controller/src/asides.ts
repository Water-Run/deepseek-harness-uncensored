/** Native side conversations with durable identities and logged context notes. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ModelSelection as AgentModelSelection } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import { errorChain, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionLogOffset, type Session, type SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-permission-presets'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ApiSessionAgentController } from './agent.ts'
import type { SessionAsideRequest, SessionForkValue } from './types.ts'
import { latestCompletedPrefixBoundary } from './commands.ts'
import { sideIdentity } from './aside-context.ts'

/** Execution preset pinned to every one-shot quick question: it may look, never modify. */
const QUICK_QUESTION_PRESET = 'read-only'

/** Owns concurrent native aside creation until every admitted request finishes. */
export class SessionAsideController {
  private readonly opening = new Map<SessionId, Promise<SessionForkValue>>()
  private readonly pending = new Set<Promise<SessionForkValue>>()
  private closed = false

  /** @param ctx - Host session services. @param agents - Shared composition and resume owner.
   * @param btwReasoningEffort - Live configured reasoning level for one-shot quick questions.
   * @param btwMaxTokens - Output cap that keeps a quick answer short and fast. */
  constructor(private readonly ctx: Context, private readonly agents: ApiSessionAgentController,
    private readonly btwReasoningEffort: () => string, private readonly btwMaxTokens: number) {}

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
    const persistence = this.ctx.get('sessionPersistence')
    const operation = persistence === undefined ? this.create(request)
      : persistence.withCatalogMutation(request.sessionId, () => this.create(request))
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
    const inherited: AgentModelSelection = latestConfig === undefined ? this.ctx.agentDefaultModel.currentSelection() : {
      provider: latestConfig.provider, model: latestConfig.model,
      ...(latestConfig.reasoningEffort === undefined ? {} : { reasoningEffort: latestConfig.reasoningEffort }),
    }
    // A side conversation follows the main conversation's own model and level;
    // a one-shot quick question keeps the model but uses its configured level,
    // because "how is progress" is answered faster and cheaper at low effort.
    const selection = request.kind === 'btw' ? await this.quickQuestionSelection(inherited) : inherited
    // A quick question is answered in one short reply; the output cap bounds both latency and cost.
    const agentOptions = request.kind === 'btw' ? { ...selection, maxTokens: this.btwMaxTokens } : selection
    // A quick question may only look: pin the read-only preset before the
    // session is published, so every tool it could call is confined from the
    // first turn. A side conversation keeps the parent's permissions.
    const setup: typeof composition.setup = request.kind !== 'btw' ? composition.setup : async (setupCtx, setupAgent) => {
      const commit = await composition.setup(setupCtx, setupAgent)
      this.pinReadOnly(setupAgent.session)
      return commit
    }
    const agent = await this.agents.createOwned({
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
      agentOptions,
      setup,
    })
    // Creation options seed the first request, but the model-selection
    // waterfall then applies the Agent's committed selection; record it so the
    // child's own model and level are not replaced by the deployment default.
    this.agents.selectForNextRequest(agent, selection)
    await this.ctx.sessions.flush(agent.session)
    return { sessionId: childId }
  }

  /**
   * Pin a quick question to the deployment's read-only preset before publication.
   * A deployment without the permission surface keeps the prompt-level
   * restriction and logs that no execution confinement is composed.
   * @param session - the fresh quick-question Session.
   */
  private pinReadOnly(session: Session): void {
    const presets = this.ctx.get('permissionPresets')
    if (presets === undefined) {
      this.ctx.logger.warn('session-controller: permission presets are not composed; the quick question keeps default execution permissions')
      return
    }
    try {
      presets.set(session, QUICK_QUESTION_PRESET)
    } catch (error: unknown) {
      throw new Error(`session-controller: a quick question must be read-only: ${errorChain(error)}`)
    }
  }

  /**
   * Apply the configured quick-question reasoning level when the resolved model
   * advertises it. An unknown or unreachable model keeps the inherited level,
   * so a level the adapter cannot serve is never sent.
   * @param inherited - Parent conversation or deployment-default selection.
   * @returns the selection for the one-shot child.
   */
  private async quickQuestionSelection(inherited: AgentModelSelection): Promise<AgentModelSelection> {
    const effort = this.btwReasoningEffort()
    if (effort === '') return inherited
    try {
      const info = await this.ctx.llm.resolveModelInfo(inherited.provider, inherited.model)
      const efforts = info.reasoning?.efforts
      if (efforts !== undefined && !efforts.some(entry => String(entry.id) === effort)) return inherited
    } catch (error: unknown) {
      this.ctx.logger.warn(`session-controller: quick-question reasoning lookup failed: ${errorChain(error)}`)
      return inherited
    }
    return { ...inherited, reasoningEffort: ReasoningEffortId(effort) }
  }
}
