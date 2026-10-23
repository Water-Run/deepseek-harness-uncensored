/** Durable native aside identities restore their prompt section during Agent composition. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'

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
 * @returns Completion of the scoped prompt registration.
 */
export async function installAsideContext(ctx: Context, agent: Agent): Promise<void> {
  const parent = agent.session.header.parentSession
  if (parent === undefined) return
  const kind = agent.id === sideIdentity(parent) ? 'side'
    : /^session-btw-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(agent.id) ? 'btw' : undefined
  if (kind === undefined) return
  await ctx.plugin({ name: 'native-aside-context', inject: ['systemPrompt'], apply(scope: Context) {
    scope.effect(() => scope.systemPrompt.section({ name: 'conversation:aside',
      order: scope.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'), interpolate: false,
      text: kind === 'side'
        ? 'This is a side question in a separate conversation. The inherited transcript is background context. Respond to the new question here; do not resume the parent task unless explicitly asked. Messages in this conversation do not enter the parent conversation.'
        : 'This is a fresh, independent quick question. No context from the parent conversation is available. Respond only to the question supplied here.',
    }), 'native aside: prompt section')
  } })
}
