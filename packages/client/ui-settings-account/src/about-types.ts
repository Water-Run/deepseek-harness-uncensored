/** Presentation-only Desktop capability shared by the About page and carrier checks. @module */

/** Optional preload interface; metadata and URLs stay in the product page. */
export interface DesktopAboutBridge {
  /** @param listener - Native menu request. @returns Releases presentation readiness. */
  subscribe(listener: () => void): () => void
  /** @param visible - Whether About currently covers the main product document. */
  visible(visible: boolean): void
}
