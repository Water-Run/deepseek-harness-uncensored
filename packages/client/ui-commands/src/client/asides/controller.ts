/** Lifetime of native inline questions displayed beside a parent's composer. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One inline question, including its creation feedback. */
export type InlineAside = { readonly status: 'opening' } | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly reference: SessionReference }

/** Owns the retained children and pending operations of the inline question surface. */
export class InlineAsideController {
  readonly state = createSnapshotStore<ReadonlyMap<SessionId, InlineAside>>(new Map())
  private readonly pending = new Map<SessionId, Promise<void>>()
  private readonly operations = new Set<Promise<void>>()
  private readonly generations = new Map<SessionId, object>()
  private closed = false

  /** @param create - Create and retain a fresh child; rejects when the Host cannot confirm creation. */
  constructor(private readonly create: (parent: SessionId) => Promise<SessionReference>) {}

  /** @param parent - Parent owning the inline window. @returns Completion of the current opening. */
  open(parent: SessionId): Promise<void> {
    if (this.closed) return Promise.resolve()
    const pending = this.pending.get(parent)
    if (pending !== undefined && this.generations.has(parent)) return pending
    this.hide(parent)
    const generation = {}
    this.generations.set(parent, generation)
    this.publish(parent, { status: 'opening' })
    const operation = this.create(parent).then((reference) => {
      if (this.closed || this.generations.get(parent) !== generation) reference.release()
      else this.publish(parent, { status: 'ready', reference })
    }, () => {
      if (!this.closed && this.generations.get(parent) === generation) this.publish(parent, { status: 'failed' })
    }).finally(() => {
      this.operations.delete(operation)
      if (this.pending.get(parent) === operation) this.pending.delete(parent)
    })
    this.operations.add(operation)
    this.pending.set(parent, operation)
    return operation
  }

  /** Hide a window; its durable child is neither canceled nor deleted. @param parent - Owning parent. */
  hide(parent: SessionId): void {
    this.generations.delete(parent)
    const old = this.state.getSnapshot().get(parent)
    this.publish(parent, undefined)
    if (old?.status === 'ready') old.reference.release()
  }

  private publish(parent: SessionId, value: InlineAside | undefined): void {
    const next = new Map(this.state.getSnapshot())
    if (value === undefined) next.delete(parent)
    else next.set(parent, value)
    this.state.set(next)
  }

  /** Drain pending creation before releasing the providers used by its completion. */
  async dispose(): Promise<void> {
    this.closed = true
    for (const parent of this.state.getSnapshot().keys()) this.hide(parent)
    await Promise.allSettled([...this.operations])
  }
}
