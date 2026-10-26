/**
 * Snapshot state and Remote calls behind the memory settings row. The
 * controller owns every draft and every settled list, so navigating away and
 * back never loses an in-progress edit; it publishes only after the Host
 * confirmed a write.
 */

import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MemoryDescribeValue, MemoryScopeFilter, MemorySourceAvailability } from '@deepseek-ai/dsh-api-memory-controller/types'
import type { MemoryId, MemoryRecord, MemoryScope, MemoryStatus, MemoryType } from '@deepseek-ai/dsh-memory/types'

/** Error keys the row renders; every one maps to a localized line. */
export type MemoryErrorKey =
  | 'loadFailed'
  | 'saveFailed'
  | 'conflict'
  | 'invalid'
  | 'unavailable'
  | 'scopeRequired'
  | 'ownerOnly'

/** One add/edit draft. Kept by the controller so it survives a remount. */
export interface MemoryDraft {
  /** Record being edited; absent while adding. */
  readonly id?: MemoryId
  /** Revision the edit started from. */
  readonly expectedVersion?: number
  /** Free text of the record. */
  readonly content: string
  /** Classification. */
  readonly type: MemoryType
  /** Optional label. */
  readonly title: string
  /** Optional conflict-grouping key. */
  readonly topic: string
  /** Share across every workspace and mode. */
  readonly shareGlobal: boolean
  /** Chosen workspace key; an empty string means "any workspace". */
  readonly workspace: string
  /** Chosen mode id; an empty string means "any mode". */
  readonly mode: string
}

/** Everything the row and its manager render. */
export interface MemoryRowState {
  /** Host facts; undefined until the first describe settles. */
  description: MemoryDescribeValue | undefined
  /** Current list of stored records. */
  records: readonly MemoryRecord[]
  /** Fresh source-session observations for the current list. */
  sources: Readonly<Record<string, MemorySourceAvailability>>
  /** Free-text filter. */
  text: string
  /** Scope filter selection: `all`, `global`, or a stored scope value. */
  scope: string
  /** Classification filter; `all` matches every type. */
  type: string
  /** Whether the first list is still loading. */
  loading: boolean
  /** Current failure, cleared by the next successful read or write. */
  error: MemoryErrorKey | undefined
  /** Draft being edited; absent when the manager shows only the list. */
  draft: MemoryDraft | undefined
  /** Whether a write is in flight. */
  saving: boolean
  /** Record identity awaiting delete confirmation. */
  confirming: MemoryId | undefined
}

/** The inject face the renderer binds. */
export interface MemoryRowFace {
  /** Bound by the renderer as `useMemories`. */
  readonly hooks: { readonly memories: ReturnType<typeof createMemoryStore> }
  /** Load the description and the first list. */
  readonly open: () => Promise<void>
  /** Re-read the list with the current filters. */
  readonly reload: () => Promise<void>
  /** Apply a search text and reload. */
  readonly search: (text: string) => Promise<void>
  /** Apply a scope filter value and reload. */
  readonly filterScope: (value: string) => Promise<void>
  /** Apply a type filter value and reload. */
  readonly filterType: (value: string) => Promise<void>
  /** Start an empty draft. */
  readonly addDraft: () => void
  /** Start a draft from one stored record. */
  readonly editDraft: (record: MemoryRecord) => void
  /** Change one draft field. */
  readonly changeDraft: (patch: Partial<MemoryDraft>) => void
  /** Discard the draft. */
  readonly cancelDraft: () => void
  /** Persist the draft. */
  readonly saveDraft: () => Promise<void>
  /** Enable or disable one record. */
  readonly toggleStatus: (record: MemoryRecord) => Promise<void>
  /** Ask for delete confirmation. */
  readonly askDelete: (record: MemoryRecord) => void
  /** Dismiss the delete confirmation. */
  readonly cancelDelete: () => void
  /** Delete the confirmed record. */
  readonly confirmDelete: () => Promise<void>
}

/**
 * Create the memory settings state owned by one plugin instance.
 * @returns The observable list, editor and operation state.
 */
export function createMemoryStore(): SnapshotStore<MemoryRowState> {
  return createSnapshotStore<MemoryRowState>({
    description: undefined,
    records: [],
    sources: {},
    text: '',
    scope: 'all',
    type: 'all',
    loading: true,
    error: undefined,
    draft: undefined,
    saving: false,
    confirming: undefined,
  })
}

/** Translate one Remote failure code into the row's error key. */
function errorKeyOf(code: string): MemoryErrorKey {
  if (code === 'remote-access/denied') return 'ownerOnly'
  if (code === 'memory/conflict') return 'conflict'
  if (code === 'memory/invalid') return 'invalid'
  if (code === 'memory/unavailable') return 'unavailable'
  return 'loadFailed'
}

/**
 * Build the row's controller over the Memory Remote namespace.
 * @param ctx - plugin context carrying `ctx.remote.memory`.
 * @returns the face the renderer binds.
 */
