/**
 * Durable cross-conversation memory (`ctx.memory`): the authoritative record
 * set, version-checked management writes, scope-correct retrieval, and the
 * usage limits the model-facing block obeys. Records live in the `memory`
 * storage domain; retrieval reads that table directly on every call, so a
 * disabled or deleted record leaves no stale index behind.
 * @module @deepseek-ai/dsh-memory
 */

import { createHash, randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { MemoryConflictError, MemoryError } from './error.ts'
import { memoryDomainSpec } from './spec.ts'
import type { StoredMemoryRecord } from './spec.ts'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { MemoryExtractionOptions, MemoryExtractionStatus } from './extraction-types.ts'
import { extractionProjection } from './extraction-projection.ts'
import { normalizeText } from './tokenize.ts'
import { retrieveMemories, searchMemories } from './retrieval.ts'
import type { RetrievalOutcome } from './retrieval.ts'
import type {
  MemoryCreateInput,
  MemoryCreateResult,
  MemoryFilter,
  MemoryId,
  MemoryLimits,
  MemoryPatch,
  MemoryRecord,
  MemoryRetrieveRequest,
  MemoryScope,
  MemorySearchRequest,
  MemorySearchResult,
  MemoryStatus,
} from './types.ts'

export { MemoryConflictError, MemoryError } from './error.ts'
export type { MemoryErrorCode } from './error.ts'
export { MEMORY_SOURCE_KINDS, MEMORY_TYPES, memoryDomainSpec, memoryRecordSchema } from './spec.ts'
export type { StoredMemoryRecord } from './spec.ts'
export { normalizeText, tokenize } from './tokenize.ts'
export { retrieveMemories, scopeCovers, searchMemories } from './retrieval.ts'
export type { RetrievalOutcome } from './retrieval.ts'
export {
  PATH_KEY_PREFIX, WORKSPACE_KEY_PREFIX, canonicalDirectory, resolveSessionScope,
} from './scope.ts'
export type * from './types.ts'

/** Default maximum records one request may inject. */
const DEFAULT_MAX_ENTRIES = 6
/** Default maximum characters one injected record may occupy. */
const DEFAULT_MAX_ENTRY_CHARS = 800
/** Default maximum UTF-8 bytes the complete injected block may occupy. */
const DEFAULT_MAX_CONTEXT_BYTES = 4096
/** Default minimum matched share of the query's token weight. */
const DEFAULT_MIN_RELEVANCE = 0.2
/** Default maximum characters one stored record may contain. */
const DEFAULT_MAX_CONTENT_CHARS = 4000

/** Retrieval and storage bounds. Every field is deployed through cordis.yml. */
export interface Config {
  /** Automatically extract durable facts at successful turn completion; defaults to false. */
  autoExtract?: boolean
  /** Inclusive UTF-8 bound on extraction transcript text; defaults to 24000. */
  extractionInputBytes?: number
  /** Output token cap for extraction; defaults to 2048. */
  extractionMaxTokens?: number
  /** Maximum facts saved from one extraction; defaults to 4. */
  extractionMaxRecords?: number
  /** Timeout including quota admission; defaults to 45000 milliseconds. */
  extractionTimeoutMs?: number
  /** Maximum records one request may inject; further relevant records are reported as omitted. */
  maxEntries?: number
  /** Maximum characters one injected record may occupy; longer content is ellipsized. */
  maxEntryChars?: number
  /** Maximum UTF-8 bytes the complete injected block may occupy. */
  maxContextBytes?: number
  /** Minimum share of query token weight a record must match, in `(0, 1]`. */
  minRelevance?: number
  /** Maximum characters one stored record may contain; longer input is rejected. */
  maxContentChars?: number
}

/** Config after defaults are applied. */
type ResolvedConfig = Required<Omit<Config, 'autoExtract'>> & { autoExtract: Volatile<boolean> }

/** Loader-resolved configuration retains the live preference cell. */
function isResolvedConfig(value: Config | ResolvedConfig): value is ResolvedConfig {
  return typeof value.autoExtract === 'object'
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable cross-conversation memory. */
    memory: MemoryService
  }
}

