/** One browser-owned input-prediction preference shared by every composer and Settings. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

const KEY = 'dsh.uncensored.prediction'
const CHANGE = 'dsh-prediction'

/** Current browser preference and persistence availability. */
export interface PredictionPreferenceState { enabled: boolean; failed: boolean }

/** Defaults on, preserves an explicit off value, and owns cross-window listeners. */
export class PredictionPreference {
  /** Shared current value, stable until storage or the user's choice changes. */
  readonly state = createSnapshotStore<PredictionPreferenceState>({ enabled: true, failed: false })
  private closed = false

  /** @param host - Browser storage and event owner; absent during non-DOM composition tests. */
  constructor(private readonly host: Window | undefined = typeof window === 'undefined' ? undefined : window) {
    this.read()
    host?.addEventListener('storage', this.read)
    host?.addEventListener(CHANGE, this.read)
  }

  private publish(enabled: boolean, failed: boolean): void {
    const current = this.state.getSnapshot()
    if (current.enabled !== enabled || current.failed !== failed) this.state.set({ enabled, failed })
  }

  private readonly read = (): void => {
    if (this.closed || this.host === undefined) return
    try {
      const value = this.host.localStorage.getItem(KEY)
      if (value !== null && value !== '0' && value !== '1') throw new Error('Invalid input prediction preference')
      this.publish(value !== '0', false)
    } catch (error) { this.publish(false, true); console.warn('[prediction] preference is unavailable', error) }
  }

  /**
   * Persist the shared preference and notify mounted composers.
   * @param enabled - Whether composers may request predictions.
   * @returns Whether the preference was saved.
   */
  readonly save = (enabled: boolean): boolean => {
    if (this.closed) return false
    try {
      if (this.host === undefined) throw new Error('Browser storage is unavailable')
      this.host.localStorage.setItem(KEY, enabled ? '1' : '0')
      this.publish(enabled, false)
      this.host.dispatchEvent(new Event(CHANGE))
      return true
    } catch (error) {
      this.publish(enabled && this.state.getSnapshot().enabled, true)
      console.warn('[prediction] could not save preference', error)
      return false
    }
  }

  /** Remove listeners before the plugin or test browser is released. */
  dispose(): void {
    this.closed = true
    this.host?.removeEventListener('storage', this.read)
    this.host?.removeEventListener(CHANGE, this.read)
  }
}
