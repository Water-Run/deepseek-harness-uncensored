/** Built-in /side and /btw registration; no separately installed command plugin. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { IconNewChatOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionForkValue } from '@deepseek-ai/dsh-api-session-controller/types'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { AsideConversation, AsideTitle, AsideHeaderAction, InlineAsidePanel, SidebarAsidePanel, type InlineAsideInjected } from './AsidePanel.tsx'
import { InlineAsideController } from './controller.ts'
import { AsideIcon, AsideGuideIcon } from './AsideIcon.tsx'
import { ASIDE_PREFIX, asideParent } from './address.ts'
import { AsideReasoningRow } from './ReasoningSettings.tsx'
import { AsideReasoningController, type BtwReasoningEffort } from './reasoning-settings.ts'

const TYPE = '@deepseek-ai/dsh-client-ui-commands/aside'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { aside: unknown }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { aside: { readonly reference: SessionReference; readonly fromSeq: number } }
  interface SlotMap {
    /**
     * Register the inline quick-question panel in the main composer. It receives
     * the owning main Session's standard props. Replacing this single entry
     * replaces the built-in panel; absence leaves the composer without one.
     */
    'conversation.input.aside': { kind: 'single'; scope: 'session' }
    /**
     * Register the body of a side-question tab. It receives the child Session's
     * standard props and the owner's fromSeq visibility cutoff. Replacing the
     * entry replaces the built-in conversation view; absence leaves the body empty.
     */
    'sidebar.aside.conversation': { kind: 'single'; scope: 'session'; owner: { fromSeq: number } }
  }
}

/**
 * Register the General Settings row for the quick-question reasoning level.
 * Kept apart from the command surfaces: a composition without the Settings
 * Remote still registers `/side` and `/btw`, and this row joins once Settings
 * is available.
 * @param ctx - client root context owning the slots and the Settings Remote.
 */
function registerAsideSettings(ctx: Context): void {
  ctx.inject(['slots', 'locale', 'remote.settings'], (scope) => {
    const reasoning = new AsideReasoningController(scope.remote.settings)
    scope.slots.inject('settings.general.item', () => scope.slots.register({
      name: 'settings.general.item', id: 'quick-question-reasoning', order: 40, locale: 'command',
      inject: () => ({
        load: () => reasoning.load(),
        save: (value: BtwReasoningEffort) => reasoning.save(value),
      }),
    }, AsideReasoningRow))
  })
}

/**
 * Mount the native commands and both child conversation surfaces.
 * @param ctx - Built-in command UI owner.
 */