/**
 * Canonicalize one declared scope, rejecting the two invalid shapes: a global
 * record that also names an axis, and a scoped record that names none.
 * @param scope - caller-declared scope.
 * @returns the scope with exactly the fields it uses.
 * @throws {MemoryError} `invalid` for either invalid shape.
 */
function scopeOf(scope: MemoryScope): MemoryScope {
  if (scope.global) {
    if (scope.workspace !== undefined || scope.mode !== undefined) {
      throw new MemoryError('invalid', 'a global memory names neither a workspace nor a mode')
    }
    return { global: true }
  }
  if (scope.workspace === undefined && scope.mode === undefined) {
    throw new MemoryError('invalid', 'a scoped memory names a workspace, a mode, or both')
  }
  return {
    global: false,
    ...scope.workspace === undefined ? {} : { workspace: scope.workspace },
    ...scope.mode === undefined ? {} : { mode: scope.mode },
  }
}

/**
 * Validate one optional label field.
 * @param value - caller-supplied title or topic.
 * @param field - field name for the diagnostic.
 * @returns the trimmed value, or undefined when unset.
 */
function labelOf(value: string | undefined, field: 'title' | 'topic'): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') throw new MemoryError('invalid', `a memory ${field} must not be blank`)
  return trimmed
}

/**
 * Stable digest of normalized content, used for duplicate detection.
 * @param content - stored text.
 * @returns the hex digest.
 */
function contentHashOf(content: string): string {
  return createHash('sha256').update(normalizeText(content)).digest('hex')
}

/**
 * Whether two scopes name the same target.
 * @param left - one scope.
 * @param right - the other scope.
 * @returns true when every field agrees.
 */
function sameScope(left: MemoryScope, right: MemoryScope): boolean {
  return left.global === right.global
    && left.workspace === right.workspace
    && left.mode === right.mode
}

/**
 * Whether one record satisfies a management filter.
 * @param filter - exact filters; omitted fields match everything.
 * @param record - candidate record.
 * @returns true when the record matches.
 */
function matchesFilter(filter: MemoryFilter, record: MemoryRecord): boolean {
  const scope = filter.scope
  if (scope !== undefined) {
    if ('global' in scope) {
      if (!record.scope.global) return false
    } else if ('workspace' in scope) {
      if (record.scope.workspace !== scope.workspace) return false
    } else if (record.scope.mode !== scope.mode) {
      return false
    }
  }
  if (filter.type !== undefined && record.type !== filter.type) return false
  if (filter.status !== undefined && record.status !== filter.status) return false
  if (filter.text !== undefined && filter.text.trim() !== '') {
    const haystack = normalizeText(`${record.title ?? ''}\n${record.content}`)
    if (!haystack.includes(normalizeText(filter.text))) return false
  }
  return true
}

/**
 * Durable memory records over the storage domain. Reads are synchronous from
 * the domain's authoritative table; every write is version-checked and lands
 * durably before it becomes visible.
 */
export class MemoryService extends Service {
  static inject = ['storageDomain']

  static Config: z<Config, ResolvedConfig> = z.object({
    autoExtract: z.boolean().default(false).volatile(),
    extractionInputBytes: z.natural().min(1024).max(1000000).default(24000),
    extractionMaxTokens: z.natural().min(128).max(16000).default(2048),
    extractionMaxRecords: z.natural().min(1).max(20).default(4),
    extractionTimeoutMs: z.natural().min(1000).max(300000).default(45000),
    maxEntries: z.natural().min(1).default(DEFAULT_MAX_ENTRIES),
    maxEntryChars: z.natural().min(1).default(DEFAULT_MAX_ENTRY_CHARS),
    maxContextBytes: z.natural().min(256).default(DEFAULT_MAX_CONTEXT_BYTES),
    minRelevance: z.number().min(0).max(1).default(DEFAULT_MIN_RELEVANCE),
    maxContentChars: z.natural().min(1).default(DEFAULT_MAX_CONTENT_CHARS),
  })

