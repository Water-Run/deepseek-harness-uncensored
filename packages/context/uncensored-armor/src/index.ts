/**
 * The built-in armor prompt of DeepSeek Harness Uncensored. It is a
 * first-party prompt section, not an injected file: assembly, logging, replay,
 * and compaction all treat it like every other section, and the mounted text
 * is part of the published package rather than a runtime rewrite of built
 * artifacts.
 *
 * @module @deepseek-ai/dsh-uncensored-armor
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { ARMOR_EN } from './armor.en.ts'
import { ARMOR_ZH } from './armor.zh.ts'

/** Stable Cordis plugin name. */
export const name = 'uncensored-armor'

/** The prompt registry this plugin contributes to. */
export const inject = ['systemPrompt']

/** Prompt-section name the armor occupies; one armor section exists per assembly. */
export const ARMOR_SECTION = 'uncensored:armor'

/**
 * Armor language. `zh` and `en` are the two shipped texts; `none` mounts no
 * armor and leaves the operator's own sections untouched.
 */
export type ArmorLanguage = 'zh' | 'en' | 'none'

/** Which shipped armor text this deployment mounts. */
export interface Config {
  /** Armor language; defaults to `zh`. */
  language?: ArmorLanguage
}

export const Config: z<Config> = z.object({
  language: z.union([z.const('zh'), z.const('en'), z.const('none')]).default('zh'),
})

/** The shipped text for each language that mounts armor. */
const ARMOR_TEXT: Record<Exclude<ArmorLanguage, 'none'>, string> = {
  zh: ARMOR_ZH,
  en: ARMOR_EN,
}

/**
 * Armor sorts ahead of the identity section so the operating rules precede
 * every other instruction the harness adds after it.
 */
const ARMOR_ORDER_OFFSET = 1000

/**
 * Mount the configured armor text as the first prompt section.
 * @param ctx - plugin context with the `systemPrompt` registry.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const language = config.language ?? 'zh'
  if (language === 'none') return
  ctx.systemPrompt.section({
    name: ARMOR_SECTION,
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY') - ARMOR_ORDER_OFFSET,
    // The armor carries no prompt variables; literal registration keeps any
    // `{{` an operator's own text may contain from becoming a strict reference.
    interpolate: false,
    text: ARMOR_TEXT[language],
  })
}
