/** Presentation-only About bridge for the trusted product document. @module */
import type { DshDesktopProductApi } from './ipc.ts'

/** IPC operations supplied by the isolated preload. */
export interface AboutTransport {
  /** @param listener - Native request callback. @returns Listener cleanup. */
  listen(listener: () => void): () => void
  /** @param ready - Whether a product listener exists. @param visible - Whether its dialog is open. */
  publish(ready: boolean, visible: boolean): void
}

/** @param transport - Document-owned IPC operations. @returns A bridge whose last listener releases native visibility. */
export function createAboutBridge(transport: AboutTransport): DshDesktopProductApi['about'] {
  let listeners = 0
  let shown = false
  return {
    subscribe(listener) {
      const off = transport.listen(listener)
      try { if (++listeners === 1) transport.publish(true, shown) }
      catch (error) { listeners--; off(); throw error }
      let active = true
      return () => {
        if (!active) return
        active = false; off()
        if (--listeners === 0) { shown = false; transport.publish(false, false) }
      }
    },
    visible(value) { shown = value; transport.publish(listeners > 0, listeners > 0 && shown) },
  }
}