  private readonly config: ResolvedConfig
  private readonly namespace: string | undefined
  private readonly extractions = new Set<{ abort: AbortController; done: Promise<unknown> }>()
  private readonly extractors = new Map<SessionId, { retry: () => Promise<void>; status: () => MemoryExtractionStatus | undefined }>()
  private closing = false
  private table?: KvTable<MemoryId, MemoryRecord>
  /** Serializes create's duplicate check with its write. */
  private createTail: Promise<void> = Promise.resolve()
  /** Last stamp handed to a write; keeps two writes in one millisecond ordered. */
  private lastStamp = 0

  /**
   * @param ctx - owning Host context with the storage hub.
   * @param config - retrieval and storage bounds.
   */
  constructor(ctx: Context, config: Config | ResolvedConfig = {}) {
    super(ctx, 'memory')
    this.config = isResolvedConfig(config) ? config : MemoryService.Config(config)
    this.namespace = ctx.fiber.entry?.options.id
  }

  /** Open the memory domain; an unreadable or unsupported medium fails the plugin loudly. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.openDomain()
    this.ctx.effect(() => () => domain.close(), 'memory.domainClose')
    this.table = domain.table('memories')
    this.ctx.inject(['sessionProjections'], (inner) => {
      inner.effect(() => inner.sessionProjections.register(extractionProjection(this.config.extractionInputBytes)), 'memory.extractionProjection')
    })
    this.ctx.on('loader/volatile-update', () => {
      if (!this.extractionOptions().enabled) this.cancelExtractions()
    })
    this.ctx.effect(() => async () => {
      this.closing = true
      this.cancelExtractions()
      await Promise.allSettled([...this.extractions].map(work => work.done))
      this.extractors.clear()
    }, 'memory.extractions')
  }

  /**
   * Read the live preference and fixed extraction bounds.
   * @returns Current extraction options.
   */
  extractionOptions(): MemoryExtractionOptions {
    const value = this.config
    return { enabled: value.autoExtract.get(), inputBytes: value.extractionInputBytes, maxTokens: value.extractionMaxTokens,
      maxRecords: value.extractionMaxRecords, timeoutMs: value.extractionTimeoutMs }
  }

  /**
   * Identify the Loader entry that owns these preferences.
   * @returns Its namespace, or undefined for an unconfigured service.
   */
  settingsNamespace(): string | undefined { return this.namespace }

  /** Cancel outstanding extraction requests without changing saved records. */
  cancelExtractions(): void { for (const work of this.extractions) work.abort.abort() }

