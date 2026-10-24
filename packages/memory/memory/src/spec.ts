/**
 * The memory domain declaration: the durable record schema, the allowed
 * classification values, and the `defineDomain` spec the service opens. The
 * spec is the single source of the domain's identity, version, and record
 * layout, so the durable boundary and the TypeScript surface cannot drift.
 * @module @deepseek-ai/dsh-memory/src/spec
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { MemoryId, MemoryRecord, MemoryType } from './types.ts'

/** Every classification, in declaration order; also the model-facing and wire enum. */
export const MEMORY_TYPES = ['preference', 'project-fact', 'operation-result', 'writing-setting'] as const satisfies readonly MemoryType[]

/** Every provenance kind a save may declare. */
export const MEMORY_SOURCE_KINDS = ['user', 'command', 'assistant', 'import'] as const

/** Branded identity at the durable boundary; branding has no runtime representation. */
const memoryId = z.string().min(1).transform(value => brandString<MemoryId>(value))

const sessionId = z.string().min(1).transform(value => brandString<SessionId>(value))

const memoryType = z.enum(MEMORY_TYPES)

/**
 * Scope at the durable boundary. A global record must name neither axis; a
 * scoped record must name at least one, so "everywhere" is never produced by
 * omission.
 */
const memoryScope = z.object({
  global: z.boolean(),
  workspace: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
}).refine(
  scope => scope.global
    ? scope.workspace === undefined && scope.mode === undefined
    : scope.workspace !== undefined || scope.mode !== undefined,
  { message: 'a global scope names neither axis; a scoped one names at least one' },
)

const memorySource = z.object({
  kind: z.enum(MEMORY_SOURCE_KINDS),
  sessionId: sessionId.optional(),
  messageId: z.string().min(1).optional(),
  confirmed: z.boolean(),
})

/**
 * Durable shape of one record. Timestamps are ISO-8601 strings, `version`
 * counts accepted edits, and `contentHash` is the duplicate-detection digest
 * computed by the service.
 */
export const memoryRecordSchema: z.ZodType<MemoryRecord> = z.object({
  id: memoryId,
  type: memoryType,
  content: z.string().min(1),
  title: z.string().optional(),
  topic: z.string().min(1).optional(),
  scope: memoryScope,
  source: memorySource,
  status: z.enum(['enabled', 'disabled']),
  version: z.number().int().positive(),
  contentHash: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

/** One stored record, inferred from {@link memoryRecordSchema}. */
export type StoredMemoryRecord = z.infer<typeof memoryRecordSchema>

/**
 * The memory domain: one `memories` table in the single-document layout. A
 * whole-document medium is deliberate: an unreadable or unsupported file
 * fails the open loudly, while the per-record layout silently drops a
 * document it cannot parse — data loss this domain must never hide.
 */
export const memoryDomainSpec = defineDomain({
  name: 'memory',
  version: 1,
  tables: { memories: domainTable<MemoryId, MemoryRecord>(memoryRecordSchema) },
})
