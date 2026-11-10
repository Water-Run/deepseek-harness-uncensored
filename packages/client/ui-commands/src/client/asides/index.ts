/** Built-in /side and /btw registration; no separately installed command plugin. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { IconNewChatOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PromptContentPart, SessionForkValue } from '@deepseek-ai/dsh-api-session-controller/types'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { AsideConversation, AsideTitle, AsideHeaderAction, InlineAsidePanel, SidebarAsidePanel, type InlineAsideInjected } from './AsidePanel.tsx'
import { InlineAsideController } from './controller.ts'
import { AsideIcon, AsideGuideIcon } from './AsideIcon.tsx'
import { ASIDE_PREFIX, asideParent } from './address.ts'
import { AsideReasoningRow } from './ReasoningSettings.tsx'
import { AsideReasoningController, type BtwReasoningEffort } from './reasoning-settings.ts'
import { AsideClearController } from './clear-settings.ts'
import { AsideClearRow } from './ClearSettings.tsx'
import type { SubmitOutcome } from '@deepseek-ai/dsh-client-ui-input-trigger/client'

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
    const clear = new AsideClearController(scope.remote.settings)
    scope.slots.inject('settings.general.item', () => scope.slots.register({
      name: 'settings.general.item', id: 'side-clear-on-close', order: 41, locale: 'command',
      inject: () => ({ load: () => clear.load(), save: (value: boolean) => clear.save(value) }),
    }, AsideClearRow))
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
    const requests = new Set<Promise<unknown>>()
    const parents = new Map<SessionId, SessionId>()
    const sides = new Set<SessionId>()
    const lastSide = new Map<SessionId, SessionId>()
    const closing = new Map<SessionId, Promise<unknown>>()
    const changes = new Map<SessionId, Set<() => void>>()
    let closed = false
    const isClosed = (): boolean => closed
    const adoptSide = (parent: SessionId, child: SessionId): void => {
      const previous = lastSide.get(parent)
      if (previous !== undefined && previous !== child) { sides.delete(previous); parents.delete(previous) }
      parents.set(child, parent)
      sides.add(child)
      lastSide.set(parent, child)
    }
    scope.effect(() => async () => { closed = true; await Promise.allSettled([...requests]) }, 'conversation: aside requests')
    const requestChild = async (parent: SessionId, kind: 'side' | 'btw'): Promise<SessionForkValue> => {
      await closing.get(parent)
      const result = await scope.remote.session.aside({ sessionId: parent, kind })
      if (!result.ok) throw result.error
      if (kind === 'side') adoptSide(parent, result.value.sessionId)
      else parents.set(result.value.sessionId, parent)
      await scope.sessions.refresh()
      return result.value
    }
    const create = (parent: SessionId, kind: 'side' | 'btw'): Promise<SessionForkValue> => {
      const pending = requestChild(parent, kind)
      requests.add(pending)
      void pending.then(() => requests.delete(pending), () => requests.delete(pending))
      return pending
    }
    const notifySide = (parent: SessionId): void => { for (const notify of changes.get(parent) ?? []) notify() }
    const reportResetFailure = (id: SessionId, text: string): void => {
      const actx = scope.sessions.scope(id)
      const conversation = actx?.get('conversation')
      if (actx !== undefined && conversation !== undefined) conversation.input.for(actx).notify('error', text)
    }
    scope.effect(() => scope.remote.$on('api-session/side-reset', notifySide), 'conversation: side context changes')
    const resetSide = async (child: SessionId, cause: 'manual' | 'close'): Promise<SubmitOutcome> => {
      const parent = parents.get(child)
      if (parent === undefined || !sides.has(child)) return { kind: 'error', text: t('aside.clearFailed') }
      try {
        const result = await scope.remote.session.resetAside({ sessionId: child, cause })
        if (!result.ok) return { kind: 'error', text: t('aside.clearFailed') }
        if (result.value.sessionId !== child) {
          adoptSide(parent, result.value.sessionId)
          notifySide(parent)
        }
        return { kind: 'success' }
      } catch (_resetFailed) { return { kind: 'error', text: t('aside.clearFailed') } }
    }
    let previousTabs = scope.sidebarRight.openTabs.getSnapshot()
    scope.effect(() => scope.sidebarRight.openTabs.subscribe(() => {
      const current = scope.sidebarRight.openTabs.getSnapshot(), currentIds = new Set(current.map(tab => tab.tabId))
      const removed = previousTabs.filter(tab => tab.kind === 'aside' && !currentIds.has(tab.tabId))
      previousTabs = current
      if (closed) return
      for (const tab of removed) {
        const parent = tab.sessionId, child = lastSide.get(parent)
        if (child === undefined) continue
        const operation = resetSide(child, 'close').then((outcome) => {
          if (outcome.kind === 'error' && !closed) {
            reportResetFailure(parent, t('aside.autoClearFailed'))
          }
        })
        closing.set(parent, operation)
        requests.add(operation)
        const settled = (): void => { if (closing.get(parent) === operation) closing.delete(parent); requests.delete(operation) }
        void operation.then(settled, (error: unknown) => {
          scope.logger.warn(error)
          settled()
        })
      }
    }), 'conversation: actual side tab closure')
    const sendSide = async (parent: SessionId, content: PromptContentPart[]): Promise<SubmitOutcome> => {
      try {
        const child = await create(parent, 'side')
        if (isClosed()) return { kind: 'error', text: t('aside.submitFailed') }
        const reference = scope.sessions.retain(child.sessionId, { source: 'aside' })
        try {
          await reference.ready
          if (isClosed()) return { kind: 'error', text: t('aside.submitFailed') }
          const result = await reference.binding.session.prompt(content, 'queue')
          if (!result.ok && result.error.code === 'session/attachment-invalid' && result.error.details.reason === 'MODEL_DOES_NOT_SUPPORT_IMAGES') {
            return { kind: 'error', text: t('aside.imageModelUnsupported') }
          }
          return result.ok ? { kind: 'success' } : { kind: 'error', text: t('aside.submitFailed') }
        } finally { reference.release() }
      } catch (_sendFailed) {
        return { kind: 'error', text: t('aside.submitFailed') }
      }
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
      parents.delete(id)
      sides.delete(id)
      lastSide.delete(parent ?? id)
      for (const tab of scope.sidebarRight.openTabs.getSnapshot()) {
        if (tab.sessionId === id || (tab.sessionId === parent && tab.kind === 'aside')) scope.sidebarRight.close(tab.tabId)
      }
    }), 'conversation: deleted aside resources')
    const provider: ResourceProvider<'aside'> = {
      protocol: 'aside',
      async *open(address, { signal }) {
        const parent = asideParent(address)
        if (parent === undefined) throw new Error('Invalid side conversation address')
        let wake = Promise.withResolvers<void>(), dirty = false
        const unavailable = (): boolean => signal.aborted || isClosed()
        const hasUpdate = (): boolean => dirty
        const notify = (): void => { dirty = true; wake.resolve() }
        const listeners = changes.get(parent) ?? new Set<() => void>()
        listeners.add(notify); changes.set(parent, listeners)
        signal.addEventListener('abort', notify, { once: true })
        let reference: SessionReference | undefined
        try {
          while (!unavailable()) {
            dirty = false; wake = Promise.withResolvers<void>()
            let child: SessionForkValue, incoming: SessionReference | undefined
            try {
              child = await create(parent, 'side')
              if (unavailable()) return
              incoming = scope.sessions.retain(child.sessionId, { source: 'aside', signal })
              await incoming.ready
            }
            catch (requestFailed) {
              incoming?.release()
              if (!unavailable()) yield { ok: false, error: remoteErrorOf(requestFailed) ?? new RemoteError('gateway/internal', t('aside.failed'), {}) }
              if (!hasUpdate() && !unavailable()) await wake.promise
              continue
            }
            if (unavailable()) { incoming.release(); return }
            const previous = reference
            reference = incoming
            try { yield { ok: true, value: { reference, fromSeq: child.inheritedEventCount ?? 0 } } }
            finally { previous?.release() }
            if (!hasUpdate() && !unavailable()) await wake.promise
          }
        } finally {
          reference?.release()
          signal.removeEventListener('abort', notify)
          listeners.delete(notify)
          if (listeners.size === 0) changes.delete(parent)
        }
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
      ui: { kind: 'input', attachments: true, hint: () => t('aside.placeholder'),
        runEmpty: () => { if (!closed) scope.sidebarRight.openTab('aside') }, submit: async (session, question, attachments = []) => {
          if (closed) return { kind: 'error', text: t('aside.submitFailed') }
          const images = attachments.filter(part => part.type === 'image')
          if (images.length !== attachments.length) return { kind: 'error', text: t('aside.imageOnly') }
          scope.sidebarRight.openTab('aside')
          const text = question.trim() ? [{ type: 'text' as const, text: question }] : []
          if (text.length === 0 && images.length === 0) return { kind: 'success' }
          const pending = sendSide(session.sessionId, [...images, ...text])
          requests.add(pending)
          try { return await pending }
          finally { requests.delete(pending) }
        } },
    }), 'conversation: /side')
    scope.effect(() => scope.commandUi.register({ name: 'clear',
      label: () => t('aside.clear'), description: () => t('aside.clearDescription'), icon: AsideIcon,
      available: session => sides.has(session.sessionId),
      ui: { kind: 'action', run: (session) => {
        const operation = resetSide(session.sessionId, 'manual').then((outcome) => {
          if (outcome.kind === 'error' && !closed) reportResetFailure(session.sessionId, t('aside.clearFailed'))
        })
        requests.add(operation)
        const settled = (): void => { requests.delete(operation) }
        void operation.then(settled, (error: unknown) => { scope.logger.warn(error); settled() })
      } },
    }), 'conversation: /clear (side only)')
    scope.effect(() => () => { closed = true }, 'conversation: stop aside admissions before releasing resources')
  })
}
