/** One About surface shared by the sidebar and optional Desktop menu. @module */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DesktopAboutBridge } from '../about-types.ts'

/** Owns the dialog independently from a menu or sidebar layout. */
export class AboutController {
  /** Root overlay observation. */
  readonly state = createSnapshotStore(false)
  private unsubscribe: (() => void) | undefined
  private closed = false

  /** @param bridge - Desktop carrier, absent in a browser or an older carrier. */
  constructor(private readonly bridge?: DesktopAboutBridge) {}

  /** Attach the carrier inside the owning plugin's effect. */
  start(): void {
    if (!this.closed && this.unsubscribe === undefined) this.unsubscribe = this.bridge?.subscribe(this.open)
  }

  /** Open the existing dialog or present it once. */
  readonly open = (): void => {
    if (this.closed || this.state.getSnapshot()) return
    this.state.set(true)
    this.bridge?.visible(true)
  }

  /** Release modality immediately when the user dismisses the dialog. */
  readonly close = (): void => {
    if (this.closed || !this.state.getSnapshot()) return
    this.state.set(false)
    this.bridge?.visible(false)
  }

  /** Release carrier state and suppress requests after plugin teardown. */
  dispose(): void {
    if (this.closed) return
    try { this.close() }
    finally { this.closed = true; this.unsubscribe?.() }
  }
}
