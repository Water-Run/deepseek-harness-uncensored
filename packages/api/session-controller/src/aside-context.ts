/** Durable native aside identities restore their prompt section during Agent composition. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-session-query'
import { latestCompletedPrefixBoundary } from './commands.ts'
import { mainProgressContext } from './aside-main-context.ts'
import { quickQuestionContext } from './aside-question-context.ts'

/** Byte budgets for the context each native aside kind receives. */
export interface AsideContextLimits {
  /** Completed main updates supplied to a persistent side conversation. */
  readonly sideContextBytes: number
  /** Live progress snapshot supplied to a one-shot quick question. */
  readonly btwContextBytes: number
}

/**
 * Derive the persistent side conversation associated with a main session.
 * @param parent - Owning main session.
 * @returns Its stable side-question identity.
 */
export function sideIdentity(parent: SessionId): SessionId {
  return brandString<SessionId>(`session-side-${createHash('sha256').update(parent).digest('hex')}`)
}

/**
 * Classify a reserved native-aside identity against its recorded parent.
 * @param id - Child Session identity.
 * @param parent - Recorded direct parent.
 * @returns Native aside kind, or undefined for ordinary conversations and forks.
 */
export function nativeAsideKind(id: SessionId, parent: SessionId | undefined): 'side' | 'btw' | undefined {
  if (parent === undefined) return undefined
  if (id === sideIdentity(parent)) return 'side'
  return /^session-btw-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id) ? 'btw' : undefined
}

/**
 * Restore native aside instructions without adding a synthetic user message or waking the Agent.
 * The normal system-prompt admission records the instructions before any model sees them.
 * Both kinds receive a bounded view of the parent conversation: the side conversation
 * follows completed updates, while a quick question needs the in-flight turn to answer
 * "how is it going" — neither is a new instruction to continue the main task.
 * @param ctx - New or resumed Agent scope.
 * @param agent - Session whose durable identity selects the aside semantics.
 * @param limits - Byte budgets for the parent context each kind receives.
 * @returns Completion of the scoped prompt registration.
 */
export async function installAsideContext(ctx: Context, agent: Agent, limits: AsideContextLimits): Promise<void> {
  const parent = agent.session.header.parentSession
  if (parent === undefined) return
  const kind = nativeAsideKind(agent.id, parent)
  if (kind === undefined) return
  await ctx.plugin({ name: 'native-aside-context', inject: ['systemPrompt', 'sessionQuery'], apply(scope: Context) {
    scope.effect(() => scope.systemPrompt.section({ name: 'conversation:aside',
      order: scope.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'), interpolate: false,
      text: kind === 'side'
        ? 'This is a side question in a separate conversation. The inherited transcript is background context. Respond to the new question here; do not resume the parent task unless explicitly asked. Messages in this conversation do not enter the parent conversation.'
        : 'This is a quick question asked while the main conversation is in progress, usually "how is it going" or one small clarification. The bounded snapshot below is background data: use it to answer, but never continue, repeat, or change the main task. Answer in the user\'s language, in at most three short sentences (five short bullets at most for progress), with no preamble, no restating the question, no tool calls, and no follow-up questions. If the snapshot does not contain the answer, say so in one sentence.',
    }), 'native aside: prompt section')
    scope.on('system-prompt/assemble', async (_assembly, context, next) => {
      const result = await next()
      context.signal?.throwIfAborted()
      using source = await scope.sessionQuery.observeSession(parent)
      context.signal?.throwIfAborted()
      const text = kind === 'side'
        ? sideUpdate(parent, source.events, agent.session.inheritedEventCount, limits.sideContextBytes)
        : quickQuestionContext(parent, source.events, limits.btwContextBytes)
      if (text) result.contexts.push({ name: 'conversation:main-progress', text, interpolate: false })
      return result
    })
  } })
}

/** Completed main updates since the side conversation opened. */
function sideUpdate(
  parent: SessionId,
  events: Parameters<typeof mainProgressContext>[1],
  inheritedEventCount: number,
  maxBytes: number,
): string {
  const boundary = latestCompletedPrefixBoundary(events)
  return boundary === undefined ? '' : mainProgressContext(parent, events.slice(inheritedEventCount, boundary + 1), maxBytes)
}
