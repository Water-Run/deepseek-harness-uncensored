/**
 * Cross-conversation memory management, browser half: one General-settings
 * row that opens the manager for stored records. The row stays inside the
 * existing five settings sections; it never adds a sixth navigation group.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings slot types (this package registers a General row).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge and the memory namespace face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { MemoryRow } from './MemoryRow.tsx'
import { createMemoryController } from './memory-controller.ts'
import { en, zh, type MemorySettingsLocaleKey } from './locales.ts'

export type { MemoryRowProps } from './MemoryRow.tsx'
export type { MemoryDraft, MemoryErrorKey, MemoryRowFace, MemoryRowState } from './memory-controller.ts'
export type { MemorySettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Memory management row copy. */
    'settings.memory': MemorySettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.memory'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.memory']

/**
 * Register the memory row into the General settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-memory: dictionaries')
  const controller = createMemoryController(ctx)
  ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'memory',
    order: 8,
    locale: NS,
    inject: () => controller,
  }, MemoryRow)), 'ui-settings-memory: row')
}
