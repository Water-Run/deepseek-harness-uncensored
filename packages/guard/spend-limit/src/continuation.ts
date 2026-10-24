/** Continue a conversation that a dead process left blocked by the spending limit. */
import type { Context } from '@deepseek-ai/cordis'
import { boundContextSummary, createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Automatic continuation after a spending pause. It is not text the user typed. */
    'spend-limit': { kind: 'spend-limit' } & ContextFormed
  }
}

/** Result of asking one loaded or restored conversation to continue. */
export type SpendContinuation = 'continued' | 'running' | 'missing' | 'unavailable'

/**
 * The model-visible notice that resumes a paused task.
 * @returns A user-role notice. The transcript attributes it to the spending limit, not to the user.
 */
export function spendContinuationMessage(): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: '额度已恢复。请从暂停处继续原来的任务，不要重复已经完成的步骤。 / Spending capacity recovered. Continue the paused task from where it stopped, without repeating finished steps.' }],
    source: { kind: 'spend-limit', form: 'notice', summary: boundContextSummary('额度恢复后继续执行暂停的对话') },
  })
}

interface ContinuableAgent {
  readonly status?: string
  followup?(message: UserMessage): void
}

function continuable(agent: unknown): agent is ContinuableAgent & { followup: (message: UserMessage) => void } {
  return typeof agent === 'object' && agent !== null && typeof (agent as ContinuableAgent).followup === 'function'
}

/**
 * Resume one blocked conversation on the live agent registry.
 * A running agent is left alone. A deleted session is reported missing.
 * @param ctx - Application scope that may already have loaded agents.
 * @param sessionId - Conversation id stored in the spending ledger.
 * @returns Whether a new turn was queued, the conversation is already running, or it cannot be restored yet.
 */
export async function continueSpendSession(ctx: Context, sessionId: string): Promise<SpendContinuation> {
  const agents = ctx.get('agents')
  if (agents === undefined) return 'unavailable'
  const id = brandString<SessionId>(sessionId)
  const live = agents.get(id)
  if (live !== undefined) {
    if (!continuable(live) || live.status === 'running') return 'running'
    live.followup(spendContinuationMessage())
    return 'continued'
  }
  try {
    const handle = await agents.resume({ resumeSessionId: id })
    const agent = handle.agent
    if (continuable(agent) && agent.status !== 'running') agent.followup(spendContinuationMessage())
    return 'continued'
  } catch (error) {
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
    if (message.includes('not-found') || message.includes('not found') || message.includes('does not exist')) return 'missing'
    throw error
  }
}
