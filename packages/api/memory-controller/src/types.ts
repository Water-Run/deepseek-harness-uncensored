/**
 * Wire vocabulary of the memory Remote namespace: management filters, the
 * scope catalog the page renders, and the error details a failed write
 * carries back to the browser.
 * @module @deepseek-ai/dsh-api-memory-controller/src/types
 */

import type {
  MemoryId, MemoryLimits, MemoryPatch, MemoryRecord, MemoryScope, MemoryStatus, MemoryType,
} from '@deepseek-ai/dsh-memory/types'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The record changed since the caller read it; both revisions are named. */
    'memory/conflict': {
      readonly memoryId: MemoryId
      readonly expectedVersion: number
      readonly currentVersion: number
    }
    /** No record carries that identity. */
    'memory/not-found': { readonly memoryId?: MemoryId }
    /** The requested record violates a durable-format rule. */
    'memory/invalid': { readonly reason: string }
    /** The durable memory store could not be opened or read. */
    'memory/unavailable': { readonly reason: string }
  }
}

/** One selectable scope value in the management page. */
export interface MemoryScopeOption {
  /** Stored scope axis value (`workspace:<id>` or a preset id). */
  readonly value: string
  /** Display label the page shows for it. */
  readonly label: string
}

/** Host facts the management page states before it offers any control. */
export interface MemoryDescribeValue {
  /** Exact retrieval and storage bounds this deployment runs. */
  readonly limits: MemoryLimits
  /** Registered workspaces a record may be limited to. */
  readonly workspaces: readonly MemoryScopeOption[]
  /** Agent preset ids present on stored records; the page offers them as a mode filter. */
  readonly modes: readonly MemoryScopeOption[]
}

/** Scope filter of a management list. */
export type MemoryScopeFilter =
  | { readonly kind: 'all' }
  | { readonly kind: 'global' }
  | { readonly kind: 'workspace'; readonly workspace: string }
  | { readonly kind: 'mode'; readonly mode: string }

/** One management list request. */
export interface MemoryListRequest {
  /** Scope restriction; omitted lists every scope. */
  readonly filter?: MemoryScopeFilter
  /** Classification restriction. */
  readonly type?: MemoryType
  /** Status restriction. */
  readonly status?: MemoryStatus
  /** Free text matched against content and title. */
  readonly text?: string
}

/** Records a management read returns. */
export interface MemoryListValue {
  /** Matching records, most recently updated first. */
  readonly records: readonly MemoryRecord[]
}

/** One record a write returns. */
export interface MemoryValue {
  /** The stored record at its current revision. */
  readonly record: MemoryRecord
}

/** One save request from the management page. */
export interface MemoryCreateRequest {
  /** Classification. */
  readonly type: MemoryType
  /** Stored text. */
  readonly content: string
  /** Optional short label. */
  readonly title?: string
  /** Optional conflict-grouping key. */
  readonly topic?: string
  /** Target scope; the page makes global sharing an explicit choice. */
  readonly scope: MemoryScope
}

/** One edit request from the management page. */
export interface MemoryUpdateRequest {
  /** Record identity. */
  readonly id: MemoryId
  /** Revision the caller read; a stale value rejects with `memory/conflict`. */
  readonly expectedVersion: number
  /** Fields to replace. */
  readonly patch: MemoryPatch
}

/** One enable/disable request. */
export interface MemoryStatusRequest {
  /** Record identity. */
  readonly id: MemoryId
  /** Revision the caller read. */
  readonly expectedVersion: number
  /** Target status. */
  readonly status: MemoryStatus
}

/** One delete request. */
export interface MemoryRemoveRequest {
  /** Record identity. */
  readonly id: MemoryId
}

/** Delete outcome. */
export interface MemoryRemoveValue {
  /** True when a record was deleted, false when it was already absent. */
  readonly removed: boolean
}
