import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeContext, ConversationNodeDefinition, RequestPromptInspector, TurnErrorNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TurnEndReason } from '@deepseek-ai/dsh-session/types'
import { rejectedSchemaToolName } from '@deepseek-ai/dsh-llm/schema-error'
import { chatNode } from './common.ts'
import { displayFailure } from './event-projection.ts'

declare module '../contract/chat-nodes.ts' {
  interface ChatNodeDataMap {
    /** Terminal turn failure recorded on the turn's end reason. */
    'turn-error': TurnErrorNode
  }
}

type TurnErrorState = Omit<TurnErrorNode, 'kind' | 'step'>

function lastStep(context: ConversationNodeContext<TurnErrorState>): number {
  const location = context.start?.location ?? context.matches[0]?.location
  if (location?.kind !== 'turn' && location?.kind !== 'step') return 0
  return location.turn.steps.at(-1)?.step ?? 0
}

/**
 * Failure shown for a turn ending: a recorded error, a sign-out cancellation,
 * or a turn that restart recovery closed because the DSH process exited mid-turn.
 */
function endFailure(reason: TurnEndReason): { readonly message: string; readonly code?: string; readonly status?: number } | undefined {
  switch (reason.kind) {
    case 'error':
      return reason.error
    case 'aborted':
      // User and parent cancellations show only the stopped turn summary.
      return reason.reason.kind === 'hook' && reason.reason.reason === 'deepseek-account/signed-out'
        ? { message: 'Stopped because you signed out of DeepSeek.', code: 'ACCOUNT_SIGNED_OUT' }
        : undefined
    case 'interrupted':
      return { message: 'The DSH process exited before this turn finished.', code: 'INTERRUPTED' }
    default:
      // Completed, blocked, max-tokens, forked, and plugin-merged endings have no failure row.
      return undefined
  }
}

/**
 * Terminal turn failure Definition. Retries run inside the failing turn, so the
 * turn's `llm/retry` history never suppresses this terminal row; the model-retry
 * node renders that history separately.
 */
export const turnErrorDefinition: ConversationNodeDefinition<TurnErrorState> = {
  kind: 'turn-error',
  target: 'chat',
  match: (event) => {
    return event.type === 'turn/end' && endFailure(event.data.reason) !== undefined
      ? { id: String(event.data.turn), role: 'start' }
      : null
  },
  start: (_context, { event }, reader) => {
    if (event.type !== 'turn/end') throw new Error('turn-error start requires turn/end')
    const failure = endFailure(event.data.reason)
    if (failure === undefined) throw new Error('turn-error start requires a terminal failure')
    const name = rejectedSchemaToolName(failure)
    const mcpTool = name?.startsWith('mcp__') ? name : undefined
    const inHeader = mcpTool !== undefined && reader.previous<ReturnType<RequestPromptInspector>>('request-prompt')
      ?.state.prompt.tools.some(tool => tool.name === mcpTool)
    return {
      seq: event.seq, time: event.time, turn: event.data.turn, ...displayFailure(failure),
      ...(mcpTool === undefined ? {} : { rejectedMcpTool: mcpTool }),
      ...(inHeader ? { rejectedMcpToolInHeader: true } : {}),
    }
  },
  update: context => context.state,
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    const node: TurnErrorNode = { kind: 'turn-error', ...context.state, step: lastStep(context) }
    return chatNode(context, 'turn-error', node.seq, node, { groupTree: 'turn' })
  },
}

/**
 * Register the terminal Turn-error business contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerTurnErrorConversationNode(ctx: Context): void {
  ctx.uiConversation.events.register(turnErrorDefinition)
}
