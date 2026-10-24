/** App-wide accent of the main view's conversation mode. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { CurrentModeState } from './AgentPresetSection.tsx'

/** Modes with their own accent; any other preset keeps the platform accent. */
export const ACCENT_MODES = ['standard', 'security', 'reverse', 'writing'] as const

/** One mode with its own accent. */
export type AccentMode = typeof ACCENT_MODES[number]

/** A pointer press this recent places the reveal origin; older presses fall back to the brand's mode marker. */
const POINTER_ORIGIN_MS = 2000

/**
 * Narrow a preset identity to an accented mode.
 * @param id - Main-view preset identity, absent before a roster resolves.
 * @returns the accented mode, or undefined for a hidden, custom, or unknown preset.
 */
export function accentMode(id: string | undefined): AccentMode | undefined {
  return ACCENT_MODES.find(mode => mode === id)
}

/** Point the reveal spreads from, and the radius that covers the viewport from it. */
interface RevealOrigin { x: number; y: number; radius: number }

function revealOrigin(pointer: { x: number; y: number; at: number } | undefined): RevealOrigin {
  const width = window.innerWidth
  const height = window.innerHeight
  let point = pointer !== undefined && performance.now() - pointer.at < POINTER_ORIGIN_MS ? pointer : undefined
  if (point === undefined) {
    const brand = document.querySelector('[data-dsh-mode-marker]')?.getBoundingClientRect()
    point = brand === undefined || brand.width === 0
      ? { x: 0, y: 0, at: 0 }
      : { x: brand.left + brand.width / 2, y: brand.top + brand.height / 2, at: 0 }
  }
  const radius = Math.hypot(Math.max(point.x, width - point.x), Math.max(point.y, height - point.y))
  return { x: point.x, y: point.y, radius }
}

/**
 * Mirror the main view's mode onto `body[data-dsh-mode]` for the lifetime of the returned disposer.
 * Changing the mode of the same conversation reveals the new accent as a circle spreading from the
 * control that chose it; moving to another conversation fades the accent instead. Reduced motion and
 * engines without view transitions apply the attribute directly.
 * @param currentMode - Main-view selection, including a pick staged on a new conversation.
 * @returns disposer that removes the attribute and listeners.
 */
export function installModeAccent(currentMode: ObservableSnapshot<CurrentModeState>): () => void {
  if (typeof document === 'undefined') return () => {}
  const root = document.documentElement
  let pointer: { x: number; y: number; at: number } | undefined
  let shown: { sessionId: string | undefined; mode: AccentMode | undefined } | undefined
  let reveal: ViewTransition | undefined
  let revision = 0
  const press = (event: PointerEvent): void => { pointer = { x: event.clientX, y: event.clientY, at: performance.now() } }
  const write = (mode: AccentMode | undefined): void => {
    if (mode === undefined) delete document.body.dataset.dshMode
    else document.body.dataset.dshMode = mode
  }
  const clearReveal = (): void => {
    delete root.dataset.dshModeReveal
    for (const name of ['--dsh-mode-reveal-x', '--dsh-mode-reveal-y', '--dsh-mode-reveal-radius']) root.style.removeProperty(name)
  }
  const sync = (): void => {
    const state = currentMode.getSnapshot()
    const mode = accentMode(state.id)
    const previous = shown
    shown = { sessionId: state.sessionId, mode }
    if (previous?.mode === mode && document.body.dataset.dshMode === mode) return
    const current = ++revision
    reveal?.skipTransition()
    reveal = undefined
    clearReveal()
    const spread = previous?.mode !== undefined && mode !== undefined && previous.sessionId === state.sessionId
      && typeof document.startViewTransition === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!spread) {
      write(mode)
      return
    }
    const origin = revealOrigin(pointer)
    pointer = undefined
    root.dataset.dshModeReveal = ''
    root.style.setProperty('--dsh-mode-reveal-x', `${String(origin.x)}px`)
    root.style.setProperty('--dsh-mode-reveal-y', `${String(origin.y)}px`)
    root.style.setProperty('--dsh-mode-reveal-radius', `${String(Math.ceil(origin.radius))}px`)
    const transition = document.startViewTransition(() => { if (revision === current) write(mode) })
    reveal = transition
    // A skipped transition can finish after its replacement has started.
    void transition.finished.catch(() => undefined).finally(() => {
      if (reveal !== transition) return
      reveal = undefined
      clearReveal()
    })
  }
  document.addEventListener('pointerdown', press, { capture: true, passive: true })
  const stop = currentMode.subscribe(sync)
  sync()
  return () => {
    revision += 1
    stop()
    document.removeEventListener('pointerdown', press, { capture: true })
    reveal?.skipTransition()
    reveal = undefined
    clearReveal()
    delete document.body.dataset.dshMode
  }
}
