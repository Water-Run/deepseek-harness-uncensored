/** Row operations supplied by the containing Chat viewport. @module */
export interface FlowMotionRows {
  /** @param element - visible row. @param done - commits hidden state before idle callbacks run. */
  collapse(element: HTMLElement, done: () => void): void
  /** @param element - newly visible row to grow to its natural size. */
  reveal(element: HTMLElement): void
  /** @param element - row whose active transition should be cancelled without hiding it. */
  cancelMotion(element: HTMLElement): void
  /**
   * Hide a row at once, outside a motion scope; the owning viewport measures the layout first.
   * @param element - visible row.
   * @param commit - applies the hidden state.
   */
  hideNow?(element: HTMLElement, commit: () => void): void
}