  /**
   * Own cancellable auxiliary work until it finishes logging and saving.
   * @param signal - Agent turn or maintenance cancellation.
   * @param operation - Bounded extraction operation.
   * @returns The operation's completion.
   */
  async runExtraction(signal: AbortSignal, operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.closing) throw new Error('Memory service is closing')
    const abort = new AbortController()
    const combined = AbortSignal.any([signal, abort.signal])
    const done = Promise.resolve().then(() => { combined.throwIfAborted(); return operation(combined) })
    const work = { abort, done }
    this.extractions.add(work)
    try { await done } finally { this.extractions.delete(work) }
  }

  /**
   * Bind one live agent's retry and status controls.
   * @param id - Owning session.
   * @param binding - Agent-scoped callbacks, released before the agent is detached.
   * @returns Registration disposer; a stale disposer cannot remove a replacement.
   */
  registerExtractor(id: SessionId, binding: { retry: () => Promise<void>; status: () => MemoryExtractionStatus | undefined }): () => void {
    this.extractors.set(id, binding)
    return () => { if (this.extractors.get(id) === binding) this.extractors.delete(id) }
  }

  /**
   * Inspect attempts in currently attached conversations.
   * @returns Each live conversation's latest extraction outcome.
   */
  extractionStatuses(): MemoryExtractionStatus[] {
    return [...this.extractors.values()].flatMap((binding) => { const value = binding.status(); return value === undefined ? [] : [value] })
  }

  /**
   * Retry the retained turn of a live, idle conversation.
   * @param id - Session whose failed extraction should run again.
   * @returns Completion after its outcome is logged.
   */
  async retryExtraction(id: SessionId): Promise<void> {
    const binding = this.extractors.get(id)
    if (binding === undefined) throw new MemoryError('not-found', 'Open the source conversation before retrying memory extraction')
    await binding.retry()
  }

  /**
   * Read the retrieval and storage bounds this deployment runs.
   * @returns Current limits for the management interface.
   */
  limits(): MemoryLimits {
    return {
      maxEntries: this.config.maxEntries,
      maxEntryChars: this.config.maxEntryChars,
      maxContextBytes: this.config.maxContextBytes,
      minRelevance: this.config.minRelevance,
      maxContentChars: this.config.maxContentChars,
    }
  }

  /**
   * Every stored record, in no particular order.
   * @returns the authoritative record set.
   */
  records(): MemoryRecord[] {
    return [...this.requireTable().entries()].map(([, record]) => record)
  }

  /**
   * Management list with an exact filter.
   * @param filter - scope, type, status, and text filters.
   * @returns matching records, most recently updated first.
   */
  list(filter: MemoryFilter = {}): MemoryRecord[] {
    return this.records()
      .filter(record => matchesFilter(filter, record))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
  }

  /**
   * Read one record.
   * @param id - record identity.
   * @returns the record, or undefined when absent.
   */
  get(id: MemoryId): MemoryRecord | undefined {
    return this.requireTable().get(id)
  }

  /**
   * Save one record. An enabled record with the same scope, type, and
   * normalized content is returned unchanged instead of duplicated.
   * @param input - classification, text, scope, and provenance.
   * @param options - Cancellation and whether automatic extraction must preserve identical disabled records.
   * @returns the stored record and whether an identical one already existed.
   * @throws {MemoryError} `invalid` when the text or scope violates a rule.
   */
  async create(input: MemoryCreateInput, options: { signal?: AbortSignal; preserveDisabled?: boolean } = {}): Promise<MemoryCreateResult> {
    const content = input.content.trim()
    this.assertContent(content)
    const scope = scopeOf(input.scope)
    const title = labelOf(input.title, 'title')
    const topic = labelOf(input.topic, 'topic')
    const contentHash = contentHashOf(content)
    const operation = this.createTail.then(async () => {
      options.signal?.throwIfAborted()
      const existing = this.records().find(record =>
        (record.status === 'enabled' || options.preserveDisabled === true)
        && record.type === input.type
        && record.contentHash === contentHash
        && sameScope(record.scope, scope))
      if (existing !== undefined) return { record: existing, deduplicated: true }
      const now = this.now()
      const record: MemoryRecord = {
        id: brandString<MemoryId>(randomUUID()),
        type: input.type,
        content,
        ...title === undefined ? {} : { title },
        ...topic === undefined ? {} : { topic },
        scope,
        source: input.source,
        status: 'enabled',
        version: 1,
        contentHash,
        createdAt: now,
        updatedAt: now,
      }
      await this.requireTable().put(record.id, record)
      return { record, deduplicated: false }
    })
    this.createTail = operation.then(() => {}, () => {})
    return operation
  }

  /**
   * Replace editable fields under a version check. Clearing `title` or
   * `topic` with an empty string removes it.
   * @param id - record identity.
   * @param patch - fields to replace; omitted fields keep their value.
   * @param expectedVersion - the revision the caller read; a stale value rejects with `conflict`.
   * @returns the stored record at its new revision.
   * @throws {MemoryConflictError} when another write already advanced the version.
   */
  async update(id: MemoryId, patch: MemoryPatch, expectedVersion: number): Promise<MemoryRecord> {
    const nextContent = patch.content === undefined ? undefined : patch.content.trim()
    if (nextContent !== undefined) this.assertContent(nextContent)
    const scope = patch.scope === undefined ? undefined : scopeOf(patch.scope)
    const title = patch.title?.trim()
    const topic = patch.topic?.trim()
    const table = this.requireTable()
    const current = table.get(id)
    if (current === undefined) throw new MemoryError('not-found', `memory '${id}' does not exist`)
    if (current.version !== expectedVersion) {
      throw new MemoryConflictError(id, expectedVersion, current.version)
    }
    return table.update(id, (stored) => {
      if (stored.version !== expectedVersion) {
        throw new MemoryConflictError(id, expectedVersion, stored.version)
      }
      const content = nextContent ?? stored.content
      const nextTitle = patch.title === undefined ? stored.title : title === '' ? undefined : title
      const nextTopic = patch.topic === undefined ? stored.topic : topic === '' ? undefined : topic
      return {
        id: stored.id,
        type: patch.type ?? stored.type,
        content,
        ...nextTitle === undefined ? {} : { title: nextTitle },
        ...nextTopic === undefined ? {} : { topic: nextTopic },
        scope: scope ?? stored.scope,
        source: stored.source,
        status: stored.status,
        version: stored.version + 1,
        contentHash: contentHashOf(content),
        createdAt: stored.createdAt,
        updatedAt: this.now(),
      }
    })
  }

  /**
   * Enable or disable retrieval of one record under a version check.
   * @param id - record identity.
   * @param status - target status.
   * @param expectedVersion - the revision the caller read.
   * @returns the stored record at its new revision.
   * @throws {MemoryConflictError} when another write already advanced the version.
   */
  setStatus(id: MemoryId, status: MemoryStatus, expectedVersion: number): Promise<MemoryRecord> {
    const table = this.requireTable()
    const current = table.get(id)
    if (current === undefined) throw new MemoryError('not-found', `memory '${id}' does not exist`)
    if (current.version !== expectedVersion) {
      throw new MemoryConflictError(id, expectedVersion, current.version)
    }
    return table.update(id, (stored) => {
      if (stored.version !== expectedVersion) {
        throw new MemoryConflictError(id, expectedVersion, stored.version)
      }
      return {
        ...stored,
        status,
        version: stored.version + 1,
        updatedAt: this.now(),
      }
    })
  }

  /**
   * Delete one record permanently.
   * @param id - record identity.
   * @returns true when a record was deleted, false when it was already absent.
   */
  remove(id: MemoryId): Promise<boolean> {
    return this.requireTable().delete(id)
  }

  /**
   * Select the records one conversation request may inject.
   * @param request - incoming text, conversation scope, and already-used records.
   * @returns the bounded selection and its model-facing text.
   */
  retrieve(request: MemoryRetrieveRequest): RetrievalOutcome {
    return retrieveMemories(this.records(), request, this.limits(), Date.now())
  }

  /**
   * Rank records for a management search.
   * @param request - free text plus optional conversation scope.
   * @returns matching records, best first.
   */
  search(request: MemorySearchRequest): MemorySearchResult {
    return searchMemories(this.records(), request, request.limit ?? this.config.maxEntries, Date.now())
  }

  /** Open the domain, translating every durable-format failure into one actionable report. */
  private async openDomain(): Promise<Domain<typeof memoryDomainSpec>> {
    try {
      return await this.ctx.storageDomain.open(memoryDomainSpec)
    } catch (error) {
      throw new MemoryError(
        'storage-unavailable',
        'memory storage could not be opened; the existing data was left untouched. '
        + 'Inspect the reported cause before retrying, and do not delete the storage file.',
        { cause: error },
      )
    }
  }

  /**
   * Strictly increasing ISO-8601 instant, so two writes in the same
   * millisecond still order by `updatedAt` and a conflict has one winner.
   * @returns the stamp for this write.
   */
  private now(): string {
    this.lastStamp = Math.max(Date.now(), this.lastStamp + 1)
    return new Date(this.lastStamp).toISOString()
  }

  /** Resolve the table once the domain is open; a call before init is a wiring bug. */
  private requireTable(): KvTable<MemoryId, MemoryRecord> {
    if (this.table === undefined) {
      throw new MemoryError('storage-unavailable', 'memory storage has not been opened yet')
    }
    return this.table
  }

  /** Reject text the deployment does not store as one record. */
  private assertContent(content: string): void {
    if (content === '') throw new MemoryError('invalid', 'a memory must not be empty')
    const characters = Array.from(content).length
    if (characters > this.config.maxContentChars) {
      throw new MemoryError(
        'invalid',
        `a memory may contain at most ${String(this.config.maxContentChars)} characters `
        + `(received ${String(characters)}); split it into separate records`,
      )
    }
  }
}

/** Stored record shape re-exported for providers and tests that persist through this service. */
export type PersistedMemoryRecord = StoredMemoryRecord

export default MemoryService
