/** Logged input and outcome of optional memory extraction. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { TokenUsage, UserMessage } from '@deepseek-ai/dsh-llm/types'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type { ReasoningEffortId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MemoryId, MemoryScope } from './types.ts'

/** Identity shared by one extraction request and its result. */
export type MemoryExtractionId = Branded<'MemoryExtractionId'>

/** Deployment bounds and the user's automatic extraction preference. */
export interface MemoryExtractionOptions {
  /** Whether completed turns automatically extract durable facts. */
  enabled: boolean
  /** Maximum UTF-8 bytes of conversation text admitted to one extraction. */
  inputBytes: number
  /** Maximum tokens for the extraction response. */
  maxTokens: number
  /** Maximum proposed facts from one response. */
  maxRecords: number
  /** Maximum elapsed time, including spending admission. */
  timeoutMs: number
}

/** Extraction progress exposed to the owner in memory settings. */
export interface MemoryExtractionStatus {
  sessionId: SessionId
  /** Short label derived from the owning turn's user text. */
  label?: string
  turn: number
  phase: 'running' | 'completed' | 'failed' | 'cancelled'
  saved: number
  /** Safe category for localized recovery guidance. */
  failure?: 'model' | 'invalid-result' | 'storage' | 'timeout' | 'budget'
}

/** Complete model-visible request and the scope its results may enter. */
export interface MemoryExtractionRequest {
  requestId: MemoryExtractionId
  phase: 'request'
  turn: number
  throughSeq: number
  scope: MemoryScope
  provider: string
  model: string
  maxTokens: number
  reasoningEffort?: ReasoningEffortId
  message: UserMessage
}

/** Final outcome; saved records remain valid even when a later write failed. */
export interface MemoryExtractionResult {
  requestId: MemoryExtractionId
  phase: 'result'
  turn: number
  throughSeq: number
  outcome: 'completed' | 'failed' | 'cancelled'
  saved: readonly { id: MemoryId; version: number }[]
  failure?: 'model' | 'invalid-result' | 'storage' | 'timeout' | 'budget'
  usage?: TokenUsage
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Auxiliary model request and saved-memory outcome; does not enter the main conversation surface. */
    'memory/extraction': MemoryExtractionRequest | MemoryExtractionResult
  }
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Instructions and attributed transcript for an auxiliary memory request. */
    'memory-extraction': { kind: 'memory-extraction' } & ContextFormed
  }
}
