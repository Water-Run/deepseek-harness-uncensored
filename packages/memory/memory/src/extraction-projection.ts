/** Bounded current-turn evidence and extraction outcome, restored from the Session log. */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from './extraction-types.ts'

const stateSchema = z.object({
  turn: z.number().int().nonnegative(), text: z.string(), throughSeq: z.number().int(),
  lastSavedSeq: z.number().int(), phase: z.enum(['none', 'running', 'completed', 'failed', 'cancelled']),
  saved: z.number().int().nonnegative(), attemptTurn: z.number().int().nonnegative(),
  userLabel: z.string(), attemptLabel: z.string(),
  failure: z.enum(['model', 'invalid-result', 'storage', 'timeout', 'budget']).nullable(),
})

/** Projection value; tool output and reasoning are excluded from extraction evidence. */
export type MemoryExtractionProjection = z.infer<typeof stateSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Current turn's bounded natural-language messages and latest extraction outcome. */
    memoryExtraction: MemoryExtractionProjection
  }
}

/**
 * Retain a UTF-8 suffix without splitting a code point.
 * @param text - Unbounded text.
 * @param bytes - Inclusive UTF-8 bound.
 * @returns The latest complete characters that fit.
 */
export function boundedTail(text: string, bytes: number): string {
  const buffer = Buffer.from(text)
  if (buffer.length <= bytes) return text
  let start = buffer.length - bytes
  while (start < buffer.length && ((buffer[start] ?? 0) & 0xc0) === 0x80) start++
  return buffer.subarray(start).toString('utf8')
}

/**
 * Create the replay fold for memory extraction.
 * @param inputBytes - Deployment bound on retained conversation text.
 * @returns A host-only projection registered before agent creation.
 */
export function extractionProjection(inputBytes: number): ProjectionDefinition<'memoryExtraction'> {
  return {
    key: 'memoryExtraction', stateSchema, stateVersion: 2,
    init: () => ({ turn: 0, text: '', throughSeq: -1, lastSavedSeq: -1, phase: 'none', saved: 0,
      attemptTurn: 0, userLabel: '', attemptLabel: '', failure: null }),
    apply(state, event) {
      if (event.type === 'turn/start') return { ...state, turn: event.data.turn, text: '', userLabel: '', throughSeq: event.seq }
      if (event.type === 'user/message' && event.data.source.kind === 'user') {
        const text = event.data.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
        const label = Array.from(text.replace(/\s+/gu, ' ').trim()).slice(0, 80).join('')
        return { ...state, throughSeq: event.seq, userLabel: state.userLabel || label,
          text: boundedTail(`${state.text}\nUser: ${text}`, inputBytes) }
      }
      if (event.type === 'assistant/message' && event.data.interrupted !== true) {
        const text = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
        if (text === '') return state
        return { ...state, throughSeq: event.seq, text: boundedTail(`${state.text}\nAssistant: ${text}`, inputBytes) }
      }
      if (event.type !== 'memory/extraction') return state
      const value = event.data
      if (value.phase === 'request') return { ...state, phase: 'running', saved: 0, attemptTurn: value.turn,
        attemptLabel: state.userLabel, failure: null }
      return { ...state, phase: value.outcome, attemptTurn: value.turn, attemptLabel: state.userLabel,
        saved: value.saved.length, failure: value.failure ?? null,
        lastSavedSeq: value.outcome === 'completed' ? value.throughSeq : state.lastSavedSeq }
    },
  }
}
