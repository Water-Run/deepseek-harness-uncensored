/**
 * Public vocabulary of the cross-conversation memory domain: record identity,
 * user-facing classification, scope, source, and the retrieval result the
 * model-facing context is rendered from. Types only — the runtime lives in
 * `spec.ts`, `service.ts`, and `agent.ts`.
 * @module @deepseek-ai/dsh-memory/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable identity of one memory record (a generated uuid, never reused). */
export type MemoryId = Branded<'MemoryId'>

/**
 * What a record states. The four classes are the product's minimum
 * distinction: personal working preferences, durable facts about a project,
 * conclusions an operation produced, and fiction-craft settings. The type is
 * presentation and retrieval metadata; it never widens a record's scope.
 */
export type MemoryType = 'preference' | 'project-fact' | 'operation-result' | 'writing-setting'

/** Whether retrieval may return the record. */
export type MemoryStatus = 'enabled' | 'disabled'

/**
 * Where a record applies. A `global` record is deliberately shared across
 * every workspace and mode; a scoped record names at least one of the two
 * axes it is limited to. `workspace` reuses the registry's identity:
 * `workspace:<WorkspaceId>` when a registered Workspace owns the session's
 * project directory, otherwise `path:<canonical directory>`. `mode` is the
 * agent preset id the session runs.
 */
export interface MemoryScope {
  /** Shared across every workspace and mode; requires both other fields absent. */
  readonly global: boolean
  /** Workspace key; absent means every workspace. */
  readonly workspace?: string | undefined
  /** Agent preset id; absent means every mode. */
  readonly mode?: string | undefined
}

/** Who produced a record and whether the user confirmed it. */
export interface MemorySource {
  /** `user` is the settings page, `command` a slash command, `assistant` a model tool call, `import` a file. */
  readonly kind: 'user' | 'command' | 'assistant' | 'import'
  /** Session the record was saved from, when one owned the save. */
  readonly sessionId?: SessionId | undefined
  /** Message the record was saved from, when the save named one. */
  readonly messageId?: string | undefined
  /** True only when the user explicitly confirmed the exact stored text. */
  readonly confirmed: boolean
}

/** One durable record; every field is JSON so the domain can store it verbatim. */
export interface MemoryRecord {
  /** Stable identity. */
  readonly id: MemoryId
  /** Classification. */
  readonly type: MemoryType
  /** The stored fact, preference, conclusion, or setting. */
  readonly content: string
  /** Optional short label shown by management surfaces. */
  readonly title?: string | undefined
  /** Optional conflict-grouping key: two records of one type, one scope, and one topic must agree. */
  readonly topic?: string | undefined
  /** Where the record applies. */
  readonly scope: MemoryScope
  /** Where the record came from. */
  readonly source: MemorySource
  /** Whether retrieval may return it. */
  readonly status: MemoryStatus
  /** Revision; every accepted edit increments it. */
  readonly version: number
  /** Normalized-content digest used for duplicate detection. */
  readonly contentHash: string
  /** ISO-8601 creation instant. */
  readonly createdAt: string
  /** ISO-8601 instant of the last accepted edit (creation counts as one). */
  readonly updatedAt: string
}

/** Caller-supplied facts for a new record; identity, revision, and timestamps are owned by the service. */
export interface MemoryCreateInput {
  /** Classification. */
  readonly type: MemoryType
  /** The text to store; bounded by the configured content limit. */
  readonly content: string
  /** Optional short label. */
  readonly title?: string | undefined
  /** Optional conflict-grouping key. */
  readonly topic?: string | undefined
  /** Target scope; the caller decides, and `global` is never implied. */
  readonly scope: MemoryScope
  /** Provenance. */
  readonly source: MemorySource
}

/** Editable fields of an existing record. Omitted fields keep their current value. */
export interface MemoryPatch {
  /** New classification. */
  readonly type?: MemoryType
  /** Replacement text. */
  readonly content?: string
  /** Replacement label; an empty string removes it. */
  readonly title?: string | undefined
  /** Replacement conflict key; an empty string removes it. */
  readonly topic?: string | undefined
  /** Replacement scope. */
  readonly scope?: MemoryScope
}

