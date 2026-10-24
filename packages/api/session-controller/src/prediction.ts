/** Composer next-phrase prediction. The suggestion is not sent and does not enter the conversation surface. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { latestCompletedPrefixBoundary } from './commands.ts'
import { mainProgressContext } from './aside-main-context.ts'
import { nativeAsideKind } from './aside-context.ts'

/** Where the user is typing. */
export type PredictionSurface = 'main' | 'side' | 'btw'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Log-only record of one composer prediction. Losing it does not change the conversation.
     * `request` is written before the model call and `result` after it returns or is cancelled.
     */
    'input/prediction': {
      readonly surface: PredictionSurface
      readonly phase: 'request' | 'result'
      readonly revision: number
      readonly draft: string
      readonly instruction: string
      readonly context: string
      readonly suggestion: string
    }
  }
}

/**
 * Choose the prediction scene from the draft and the session identity.
 * A `/btw` draft stays a short question even when typed in the main composer.
 * @param sessionId - Composer session.
 * @param parentId - Recorded parent, when this session is an aside.
 * @param draft - Unsent composer text.
 * @returns The scene whose instruction and context rules apply.
 */
export function predictionSurface(sessionId: SessionId, parentId: SessionId | undefined, draft: string): PredictionSurface {
  if (draft.trimStart().startsWith('/btw')) return 'btw'
  return nativeAsideKind(sessionId, parentId) ?? 'main'
}

/**
 * Instruction shown to the prediction model. It asks only for the unsent suffix.
 * @param surface - Composer scene.
 * @returns The exact instruction logged with the request.
 */
export function predictionInstruction(surface: PredictionSurface): string {
  switch (surface) {
    case 'main':
      return 'Predict only the next words the user is about to type in the main composer. Return the completion suffix and nothing else.'
    case 'side':
      return 'Predict only the next words of a side question about the completed main conversation. Return the completion suffix and nothing else.'
    case 'btw':
      return 'Predict a short independent question, in the spirit of “进度如何”. Do not continue the main task. Return the completion suffix and nothing else.'
    default: {
      const unreachable: never = surface
      return unreachable
    }
  }
}

/**
 * Bound the background text a prediction may see.
 * Side questions use the same completed-turn tail as a side answer. A by-the-way question sees only status.
 * @param surface - Composer scene.
 * @param events - Completed events only.
 * @param parentId - Main conversation, for a side question.
 * @param status - Live agent status. By-the-way prediction may see it; the answer still starts from a fresh context.
 * @returns Exact context logged with the request.
 */
export function predictionContext(
  surface: PredictionSurface,
  events: readonly SessionEvent[],
  parentId: SessionId,
  status: string,
): string {
  if (surface === 'btw') return `Interaction status: ${status}`
  return mainProgressContext(parentId, events, 8192)
}

/**
 * Ask the current model for a suffix and log the exact request before dispatch.
 * A cancelled call logs an empty suggestion and must not be shown over newer input.
 * @param input - Scene, draft, revision, route, and the session that owns the log.
 * @returns The suggestion for this revision. The caller drops it when the revision moved.
 */
export async function requestPrediction(input: {
  readonly session: Session
  readonly surface: PredictionSurface
  readonly draft: string
  readonly revision: number
  readonly context: string
  readonly provider: string
  readonly model: string
  readonly signal: AbortSignal
  readonly stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>
}): Promise<string> {
  const instruction = predictionInstruction(input.surface)
  const prompt = `${instruction}\n\nBackground:\n${input.context}\n\nDraft:\n${input.draft}`
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: prompt }],
    source: { kind: 'user' },
  })]
  input.session.append('input/prediction', {
    surface: input.surface, phase: 'request', revision: input.revision, draft: input.draft,
    instruction, context: input.context, suggestion: '',
  })
  input.signal.throwIfAborted()
  let suggestion = ''
  try {
    for await (const chunk of input.stream({
      provider: input.provider,
      model: input.model,
      messages,
      maxTokens: 32,
      sessionId: input.session.id,
      signal: input.signal,
    })) {
      input.signal.throwIfAborted()
      if (chunk.type === 'text-delta') suggestion += chunk.text
    }
  } catch (error) {
    if (!input.signal.aborted) throw error
    suggestion = ''
  }
  input.session.append('input/prediction', {
    surface: input.surface, phase: 'result', revision: input.revision, draft: input.draft,
    instruction, context: input.context, suggestion: input.signal.aborted ? '' : suggestion.trim(),
  })
  return input.signal.aborted ? '' : suggestion.trim()
}

/**
 * Completed events up to the last finished turn.
 * @param events - Full session log.
 * @returns Events a side or main prediction may read. The active turn is excluded.
 */
export function completedPredictionEvents(events: readonly SessionEvent[]): readonly SessionEvent[] {
  const boundary = latestCompletedPrefixBoundary(events)
  return boundary === undefined ? [] : events.slice(0, boundary + 1)
}
