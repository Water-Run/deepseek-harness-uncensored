/** Native side conversations with durable identities and logged context notes. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ModelSelection as AgentModelSelection } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import { errorChain, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-permission-presets'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { SessionObservation } from '@deepseek-ai/dsh-session-query'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ApiSessionAgentController } from './agent.ts'
import type { SessionAsideRequest, SessionAsideResetRequest, SessionForkValue } from './types.ts'
import { sideIdentity, currentSide, nativeAsideKind } from './aside-identity.ts'

/** Execution preset pinned to every one-shot quick question: it may look, never modify. */
const QUICK_QUESTION_PRESET = 'read-only'

/** Owns concurrent native aside creation until every admitted request finishes. */
export class SessionAsideController {
  private readonly queues = new Map<SessionId, Promise<SessionForkValue>>()
  private readonly pending = new Set<Promise<SessionForkValue>>()
  private closed = false

  /** @param ctx - Host session services. @param agents - Shared composition and resume owner.
   * @param btwReasoningEffort - Live configured reasoning level for one-shot quick questions.
   * @param btwMaxTokens - Output cap that keeps a quick answer short and fast.
   * @param clearOnClose - Live setting; manual clearing does not depend on it. */
  constructor(private readonly ctx: Context, private readonly agents: ApiSessionAgentController,
    private readonly btwReasoningEffort: () => string, private readonly btwMaxTokens: number,
    private readonly clearOnClose: () => boolean) {}

  /**
   * Open a persistent side question, or create a fresh inline question.
   * @param request - Parent session and requested presentation semantics.
   * @returns Independent child identity; no model request is started.
   */
  open(request: SessionAsideRequest): Promise<SessionForkValue> {
    return this.inOrder(request.sessionId, async () => {
      this.authorize(request.sessionId)
      if (request.kind === 'btw') return this.create(request, brandString<SessionId>(`session-btw-${randomUUID()}`))
      using parent = await this.ctx.sessionQuery.observeSession(request.sessionId)
      const current = await currentSide(this.ctx, parent.header.id)
      if (current === undefined) return await this.create(request, sideIdentity(request.sessionId))
      this.authorize(current.id)
      const resumed = await this.agents.resolveAgent(current.id)
      if ('error' in resumed) throw resumed.error
      return { sessionId: current.id, inheritedEventCount: resumed.agent.session.inheritedEventCount }
    })
  }

  /**
   * Replace only a native side conversation with a fresh, durable context generation.
   * The old log remains historical. Retrying an old identity returns the already-published successor.
   * @param request - Exact side identity and whether an actual tab close initiated the request.
   * @returns The current side identity after the operation; close is a no-op when disabled.
   */
  async reset(request: SessionAsideResetRequest): Promise<SessionForkValue> {
    this.authorize(request.sessionId)
    using source = await this.ctx.sessionQuery.observeSession(request.sessionId)
    const parent = source.header.parentSession
    if (parent === undefined || nativeAsideKind(request.sessionId, parent) !== 'side') {
      throw new RemoteError('gateway/bad-request', 'Context clearing is available only inside a native side conversation.', {})
    }
    this.authorize(parent)
    return await this.inOrder(parent, async () => {
      using main = await this.ctx.sessionQuery.observeSession(parent)
      const current = await currentSide(this.ctx, main.header.id)
      if (current === undefined) throw new RemoteError('session/not-found', 'Side conversation is unavailable.', { sessionId: request.sessionId })
      this.authorize(current.id)
      if (current.id !== request.sessionId || (request.cause === 'close' && !this.clearOnClose())) {
        return { sessionId: current.id }
      }
      if (!Number.isSafeInteger(current.generation + 1)) throw new RemoteError('gateway/internal', 'Side context generation is exhausted.', {})
      const childId = sideIdentity(parent, current.generation + 1)
      this.authorize(childId)
      this.agents.assertOwnedOrCold(current.id)
      const resolved = await this.agents.resolveAgent(current.id)
      if ('error' in resolved) throw resolved.error
      return await this.agents.withAsideReset(current.id, async () => {
        using settings = await this.ctx.sessionQuery.observeSession(current.id, { projectionMode: 'all' })
        resolved.agent.cancel({ kind: 'user' })
        await this.ctx.parallel('workspace/session-stop', { sessionId: current.id })
        await this.ctx.get('subagents')?.drainDescendants([resolved.agent])
        await this.agents.disposeOwned(current.id)
        const fresh = await this.create({ sessionId: parent, kind: 'side' }, childId, settings)
        this.ctx.emit('api-session/side-reset', parent)
        return fresh
      })
    })
  }

