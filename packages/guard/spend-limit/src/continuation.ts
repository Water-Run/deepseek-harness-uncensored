/** Owned recovery of durable spending pauses through the conversation's normal lifecycle owner. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import { boundContextSummary, createUserMessage, type ContextFormed, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { SpendGate } from './gate.ts'
import type { SpendPauseClaim } from './ledger.ts'
import type { SpendPauseId } from './types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Automatic continuation; the optional identity deduplicates a recovered durable pause. */
    'spend-limit': { kind: 'spend-limit'; pauseId?: SpendPauseId } & ContextFormed
  }
}

/** Whether the normal Session owner accepted continuation or needs a later retry. */
export type SpendContinuation = 'continued' | 'running' | 'missing' | 'unavailable'
/** Restored Agent and the durability barrier owned by its persistence provider. */
export interface SpendContinuationTarget {
  readonly agent: Agent
  /**
   * Commit queued continuation records before acknowledging their ledger claim.
   * @returns After the queued continuation is durably recorded.
   */
  flush(): Promise<void>
}
/** A provider restores the correct mode, workspace and ownership before delivering the continuation. */
export type SpendContinuationHandler = (claim: SpendPauseClaim, signal: AbortSignal) => Promise<SpendContinuationTarget | 'missing' | 'unavailable'>

/**
 * Create a logged system-origin notice for the pending task.
 * @param pauseId - Durable pause identity, preserved across recovery attempts.
 * @returns The notice delivered only after spending capacity becomes available.
 */
export function spendContinuationMessage(pauseId: SpendPauseId): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: '额度已恢复。请从暂停处继续原来的任务，不要重复已经完成的步骤。 / Spending capacity recovered. Continue the paused task from where it stopped, without repeating finished steps.' }],
    source: { kind: 'spend-limit', pauseId, form: 'notice', summary: boundContextSummary('额度恢复后继续执行暂停的对话') },
  })
}

/**
 * Queue a recovered pause at most once in one Session log, including after a crash before ledger acknowledgement.
 * @param agent - Agent restored by its normal owner.
 * @param claim - The exclusively claimed pause.
 * @returns Whether this task was accepted or is already running.
 */
export function queueSpendContinuation(agent: Agent, claim: SpendPauseClaim): SpendContinuation {
  const matches = (message: UserMessage): boolean => message.source.kind === 'spend-limit' && message.source.pauseId === claim.id
  if (agent.inbox.nextTurn.some(matches) || agent.inbox.nextStep.some(matches)
    // oxlint-disable-next-line typescript/no-deprecated -- Recovery deduplicates rare persisted continuations, outside the append hot path.
    || agent.session.snapshotEvents().some(event => event.type === 'user/message' && matches(event.data))) return 'continued'
  if (agent.status === 'running') return 'running'
  agent.followup(spendContinuationMessage(claim.id))
  return 'continued'
}

/** One serialized recovery worker whose disposer drains all provider calls before the ledger closes. */
export class SpendRecovery {
  private provider: { handler: SpendContinuationHandler; capture: (id: SessionId) => boolean; abort: AbortController } | undefined
  private active: Promise<void> | undefined
  private closed = false
  /** @param report - Visible owner-level reporting for retained pauses that could not resume. */
  constructor(private readonly report: (error: unknown) => void) {}

  /**
   * Install one conversation lifecycle owner.
   * @param handler - Restores and queues through the normal conversation path.
   * @param capture - Whether this provider owns the live conversation and can restore its composition.
   * @returns A disposer that cancels and drains calls before the provider unloads.
   */
  register(handler: SpendContinuationHandler, capture: (id: SessionId) => boolean): () => Promise<void> {
    if (this.closed || this.provider !== undefined) throw new Error('spend-limit: continuation provider unavailable or already registered')
    const provider = { handler, capture, abort: new AbortController() }
    this.provider = provider
    return async () => {
      if (this.provider === provider) this.provider = undefined
      provider.abort.abort()
      await this.active
    }
  }

  /**
   * Check whether the registered lifecycle owner can recover this live conversation.
   * @param id - Session whose request is about to wait.
   * @returns False for unowned runtimes and after provider disposal.
   */
  canCapture(id: SessionId): boolean { return !this.closed && this.provider?.capture(id) === true }

  /**
   * Run or join one recovery pass without overlapping another provider call.
   * @param gate - Open ledger and admission owner.
   * @returns Completion of the shared recovery pass.
   */
  flush(gate: SpendGate): Promise<void> {
    if (this.closed || this.provider === undefined) return Promise.resolve()
    if (this.active !== undefined) return this.active
    const provider = this.provider
    const cancelled = (): boolean => provider.abort.signal.aborted
    const task = Promise.resolve().then(async () => {
      if (this.closed || cancelled()) return
      const claims = gate.ledger.claimBlockedSessions()
      for (const claim of claims) {
        try {
          if (cancelled()) { gate.ledger.releaseClaim(claim.id); continue }
          const result = await provider.handler(claim, provider.abort.signal)
          provider.abort.signal.throwIfAborted()
          if (result === 'unavailable') gate.ledger.releaseClaim(claim.id)
          else {
            if (result !== 'missing') {
              queueSpendContinuation(result.agent, claim)
              await result.flush()
              provider.abort.signal.throwIfAborted()
            }
            gate.ledger.completeClaim(claim.id)
          }
        } catch (error) {
          gate.ledger.releaseClaim(claim.id)
          if (!cancelled()) this.report(error)
        }
      }
    }).catch(this.report).finally(() => { if (this.active === task) this.active = undefined })
    this.active = task
    return task
  }

  /** Stop new recovery and drain the active provider call before releasing its dependencies. */
  async close(): Promise<void> {
    this.closed = true
    this.provider?.abort.abort()
    await this.active
  }
}
