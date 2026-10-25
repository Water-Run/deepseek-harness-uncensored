/**
 * Quick-question reasoning preference. The level lives in the Host
 * session-controller settings namespace as a live (volatile) field, so the
 * same value that Settings shows is what the next /btw child is created with.
 */

import type {
  SettingsDescribeValue, SettingsNamespaceView,
} from '@deepseek-ai/dsh-settings/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Levels the quick question may select; 'low' is the Host default. */
export type BtwReasoningEffort = 'off' | 'low' | 'high' | 'max'

/** Ordered levels offered by the settings row. */
export const BTW_REASONING_EFFORTS: readonly BtwReasoningEffort[] = ['off', 'low', 'high', 'max']

/** Settings field name inside the session-controller namespace. */
const EFFORT_FIELD = 'btwReasoningEffort'

/** The narrowed settings Remote surface this row consumes. */
export interface SettingsRemoteFace {
  describe(): Promise<RemoteResult<SettingsDescribeValue>>
  update(ns: string, patch: Record<string, JsonValue>, expectedRevision?: number): Promise<RemoteResult<SettingsNamespaceView>>
}

/** Row state after a read or write. */
export interface AsideReasoningSnapshot {
  status: 'loading' | 'ready' | 'saving' | 'unavailable' | 'error'
  value: BtwReasoningEffort
  writable: boolean
}

/** Narrow an arbitrary JSON value to a plain object. */
function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read a stored level, falling back to the Host default. */
function effortOf(value: JsonValue | undefined): BtwReasoningEffort {
  return typeof value === 'string' && (BTW_REASONING_EFFORTS as readonly string[]).includes(value)
    ? value as BtwReasoningEffort
    : 'low'
}

/** Reads and writes the live setting through the settings Remote namespace. */
export class AsideReasoningController {
  private namespace: string | undefined
  private revision: number | undefined

  /** @param settings - the settings Remote namespace. */
  constructor(private readonly settings: SettingsRemoteFace) {}

  /**
   * Locate the namespace that owns the field and read its current level.
   * The namespace id is discovered from the field instead of assuming one
   * profile entry name, so renamed entries keep the row working.
   * @returns the row snapshot.
   */
  async load(): Promise<AsideReasoningSnapshot> {
    const result = await this.settings.describe()
    if (!result.ok) return { status: 'unavailable', value: 'low', writable: false }
    const view = result.value.namespaces.find(entry => isRecord(entry.value) && Object.hasOwn(entry.value, EFFORT_FIELD))
    if (view === undefined) return { status: 'unavailable', value: 'low', writable: false }
    this.namespace = view.ns
    this.revision = view.revision
    return { status: 'ready', value: effortOf((view.value as Record<string, JsonValue>)[EFFORT_FIELD]), writable: result.value.writable }
  }

  /**
   * Persist one level with revision fencing and project the accepted value back.
   * @param value - selected level.
   * @returns the row snapshot after the write.
   */
  async save(value: BtwReasoningEffort): Promise<AsideReasoningSnapshot> {
    if (this.namespace === undefined) return { status: 'unavailable', value, writable: false }
    const response = await this.settings.update(this.namespace, { [EFFORT_FIELD]: value }, this.revision)
    if (!response.ok) return { status: 'error', value, writable: true }
    this.revision = response.value.revision
    const accepted = isRecord(response.value.value) ? effortOf(response.value.value[EFFORT_FIELD]) : value
    return { status: 'ready', value: accepted, writable: true }
  }
}
