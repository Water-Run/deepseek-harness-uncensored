/** Live, opt-in side context cleanup preference owned by the Host. */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { SettingsRemoteFace } from './reasoning-settings.ts'

/** Current value and read/write availability for the settings row. */
export interface AsideClearSnapshot {
  readonly value: boolean
  readonly writable: boolean
  readonly status: 'loading' | 'ready' | 'saving' | 'unavailable' | 'error'
}

function record(value: JsonValue): Record<string, JsonValue> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

/** Revision-fenced settings writes; unknown deployments cannot enable the switch locally. */
export class AsideClearController {
  private namespace: string | undefined
  private revision: number | undefined
  private value = false

  /** @param settings - Host settings Remote. */
  constructor(private readonly settings: SettingsRemoteFace) {}

  /**
   * Read the Host's current preference.
   * @returns Authoritative value or a disabled unavailable state.
   */
  async load(): Promise<AsideClearSnapshot> {
    const result = await this.settings.describe()
    if (!result.ok) return { status: 'unavailable', value: false, writable: false }
    const view = result.value.namespaces.find(entry => typeof record(entry.value)?.sideClearOnClose === 'boolean')
    if (view === undefined) return { status: 'unavailable', value: false, writable: false }
    this.namespace = view.ns
    this.revision = view.revision
    this.value = record(view.value)?.sideClearOnClose === true
    return { status: 'ready', value: this.value, writable: result.value.writable }
  }

  /**
   * Save a preference with the last observed revision.
   * @param value - Requested preference.
   * @returns Accepted value or a visible failure retaining the previous value.
   */
  async save(value: boolean): Promise<AsideClearSnapshot> {
    if (this.namespace === undefined) return { status: 'unavailable', value: this.value, writable: false }
    const result = await this.settings.update(this.namespace, { sideClearOnClose: value }, this.revision)
    if (!result.ok) return { status: 'error', value: this.value, writable: true }
    this.revision = result.value.revision
    this.value = record(result.value.value)?.sideClearOnClose === true
    return { status: 'ready', value: this.value, writable: true }
  }
}
