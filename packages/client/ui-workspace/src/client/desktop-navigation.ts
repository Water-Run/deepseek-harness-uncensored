/** Synchronize the native tray with the same session list that drives the sidebar. */
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { DesktopSessionNavigation } from '@deepseek-ai/dsh-api-session-controller/types'
import type { UiWorkspace } from './navigation.ts'

/**
 * Bind the optional Desktop bridge for this plugin lifetime.
 * @param ctx - Owning plugin context.
 * @param sessions - Authoritative client session list.
 * @param navigation - Main-view session navigation.
 */
export function installDesktopNavigation(ctx: Context, sessions: ISessions, navigation: UiWorkspace): void {
  const bridge = (globalThis as typeof globalThis & { dshDesktop?: { sessions?: DesktopSessionNavigation } }).dshDesktop?.sessions
  if (bridge === undefined) return
  ctx.effect(() => {
    let pending: Promise<void> = Promise.resolve()
    const publish = (): void => {
      const state = sessions.list.getSnapshot()
      const items = state.ids.flatMap((id) => {
        const item = state.byId[id]
        return item === undefined || !item.running || item.parentId !== undefined || item.origin === 'subagent'
          ? [] : [{ sessionId: item.id, title: item.title?.slice(0, 200) ?? '' }]
      }).slice(0, 50)
      pending = pending.then(() => bridge.publish(items)).catch(() => { console.warn('Desktop session menu is unavailable') })
    }
    const offList = sessions.list.subscribe(publish)
    const offOpen = bridge.subscribe((sessionId) => {
      if (sessions.list.getSnapshot().byId[sessionId] !== undefined) navigation.openSession(sessionId)
    })
    publish()
    return async () => {
      offList(); offOpen(); await pending
      try { await bridge.publish([]) }
      catch (_error) { /* The carrier can close before the renderer's plugin teardown. */ }
    }
  }, 'ui-workspace: Desktop session menu')
}
