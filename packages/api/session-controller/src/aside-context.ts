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

/**
 * Derive the persistent side conversation associated with a main session.
 * @param parent - Owning main session.
 * @returns Its stable side-question identity.
 */
export function sideIdentity(parent: SessionId): SessionId {
  return brandString<SessionId>(`session-side-${createHash('sha256').update(parent).digest('hex')}`)
}

/**
 * Restore native aside instructions without adding a synthetic user message or waking the Agent.
 * The normal system-prompt admission records the instructions before any model sees them.
 * @param ctx - New or resumed Agent scope.
 * @param agent - Session whose durable identity selects the aside semantics.
 * @param maxMainContextBytes - Complete byte limit for newly completed main-conversation updates.
 * @returns Completion of the scoped prompt registration.
 */
export async function installAsideContext(ctx: Context, agent: Agent, maxMainContextBytes: number): Promise<void> {
  const parent = agent.session.header.parentSession
  if (parent === undefined) return
  const kind = agent.id === sideIdentity(parent) ? 'side'
    : /^session-btw-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(agent.id) ? 'btw' : undefined
  if (kind === undefined) return
  await ctx.plugin({ name: 'native-aside-context', inject: ['systemPrompt', 'sessionQuery'], apply(scope: Context) {
    scope.effect(() => scope.systemPrompt.section({ name: 'conversation:aside',
      order: scope.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'), interpolate: false,
      text: kind === 'side'
        ? 'This is a side question in a separate conversation. The inherited transcript is background context. Respond to the new question here; do not resume the parent task unless explicitly asked. Messages in this conversation do not enter the parent conversation.'
        : 'This is a fresh, independent quick question. No context from the parent conversation is available. Answer the supplied question directly once, without asking follow-up questions or continuing the parent task.',
    }), 'native aside: prompt section')
    if (kind === 'side') {
      scope.on('system-prompt/assemble', async (_assembly, context, next) => {
        const result = await next()
        context.signal?.throwIfAborted()
        using source = await scope.sessionQuery.observeSession(parent)
        context.signal?.throwIfAborted()
        const boundary = latestCompletedPrefixBoundary(source.events)
        const text = boundary === undefined ? '' : mainProgressContext(parent, source.events.slice(agent.session.inheritedEventCount, boundary + 1), maxMainContextBytes)
        if (text) result.contexts.push({ name: 'conversation:main-progress', text, interpolate: false })
        return result
      })
    }
  } })
}
