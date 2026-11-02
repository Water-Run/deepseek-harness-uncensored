/** Native-menu routing and renderer lifetime for the shared product About page. @module */

/** Shell operations owned by the main application window. */
export interface AboutRouting {
  /** @returns Whether the main product document can currently present a dialog. */
  canPresent(): boolean
  /** Focus the main window and notify its About listener. */
  request(): void
  /** @param hidden - Temporarily hide native Platform content without destroying its page. */
  platformHidden(hidden: boolean): void
}

/** Keeps availability separate from visibility; navigation revokes both. */
export class DesktopAboutRouting {
  private ready = false
  /** @param operations - Current main-window operations. */
  constructor(private readonly operations: AboutRouting) {}

  /** @returns Whether the product renderer accepted presentation routing. */
  request(): boolean {
    if (!this.ready || !this.operations.canPresent()) return false
    this.operations.request()
    return true
  }

  /** @param ready - Trusted document has a listener. @param visible - Its shared dialog is open. */
  synchronize(ready: boolean, visible: boolean): void {
    this.ready = ready
    this.operations.platformHidden(ready && visible)
  }

  /** Revoke availability after navigation, renderer failure, or window destruction. */
  reset(): void { this.synchronize(false, false) }
}
