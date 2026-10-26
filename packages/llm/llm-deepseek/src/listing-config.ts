/** Configuration of a route that follows a `/models` listing: cache timing and its validation. */
import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

/** Default deadline of one model-listing request and of a first-use wait. */
export const DEFAULT_MODELS_TIMEOUT_MS = 5_000
/** Default listing age after which the next access refreshes it in the background. */
export const DEFAULT_MODELS_MAX_AGE_MS = 600_000

/** Listing fields of a route Config. */
export interface ModelListingConfig {
  /** Picker allowlist; an empty list offers all usable models without restricting existing requests. */
  visibleModels: Volatile<string[]>
  /** Deadline of one listing request, which also bounds a first-use wait (default five seconds). */
  modelsTimeoutMs: Volatile<number>
  /**
   * Listing age after which the next access refreshes it in the background;
   * a failed load retries after the same age (default ten minutes).
   */
  modelsMaxAgeMs: Volatile<number>
}

/** Schemas of the {@link ModelListingConfig} fields. */
export const modelListingConfigFields = {
  visibleModels: z.array(z.string()).default([]).volatile(),
  modelsTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_MODELS_TIMEOUT_MS).volatile(),
  modelsMaxAgeMs: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MODELS_MAX_AGE_MS).volatile(),
}

/** Plain listing options accepted by {@link resolveListingTiming}. */
export interface ModelListingOptions {
  visibleModels?: string[]
  modelsTimeoutMs?: number
  modelsMaxAgeMs?: number
}

/**
 * Capture the picker's configured model filter without narrowing request resolution.
 * @param options - Raw model-listing settings.
 * @param owner - Provider named in configuration errors.
 * @returns A detached list; an empty list means no filter.
 */
export function resolveVisibleModels(options: ModelListingOptions, owner: string): readonly string[] {
  const visible = options.visibleModels ?? []
  if (!Array.isArray(visible) || visible.some(id => typeof id !== 'string' || id.trim() === '')) {
    throw new Error(`${owner}: visibleModels must contain non-empty model ids`)
  }
  return [...visible]
}

/** Listing cache timing of one configuration generation. */
export interface ListingTiming {
  /** Deadline of one listing request. */
  readonly timeoutMs: number
  /** Listing age after which the next access refreshes it. */
  readonly maxAgeMs: number
}

/** Listing endpoint and cache timing of one configuration generation. */
export interface ListingSettings extends ListingTiming {
  /** Listing endpoint; it always shares the Messages origin. */
  readonly url: string
}

/**
 * Validate listing timing. Settings updates can reach it without schema validation, so every bound is judged here.
 * @param options - plain listing options; absent values take the defaults.
 * @param owner - plugin name that prefixes each failure message.
 * @returns the validated timing.
 * @throws Error when a value is outside its schema bounds.
 */
export function resolveListingTiming(options: ModelListingOptions, owner: string): ListingTiming {
  const { modelsTimeoutMs = DEFAULT_MODELS_TIMEOUT_MS, modelsMaxAgeMs = DEFAULT_MODELS_MAX_AGE_MS } = options
  if (!Number.isFinite(modelsTimeoutMs) || modelsTimeoutMs <= 0 || modelsTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`${owner}: modelsTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  if (!Number.isSafeInteger(modelsMaxAgeMs) || modelsMaxAgeMs < 0) {
    throw new Error(`${owner}: modelsMaxAgeMs must be a non-negative safe integer`)
  }
  return { timeoutMs: modelsTimeoutMs, maxAgeMs: modelsMaxAgeMs }
}