export function registerAsides(ctx: Context): void {
  // The quick-question level row needs the Settings Remote; it waits for that
  // service on its own, so a composition without Settings still gets the
  // /side and /btw commands.
  registerAsideSettings(ctx)
  ctx.inject(['slots', 'commandUi', 'resources', 'sidebarRight', 'sidebarRightTabs', 'remote.session'], (scope) => {
    const t = scope.locale.bind('command')
    const requests = new Set<Promise<SessionForkValue>>()
    const parents = new Map<SessionId, SessionId>()
    let closed = false
    scope.effect(() => async () => { closed = true; await Promise.allSettled([...requests]) }, 'conversation: aside requests')
    const requestChild = async (parent: SessionId, kind: 'side' | 'btw'): Promise<SessionForkValue> => {
      const result = await scope.remote.session.aside({ sessionId: parent, kind })
      if (!result.ok) throw result.error
      parents.set(result.value.sessionId, parent)
      await scope.sessions.refresh()
      return result.value
    }
    const create = (parent: SessionId, kind: 'side' | 'btw'): Promise<SessionForkValue> => {
      const pending = requestChild(parent, kind)
      requests.add(pending)
      void pending.then(() => requests.delete(pending), () => requests.delete(pending))
      return pending
    }
    const inline = new InlineAsideController(async (parent) => {
      const reference = scope.sessions.retain((await create(parent, 'btw')).sessionId, { source: 'aside' })
      try { await reference.ready; return reference }
      catch (error) { reference.release(); throw error }
    }, async (reference, question) => {
      const result = await reference.binding.session.prompt([{ type: 'text', text: question }], 'queue')
      if (!result.ok) throw result.error
    })
    scope.effect(() => () => inline.dispose(), 'conversation: inline questions')
    scope.effect(() => scope.remote.$on('api-session/deleted', (id) => {
      inline.hide(id)
      for (const [parent, state] of inline.state.getSnapshot()) {
        if (state.status === 'ready' && state.reference.sessionId === id) inline.hide(parent)
      }
      const parent = parents.get(id)
      for (const tab of scope.sidebarRight.openTabs.getSnapshot()) {
        if (tab.sessionId === id || (tab.sessionId === parent && tab.kind === 'aside')) scope.sidebarRight.close(tab.tabId)
      }
      parents.delete(id)
    }), 'conversation: deleted aside resources')
    const provider: ResourceProvider<'aside'> = {
      protocol: 'aside',
      async *open(address, { signal }) {
        const parent = asideParent(address)
        if (parent === undefined) throw new Error('Invalid side conversation address')
        let child: SessionForkValue
        try { child = await create(parent, 'side') }
        catch (requestFailed) {
          if (!signal.aborted && !closed) yield { ok: false, error: remoteErrorOf(requestFailed) ?? new RemoteError('gateway/internal', t('aside.failed'), {}) }
          return
        }
        if (signal.aborted || closed) return
        const reference = scope.sessions.retain(child.sessionId, { source: 'aside', signal })
        try {
          yield { ok: true, value: { reference, fromSeq: child.inheritedEventCount ?? 0 } }
          await new Promise<void>((resolve) => {
            if (signal.aborted) resolve()
            else signal.addEventListener('abort', () => { resolve() }, { once: true })
          })
        } finally { reference.release() }
      },
    }
    scope.effect(() => scope.resources.register(provider), 'conversation: side resources')
    scope.effect(() => scope.sidebarRightTabs.register({ id: TYPE, kind: 'aside', priority: 'builtin', patterns: [`${ASIDE_PREFIX}**`],
      title: () => t('aside.side'), canOpen: address => asideParent(address) !== undefined,
      guide: [{ id: 'aside', order: 30, title: () => t('aside.side'), description: () => t('aside.sideDescription'), icon: AsideGuideIcon, preserveGuide: true }],
    }), 'conversation: side tab')
    scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities', id: 'side-question', order: 100, locale: 'command',
      inject: () => ({ open: () => { scope.sidebarRight.openTab('aside') } }),
    }, AsideHeaderAction))
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab', key: TYPE, locale: 'command',
      children: { 'sidebar.aside.conversation': { kind: 'single', scope: 'session' } } }, SidebarAsidePanel))
    scope.slots.inject('sidebar.right.pane.tab.title', () => scope.slots.register({ name: 'sidebar.right.pane.tab.title', key: TYPE, locale: 'command' }, AsideTitle))
    scope.slots.inject('sidebar.aside.conversation', () => scope.slots.register({ name: 'sidebar.aside.conversation', locale: 'command', inject: () => ({ kind: 'side' as const }) }, AsideConversation))
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({ name: 'conversation.input.dock', id: 'btw', order: -20, locale: 'command',
      children: { 'conversation.input.aside': { kind: 'single', scope: 'session' } },
      inject: (parent: SessionId): InlineAsideInjected => ({
        hooks: { inlineAside: inline.state }, close: () => { inline.hide(parent) },
      }),
    }, InlineAsidePanel))
    scope.slots.inject('conversation.input.aside', () => scope.slots.register({ name: 'conversation.input.aside', locale: 'command',
      inject: () => ({ kind: 'btw' as const }),
    }, AsideConversation))
    scope.effect(() => scope.commandUi.register({ name: 'btw',
      label: () => t('aside.btw'), description: () => t('aside.btwDescription'), icon: IconNewChatOutlineRegular,
      available: session => session.sessionId === scope.sidebarRight.mounted.getSnapshot(),
      ui: { kind: 'input', hint: () => t('aside.btwHint'), submit: async (session, question) => {
        if (!question.trim()) return { kind: 'error', text: t('aside.btwRequired') }
        return await inline.ask(session.sessionId, question) ? { kind: 'success' } : { kind: 'error', text: t('aside.submitFailed') }
      } },
    }), 'conversation: /btw')
    scope.effect(() => scope.commandUi.register({ name: 'side',
      label: () => t('aside.side'), description: () => t('aside.sideDescription'), icon: AsideIcon,
      available: session => session.sessionId === scope.sidebarRight.mounted.getSnapshot(),
      ui: { kind: 'action', run: (session) => {
        for (const tab of scope.sidebarRight.openTabs.getSnapshot()) {
          if (tab.sessionId === session.sessionId && tab.kind === 'aside' && tab.contentId.startsWith(ASIDE_PREFIX)) scope.sidebarRight.close(tab.tabId)
        }
        if (!scope.sidebarRight.openTabs.getSnapshot().some(tab => tab.sessionId === session.sessionId && tab.kind === 'guide')) scope.sidebarRight.openTab('guide')
        scope.sidebarRight.openTab('aside')
      } },
    }), 'conversation: /side')
  })
}