  private authorize(id: SessionId): void {
    if (!this.ctx.remoteAccess.allows({ kind: 'session', id })) {
      throw new RemoteError('remote-access/denied', 'Side conversation access denied.', { action: 'session/aside', reason: 'no-allow' })
    }
  }

  private inOrder(parent: SessionId, run: () => Promise<SessionForkValue>): Promise<SessionForkValue> {
    if (this.closed) return Promise.reject(new RemoteError('gateway/internal', 'Session service is closing', {}))
    const previous = this.queues.get(parent)
    const operation = (async () => {
      if (previous !== undefined) await Promise.allSettled([previous])
      const persistence = this.ctx.get('sessionPersistence')
      return persistence === undefined ? run() : persistence.withCatalogMutation(parent, run)
    })()
    this.queues.set(parent, operation)
    this.pending.add(operation)
    const finished = (): void => {
      this.pending.delete(operation)
      if (this.queues.get(parent) === operation) this.queues.delete(parent)
    }
    void operation.then(finished, finished)
    return operation
  }

  /** Stop admissions and drain work before the session providers are released. */
  async close(): Promise<void> {
    this.closed = true
    await Promise.allSettled([...this.pending])
  }

  private async create(request: SessionAsideRequest, childId: SessionId, copy?: SessionObservation): Promise<SessionForkValue> {
    if (copy !== undefined) return this.publish(request, childId, copy)
    using source = await this.ctx.sessionQuery.observeSession(request.sessionId, { projectionMode: 'all' })
    return await this.publish(request, childId, source)
  }

  private async publish(request: SessionAsideRequest, childId: SessionId, source: SessionObservation): Promise<SessionForkValue> {
    this.authorize(childId)
    const parent = this.ctx.sessions.get(request.sessionId)
    if (parent !== undefined) await this.ctx.sessions.flush(parent)
    const composition = await this.agents.composeAgent(this.agents.presetForObservation(source))
    const latestConfig = source.projections?.values.modelSelection?.next
      ?? source.events.findLast(event => event.type === 'request/header')?.data.header.config
    const inherited: AgentModelSelection = latestConfig === undefined ? this.ctx.agentDefaultModel.currentSelection() : {
      provider: latestConfig.provider, model: latestConfig.model,
      ...(latestConfig.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(latestConfig.reasoningEffort) }),
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
    const inheritedPreset = source.projections?.values.permissions?.currentValue
    const sandbox = source.events.findLast(event => event.type === 'sandbox/mode')
    const approval = source.events.findLast(event => event.type === 'approval/policy')
    const setup: typeof composition.setup = async (setupCtx, setupAgent) => {
      const commit = await composition.setup(setupCtx, setupAgent)
      if (request.kind === 'btw') this.pinReadOnly(setupAgent.session)
      else {
        if (inheritedPreset !== undefined && inheritedPreset !== 'custom') this.ctx.get('permissionPresets')?.set(setupAgent.session, inheritedPreset)
        if (sandbox?.type === 'sandbox/mode') setSandboxMode(setupAgent.session, sandbox.data.mode)
        if (approval?.type === 'approval/policy') setApprovalPolicy(setupAgent.session, approval.data.policy)
      }
      return commit
    }
    const agent = await this.agents.createOwned({
      sessionId: childId,
      meta: {
        parentSession: request.sessionId,
        ...(source.header.cwd === undefined ? {} : { cwd: source.header.cwd }),
        ...(composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset }),
      },
      agentOptions,
      setup,
    })
    // Persist the child's own model and effort for later resumes.
    agent.model.select(selection)
    await this.ctx.sessions.flush(agent.session)
    return { sessionId: childId, inheritedEventCount: 0 }
  }

  /**
   * Pin a quick question to the deployment's read-only preset before publication.
   * A deployment without permission enforcement cannot open quick questions.
   * @param session - the fresh quick-question Session.
   */
  private pinReadOnly(session: Session): void {
    const presets = this.ctx.get('permissionPresets')
    if (presets === undefined) {
      throw new Error('session-controller: a quick question requires read-only permission enforcement')
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
