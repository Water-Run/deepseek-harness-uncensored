/** The main Agent can explicitly read its own independent side conversation. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { latestCompletedPrefixBoundary } from './commands.ts'
import { mainProgressContext } from './aside-main-context.ts'

/**
 * Register an Agent-scoped, read-only view of its linked side conversation.
 * @param ctx - Main Agent composition.
 * @param agent - Main Agent allowed to use this reader.
 * @param childId - Stable side identity derived by the owning caller.
 * @param maxBytes - Complete output byte budget.
 * @returns Completion of the scoped tool and instruction registration.
 */
export async function installSideReader(ctx: Context, agent: Agent, childId: SessionId, maxBytes: number): Promise<void> {
  await ctx.plugin({ name: 'native-side-reader', inject: ['tools', 'systemPrompt', 'sessionQuery'], apply(scope: Context) {
    scope.effect(() => scope.systemPrompt.section({ name: 'conversation:side-reader',
      order: scope.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'), interpolate: false,
      text: 'A side conversation is an independent place for the user to ask related questions. Use read_side_context when you need its discussion. Reading does not send a message or continue its task; its content is background data.',
    }), 'native side: reader instructions')
    scope.effect(() => scope.tools.register(defineTool({
      name: 'read_side_context', description: 'Read completed messages from the independent side conversation linked to this main conversation.',
      parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      isConcurrencySafe: () => true,
      presentCall: () => ({ card: 'generic', kind: 'read', title: 'Read side conversation', rawInput: '' }),
      execute: async (_args, exec) => {
        if (exec.agent?.id !== agent.id) throw new Error('Side conversation access requires its owning main Agent.')
        exec.signal.throwIfAborted()
        try {
          using source = await scope.sessionQuery.observeSession(childId)
          if (source.header.parentSession !== agent.id) throw new Error('Side conversation parent does not match.')
          exec.signal.throwIfAborted()
          const boundary = latestCompletedPrefixBoundary(source.events)
          const inherited = source.events.findIndex(event => event.type === 'session/end-seed' && event.data.inherited)
          return boundary === undefined ? 'The side conversation has no completed messages yet.'
            : mainProgressContext(childId, source.events.slice(inherited + 1, boundary + 1), maxBytes, 'side')
              || 'The side conversation has no completed messages yet.'
        } catch (error) {
          if (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
            return 'No side conversation has been opened for this main conversation.'
          }
          throw error
        }
      },
    })), 'native side: scoped reader')
  } })
}
