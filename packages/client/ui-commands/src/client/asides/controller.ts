/** Submission and reference ownership for one-shot inline questions. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One result block; rejected admission retains any opened transcript for inspection. */
export type InlineAside = { readonly status: 'opening' } | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly reference: SessionReference; readonly submitFailed: boolean }

interface Opening {
  readonly question: string
  reference?: SessionReference
  pending: boolean
  hidden: boolean
  task: Promise<boolean>
}

/** Owns each question through admission, even when its result block is hidden meanwhile. */
export class InlineAsideController {
  /** Result blocks indexed by their main conversation. */
  readonly state = createSnapshotStore<ReadonlyMap<SessionId, InlineAside>>(new Map())
  private readonly entries = new Map<SessionId, Opening>()
  private readonly operations = new Set<Promise<boolean>>()
  private closed = false

  /**
   * @param create - Create and retain a fresh child whose initial history is ready.
   * @param submit - Submit one question; reject when admission cannot be confirmed.
   */
  constructor(
    private readonly create: (parent: SessionId) => Promise<SessionReference>,
    private readonly submit: (reference: SessionReference, question: string) => Promise<void>,
  ) {}

  /**
   * Submit one independent question; simultaneous identical submissions share admission.
   * @param parent - Conversation owning the result block.
   * @param text - Nonempty question after the command token.
   * @returns Confirmed admission; false keeps the originating draft intact.
   */
  ask(parent: SessionId, text: string): Promise<boolean> {
    const question = text.trim()
    if (this.closed || !question) return Promise.resolve(false)
    const previous = this.entries.get(parent)
    if (previous?.pending) return previous.question === question ? previous.task : Promise.resolve(false)
    this.hide(parent)
    const entry: Opening = { question, pending: true, hidden: false, task: Promise.resolve(false) }
    this.entries.set(parent, entry)
    this.publish(parent, { status: 'opening' })
    const operation = this.run(parent, entry).finally(() => {
      entry.pending = false
      this.operations.delete(operation)
      if (entry.hidden || this.closed) this.release(entry)
    })
    entry.task = operation
    this.operations.add(operation)
    return operation
  }

  private async run(parent: SessionId, entry: Opening): Promise<boolean> {
    try {
      entry.reference = await this.create(parent)
      if (entry.hidden || this.closed) return false
      const reference = entry.reference
      this.publish(parent, { status: 'ready', reference, submitFailed: false })
      await this.submit(reference, entry.question)
      return true
    } catch (_admissionFailed) {
      if (!entry.hidden && !this.closed) {
        this.publish(parent, entry.reference === undefined ? { status: 'failed' }
          : { status: 'ready', reference: entry.reference, submitFailed: true })
      }
      return false
    }
  }

  /**
   * Hide the result block; an in-flight submission retains its reference until settlement.
   * @param parent - Owning conversation.
   */
  hide(parent: SessionId): void {
    const entry = this.entries.get(parent)
    this.entries.delete(parent)
    this.publish(parent, undefined)
    if (entry === undefined) return
    entry.hidden = true
    if (!entry.pending) this.release(entry)
  }

  private release(entry: Opening): void {
    const reference = entry.reference
    delete entry.reference
    reference?.release()
  }

  private publish(parent: SessionId, value: InlineAside | undefined): void {
    const next = new Map(this.state.getSnapshot())
    if (value === undefined) next.delete(parent)
    else next.set(parent, value)
    this.state.set(next)
  }

  /** Stop admission, drain pending submissions, then release every owned child reference. */
  async dispose(): Promise<void> {
    this.closed = true
    for (const parent of this.entries.keys()) this.hide(parent)
    await Promise.allSettled([...this.operations])
  }
}