export function createMemoryController(ctx: Context): MemoryRowFace {
  const store = createMemoryStore()
  const remote = ctx.remote.memory

  const reload = async (): Promise<void> => {
    const state = store.getSnapshot()
    const result = await remote.list({
      filter: scopeFilterOf(state.scope),
      ...state.type === 'all' ? {} : { type: state.type as MemoryType },
      ...state.text.trim() === '' ? {} : { text: state.text },
    })
    if (!result.ok) {
      store.update((draft) => {
        draft.loading = false
        draft.error = errorKeyOf(result.error.code)
      })
      return
    }
    store.update((draft) => {
      draft.records = result.value.records
      draft.sources = result.value.sources
      draft.loading = false
      draft.error = undefined
      draft.confirming = undefined
    })
  }

  const open = async (): Promise<void> => {
    if (store.getSnapshot().description === undefined) {
      const described = await remote.describe()
      if (!described.ok) {
        store.update((draft) => {
          draft.loading = false
          draft.error = errorKeyOf(described.error.code)
        })
        return
      }
      store.update((draft) => {
        draft.description = described.value
      })
    }
    await reload()
  }

  const saveDraft = async (): Promise<void> => {
    const state = store.getSnapshot()
    const draft = state.draft
    if (draft === undefined || draft.content.trim() === '') return
    const scope = scopeOfDraft(draft)
    if (scope === undefined) {
      store.update((next) => {
        next.error = 'scopeRequired'
      })
      return
    }
    store.update((next) => {
      next.saving = true
      next.error = undefined
    })
    const title = draft.title.trim()
    const topic = draft.topic.trim()
    const result = draft.id === undefined
      ? await remote.create({
        type: draft.type,
        content: draft.content,
        ...title === '' ? {} : { title },
        ...topic === '' ? {} : { topic },
        scope,
      })
      : await remote.update({
        id: draft.id,
        expectedVersion: draft.expectedVersion ?? 1,
        patch: {
          type: draft.type,
          content: draft.content,
          title,
          topic,
          scope,
        },
      })
    if (!result.ok) {
      store.update((next) => {
        next.saving = false
        next.error = errorKeyOf(result.error.code)
      })
      return
    }
    store.update((next) => {
      next.saving = false
      next.error = undefined
      next.draft = undefined
    })
    await reload()
  }

  const toggleStatus = async (record: MemoryRecord): Promise<void> => {
    const status: MemoryStatus = record.status === 'enabled' ? 'disabled' : 'enabled'
    const result = await remote.setStatus({
      id: record.id,
      expectedVersion: record.version,
      status,
    })
    if (!result.ok) {
      store.update((next) => {
        next.error = errorKeyOf(result.error.code)
      })
      return
    }
    await reload()
  }

  const confirmDelete = async (): Promise<void> => {
    const id = store.getSnapshot().confirming
    if (id === undefined) return
    const result = await remote.deleteRecord({ id })
    if (!result.ok) {
      store.update((next) => {
        next.error = errorKeyOf(result.error.code)
      })
      return
    }
    store.update((next) => {
      next.confirming = undefined
    })
    await reload()
  }

  return {
    hooks: { memories: store },
    open,
    reload,
    async search(text) {
      store.update((draft) => {
        draft.text = text
      })
      await reload()
    },
    async filterScope(value) {
      store.update((draft) => {
        draft.scope = value
      })
      await reload()
    },
    async filterType(value) {
      store.update((draft) => {
        draft.type = value
      })
      await reload()
    },
    addDraft() {
      const description = store.getSnapshot().description
      const workspace = description?.workspaces[0]?.value ?? ''
      store.update((draft) => {
        draft.error = undefined
        draft.draft = {
          content: '',
          type: 'project-fact',
          title: '',
          topic: '',
          shareGlobal: false,
          workspace,
          mode: '',
        }
      })
    },
    editDraft(record) {
      store.update((draft) => {
        draft.error = undefined
        draft.draft = {
          id: record.id,
          expectedVersion: record.version,
          content: record.content,
          type: record.type,
          title: record.title ?? '',
          topic: record.topic ?? '',
          shareGlobal: record.scope.global,
          workspace: record.scope.workspace ?? '',
          mode: record.scope.mode ?? '',
        }
      })
    },
    changeDraft(patch) {
      store.update((draft) => {
        if (draft.draft !== undefined) Object.assign(draft.draft, patch)
      })
    },
    cancelDraft() {
      store.update((draft) => {
        draft.draft = undefined
        draft.error = undefined
      })
    },
    saveDraft,
    toggleStatus,
    askDelete(record) {
      store.update((draft) => {
        draft.confirming = record.id
      })
    },
    cancelDelete() {
      store.update((draft) => {
        draft.confirming = undefined
      })
    },
    confirmDelete,
  }
}

/**
 * Project the manager's scope selection onto the wire filter.
 * @param value - `all`, `global`, or a stored scope value.
 * @returns the filter the Host applies.
 */
export function scopeFilterOf(value: string): MemoryScopeFilter {
  if (value === 'all') return { kind: 'all' }
  if (value === 'global') return { kind: 'global' }
  if (value.startsWith('workspace:')) return { kind: 'workspace', workspace: value }
  return { kind: 'mode', mode: value }
}

/**
 * Project a draft's scope choices onto a stored scope.
 * @param draft - the draft being saved.
 * @returns the scope, or undefined when the draft names none.
 */
export function scopeOfDraft(draft: MemoryDraft): MemoryScope | undefined {
  if (draft.shareGlobal) return { global: true }
  if (draft.workspace === '' && draft.mode === '') return undefined
  return {
    global: false,
    ...draft.workspace === '' ? {} : { workspace: draft.workspace },
    ...draft.mode === '' ? {} : { mode: draft.mode },
  }
}
