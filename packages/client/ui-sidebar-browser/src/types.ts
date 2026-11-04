/** Type-only Electron bridge declarations shared by the desktop shell and browser provider. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Host-issued routing for one Security conversation's native browser. */
export interface DesktopBrowserProxy {
  readonly sessionId: SessionId
  readonly server: string
}

/** Main-issued identity of one guest reservation. */
export type DesktopBrowserLeaseId = Branded<'DesktopBrowserLeaseId'>

/** A guest's approved, process-local storage partition. */
export interface DesktopBrowserReservation {
  readonly lease: DesktopBrowserLeaseId
  readonly partition: string
}

/** Main-approved request to open an HTTP(S) page from an existing guest. */
export interface DesktopBrowserOpenRequest {
  readonly lease: DesktopBrowserLeaseId
  readonly url: string
}

/** Origin-scoped operations; no Electron objects or arbitrary IPC cross this interface. */
export interface DesktopBrowserBridge {
  /** Present when the native shell accepts session-scoped proxy reservations. */
  readonly proxyRouting?: true
  /**
   * @param workspace - resolved storage account.
   * @param proxy - optional conversation-owned local proxy.
   * @returns One approved guest reservation.
   */
  acquire(workspace: string, proxy?: DesktopBrowserProxy): Promise<DesktopBrowserReservation>
  /** @param lease - the caller's reservation. @returns after its guest has been destroyed. */
  release(lease: DesktopBrowserLeaseId): Promise<void>
  /** @param lease - originating guest. @param listener - approved URL consumer. @returns unsubscribe callback. */
  onOpenRequested(lease: DesktopBrowserLeaseId, listener: (url: string) => void): () => void
}
