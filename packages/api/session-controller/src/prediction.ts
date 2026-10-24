/** Composer next-phrase prediction. The suggestion is not sent and does not enter the conversation surface. */
import { randomUUID } from 'node:crypto'
import { boundContextSummary, createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { ContextFormed, GenerateOptions, ReasoningEffortId, StreamChunk, TokenUsage, UserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { latestCompletedPrefixBoundary } from './commands.ts'
import { mainProgressContext } from './aside-main-context.ts'
import { nativeAsideKind } from './aside-context.ts'

/** Where the user is typing. */
export type PredictionSurface = 'main' | 'side' | 'btw'
/** Correlation identity of one background prediction request. */
export type PredictionRequestId = Branded<'PredictionRequestId'>

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Background completion instructions, not text submitted by the user. */
    'input-prediction': { kind: 'input-prediction' } & ContextFormed
  }
}

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
      /** Correlates a request and result across windows whose client revisions may overlap. */
      readonly requestId?: PredictionRequestId
      /** Exact provider route and model-visible input; absent in older prediction records. */
      readonly request?: {
        readonly provider: string
        readonly model: string
        readonly reasoningEffort?: ReasoningEffortId
        readonly maxTokens: number
        readonly message: UserMessage
      }
      readonly outcome?: 'completed' | 'cancelled' | 'failed'
      /** Provider-reported counters, when available; failed or cancelled calls may be incomplete. */
      readonly usage?: TokenUsage
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
  if (/^\/btw(?:\s|$)/u.test(draft.trimStart())) return 'btw'
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
      return 'Suggest the next short user message, or complete the existing draft. Return only a single-line suffix, preserving any leading space needed to join the draft. Do not answer the draft, repeat it, add a command prefix, or use Markdown.'
    case 'side':
      return 'Suggest a short side question about the completed main conversation, or complete the existing draft. Return only a single-line suffix, preserving any leading space needed to join the draft. Do not answer, repeat the draft, or add a command prefix.'
    case 'btw':
      return 'Suggest a short independent question, in the spirit of “进度如何”, or complete the existing question. Return only a single-line suffix, preserving any leading space needed to join the draft. Do not answer, continue the main task, repeat the draft, or add /btw.'
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
 * @param maxBytes - Deployment bound for the logged context.
 * @returns Exact context logged with the request.
 */
export function predictionContext(
  surface: PredictionSurface,
  events: readonly SessionEvent[],
  parentId: SessionId,
  status: string,
  maxBytes: number,
): string {
  if (surface === 'btw') return `Interaction status: ${status}`
  return mainProgressContext(parentId, events, maxBytes)
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
  readonly maxTokens: number
  readonly maxSuggestionBytes: number
  readonly reasoningEffort?: ReasoningEffortId
  readonly stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>
}): Promise<string> {
  input.signal.throwIfAborted()
  const instruction = predictionInstruction(input.surface)
  const prompt = `${instruction}\n\nBackground:\n${input.context}\n\nDraft:\n${input.draft}`
  const message = createUserMessage({
    content: [{ type: 'text', text: prompt }],
    source: { kind: 'input-prediction', form: 'notice', summary: boundContextSummary('Composer input suggestion') },
  })
  const record = {
    surface: input.surface, phase: 'request', revision: input.revision, draft: input.draft,
    instruction, context: input.context, suggestion: '',
    requestId: brandString<PredictionRequestId>(randomUUID()),
  } as const
  const request = { provider: input.provider, model: input.model, maxTokens: input.maxTokens, message,
    ...input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort } }
  input.session.append('input/prediction', { ...record, request })
  let suggestion = ''
  let usage: TokenUsage | undefined
  let outcome: 'completed' | 'cancelled' | 'failed' = 'failed'
  try {
    let finished = false
    for await (const chunk of input.stream({
      provider: input.provider,
      model: input.model,
      messages: [message],
      maxTokens: input.maxTokens,
      ...input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort },
      sessionId: input.session.id,
      signal: input.signal,
    })) {
      input.signal.throwIfAborted()
      if (chunk.type === 'text-delta') suggestion += chunk.text
      if (chunk.type === 'usage') usage = chunk.usage
      if (Buffer.byteLength(suggestion, 'utf8') > input.maxSuggestionBytes) throw new LlmError('Input suggestion exceeded its size limit.', 'PREDICTION_OUTPUT_LIMIT')
      if (chunk.type === 'finish') {
        if (chunk.reason.kind !== 'stop') throw new LlmError('Input suggestion did not finish successfully.', 'PREDICTION_INCOMPLETE')
        finished = true
      }
    }
    input.signal.throwIfAborted()
    if (!finished) throw new LlmError('Input suggestion ended without a completion record.', 'PREDICTION_INCOMPLETE')
    suggestion = suggestion.split(/\r?\n/u)[0]?.trimEnd() ?? ''
    if (input.draft === '') suggestion = suggestion.trimStart()
    outcome = 'completed'
    return suggestion
  } catch (error) {
    suggestion = ''
    outcome = input.signal.aborted ? 'cancelled' : 'failed'
    throw error
  } finally {
    input.session.append('input/prediction', { ...record, phase: 'result', suggestion, outcome, ...usage === undefined ? {} : { usage } })
  }
}

/** Session-addressed background requests cancelled and drained before deletion or controller unload. */
export class PredictionRequests {
  private readonly requests = new Map<SessionId, Map<AbortController, Promise<unknown>>>()
  private readonly stopping = new Set<SessionId>()
  private closed = false

  /**
   * Retain background work until its cancellation and logging settle.
   * @param id - Owning Session.
   * @param signal - Client cancellation.
   * @param operation - Cancellable model work.
   * @returns The operation's result or failure.
   */
  run<T>(id: SessionId, signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closed || this.stopping.has(id)) return Promise.reject(new DOMException('Prediction service is stopping.', 'AbortError'))
    const abort = new AbortController()
    const owned = this.requests.get(id) ?? new Map<AbortController, Promise<unknown>>()
    this.requests.set(id, owned)
    const combined = AbortSignal.any([signal, abort.signal])
    const task = Promise.resolve().then(() => { combined.throwIfAborted(); return operation(combined) }).finally(() => {
      owned.delete(abort)
      if (owned.size === 0 && this.requests.get(id) === owned) this.requests.delete(id)
    })
    owned.set(abort, task)
    return task
  }

  /**
   * Cancel and drain a Session's predictions before removing its writer.
   * @param id - Session being stopped, archived or deleted.
   * @returns After its requests finish logging.
   */
  async stop(id: SessionId): Promise<void> {
    const owned = this.requests.get(id)
    if (owned === undefined) return
    this.stopping.add(id)
    try {
      for (const abort of owned.keys()) abort.abort()
      await Promise.allSettled(owned.values())
    } finally { this.stopping.delete(id) }
  }

  /** Reject new work and drain every outstanding request. */
  async close(): Promise<void> {
    this.closed = true
    await Promise.all([...this.requests.keys()].map(id => this.stop(id)))
  }
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
