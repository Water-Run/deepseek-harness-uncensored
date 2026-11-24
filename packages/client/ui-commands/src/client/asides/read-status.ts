/** Read position of the most recently viewed side result for each main conversation. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'

const PREFIX = 'dshu.aside.read.'
type Receipt = { readonly child: SessionId; readonly seq: number }

function saved(parent: SessionId): Receipt | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFIX + parent) ?? 'null')
    if (value && typeof value === 'object' && 'child' in value && typeof value.child === 'string'
      && 'seq' in value && typeof value.seq === 'number' && Number.isSafeInteger(value.seq) && value.seq >= 0) {
      return { child: SessionId(value.child), seq: value.seq }
    }
  } catch (_unavailableOrInvalidReceipt) { /* Local storage is optional. */ }
  return null
}

/** Browser-local read positions shared by a parent's sidebar and launcher. */
export class AsideReads {
  private readonly parents = new Map<SessionId, SnapshotStore<Receipt | null>>()

  /** @param parent - main Session. @returns its observable latest read position. */
  for(parent: SessionId): SnapshotStore<Receipt | null> {
    let store = this.parents.get(parent)
    if (!store) {
      store = createSnapshotStore(saved(parent))
      this.parents.set(parent, store)
    }
    return store
  }

  /** @param parent - main Session. @param child - viewed generation. @param seq - visible finished turn. */
  mark(parent: SessionId, child: SessionId, seq: number): void {
    const store = this.for(parent), previous = store.getSnapshot()
    if (previous?.child === child && previous.seq >= seq) return
    const receipt = { child, seq }
    store.set(receipt)
    try { localStorage.setItem(PREFIX + parent, JSON.stringify(receipt)) }
    catch (_storageUnavailable) { /* The current window keeps the read position. */ }
  }

  /** @param event - a read position updated by another window on this origin. */
  sync(event: StorageEvent): void {
    if (event.key?.startsWith(PREFIX)) {
      const parent = SessionId(event.key.slice(PREFIX.length))
      this.parents.get(parent)?.set(saved(parent))
    }
  }

  /** @param parent - deleted main Session whose read position can be discarded. */
  forget(parent: SessionId): void {
    this.parents.delete(parent)
    try { localStorage.removeItem(PREFIX + parent) }
    catch (_storageUnavailable) { /* The in-memory position has been released. */ }
  }
}

/** @param list - Session summaries. @param child - side identity. @returns the Host's latest side result metadata. */
export function sideMetadata(list: SessionListState, child: SessionId | undefined) {
  if (child === undefined) return undefined
  return (list.projectionsBySession[child]?.values?.sessionListMetadata ?? list.byId[child]?.projectionValues?.sessionListMetadata)?.side
}

/** @param list - Session summaries. @param parent - main Session. @returns its newest side generation, including an empty successor. */
export function newestSide(list: SessionListState, parent: SessionId): SessionId | undefined {
  let current: SessionId | undefined, generation = -1
  for (const id of list.ids) {
    if (list.byId[id]?.parentId !== parent) continue
    const side = sideMetadata(list, id)
    if (side && side.generation > generation) { current = id; generation = side.generation }
  }
  return current
}

/**
 * A side conversation can only be cleared once it holds something to clear.
 * @param child - Resident side generation, when one is open.
 * @param asked - Whether that generation already received a prompt.
 * @returns Whether clearing it would change anything.
 */
export function canClearSide(child: SessionId | undefined, asked: boolean | undefined): boolean {
  return child !== undefined && asked === true
}