/** Result of an idempotent create: whether an identical scoped record already existed. */
export interface MemoryCreateResult {
  /** The stored record (fresh, or the identical existing one). */
  readonly record: MemoryRecord
  /** True when an enabled record with the same scope, type, and content already existed. */
  readonly deduplicated: boolean
}

/** Management filters. Every omitted field matches everything. */
export interface MemoryFilter {
  /** Restrict to one scope axis value; `global` selects only global records. */
  readonly scope?: { readonly global: true } | { readonly workspace: string } | { readonly mode: string }
  /** Restrict to one classification. */
  readonly type?: MemoryType
  /** Restrict to one status. */
  readonly status?: MemoryStatus
  /** Case-insensitive substring filter over content and title. */
  readonly text?: string
}

/** One ranked retrieval candidate. */
export interface MemoryCandidate {
  /** The record at retrieval time. */
  readonly record: MemoryRecord
  /** Final ordering score (relevance × scope × type × freshness). */
  readonly score: number
  /** Share of the query's token weight the record matched, in `[0, 1]`. */
  readonly relevance: number
}

/** A suppressed record and the record that superseded it. */
export interface MemoryConflict {
  /** The retained record. */
  readonly kept: MemoryId
  /** The record suppressed because {@link kept} is newer. */
  readonly superseded: MemoryId
  /** The conflict-grouping topic both records named. */
  readonly topic: string
}

/** What retrieval selected for one request, before rendering. */
export interface MemorySelection {
  /** Selected records, best first, already deduplicated and bounded. */
  readonly entries: readonly MemoryCandidate[]
  /** Records suppressed because a newer record of the same topic exists. */
  readonly conflicts: readonly MemoryConflict[]
  /** Relevant records that did not fit the context budget. */
  readonly omitted: number
}

/** The session-derived scope a request runs in. */
export interface SessionMemoryScope {
  /** Every workspace key the session's project directory resolves to. */
  readonly workspaceKeys: readonly string[]
  /** The key new records should carry, when the session has a project directory. */
  readonly workspaceKey?: string | undefined
  /** The agent preset id the session runs, when one is recorded. */
  readonly mode?: string | undefined
  /** Session identity, recorded on new records. */
  readonly sessionId: SessionId
  /** True for a fresh child conversation (quick question, spawn) that must not receive main-line memory. */
  readonly freshChild: boolean
}

/** A retrieval request from one conversation. */
export interface MemoryRetrieveRequest {
  /** The text relevance is measured against (the incoming user message). */
  readonly query: string
  /** The conversation's scope. */
  readonly scope: SessionMemoryScope
  /** Records already present in this conversation's log; never returned again. */
  readonly exclude?: readonly MemoryId[]
}

/** A management search request. */
export interface MemorySearchRequest {
  /** Free text; empty matches everything. */
  readonly query: string
  /** Optional scope filter and conversation scope used to rank local records first. */
  readonly scope?: SessionMemoryScope
  /** Maximum records to return; defaults to the configured retrieval entry limit. */
  readonly limit?: number
}

/** Search output for management surfaces. */
export interface MemorySearchResult {
  /** Matching enabled and disabled records, best first. */
  readonly records: readonly MemoryCandidate[]
  /** False when the query had no searchable token and ordering fell back to recency. */
  readonly ranked: boolean
}

/** Resolved retrieval limits, exposed so management surfaces state the real bounds. */
export interface MemoryLimits {
  /** Maximum records one request may inject. */
  readonly maxEntries: number
  /** Maximum characters one injected record may occupy. */
  readonly maxEntryChars: number
  /** Maximum UTF-8 bytes the complete injected block may occupy. */
  readonly maxContextBytes: number
  /** Minimum token-weight share a record must match to be considered relevant. */
  readonly minRelevance: number
  /** Maximum characters one stored record may contain. */
  readonly maxContentChars: number
}
