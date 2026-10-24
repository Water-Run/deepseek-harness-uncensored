/**
 * Cross-conversation memory: the `ctx.memory` service over the memory storage
 * domain. The per-conversation consumer (retrieval plus the model-facing
 * tools) is the `./agent` subpath, mounted by each agent preset that should
 * read or write memory.
 * @module @deepseek-ai/dsh-memory
 */

export { MemoryService, MemoryService as default } from './service.ts'
export type { Config } from './service.ts'
export {
  MEMORY_SOURCE_KINDS, MEMORY_TYPES, memoryDomainSpec, memoryRecordSchema,
} from './spec.ts'
export type { StoredMemoryRecord } from './spec.ts'
export { MemoryConflictError, MemoryError } from './error.ts'
export type { MemoryErrorCode } from './error.ts'
export {
  PATH_KEY_PREFIX, WORKSPACE_KEY_PREFIX, canonicalDirectory, resolveSessionScope,
} from './scope.ts'
export { normalizeText, tokenize } from './tokenize.ts'
export { retrieveMemories, scopeCovers, searchMemories } from './retrieval.ts'
export type { RetrievalOutcome } from './retrieval.ts'
export type * from './types.ts'
