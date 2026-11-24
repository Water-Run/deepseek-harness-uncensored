/** Native inline and sidebar hosts for the shared Conversation factory. */
import { useEffect } from 'react'
import type { PropsRuntime, PropsRenderFactories, PropsRenderSlots, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseOutlineRegular, IconNewChatOutlineRegular, IconLoadingOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InlineAsideController } from './controller.ts'
import { AsideIcon } from './AsideIcon.tsx'
import { canClearSide, newestSide, sideMetadata, type AsideReads } from './read-status.ts'
import { asideAddress, asideParent } from './address.ts'
import css from './AsidePanel.module.css'

/** Session-scoped callbacks and observable inline window state. */
export interface InlineAsideInjected {
  hooks: { inlineAside: InlineAsideController['state'] }
  close(): void
}

type InlineProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'command'>
  & PropsRenderSlots<'conversation.input.aside'> & InjectFace<InlineAsideInjected>

/** Render one independent quick-question window above the parent's composer. */
export function InlineAsidePanel({ sessionId, useInlineAside, SessionProvider, renderSlot, close, t }: InlineProps) {
  const state = useInlineAside(value => value.get(sessionId))
  if (state === undefined) return null
  return <section className={css.inline} aria-label={t('aside.btw')} data-aside="btw">
    <header className={css.header}>
      <IconNewChatOutlineRegular />
      <span>{t('aside.btw')}</span>
      <Tooltip label={t('aside.close')} side="top" portal>
        <button type="button" onClick={close} aria-label={t('aside.close')} className={css.close}><IconCloseOutlineRegular /></button>
      </Tooltip>
    </header>
    {state.status === 'ready' && state.submitFailed && <p role="alert" className={css.notice}>{t('aside.submitFailed')}</p>}
    <div className={css.content}>
      {state.status === 'ready'
        ? <SessionProvider session={state.reference}>{renderSlot('conversation.input.aside', {})}</SessionProvider>
        : state.status === 'failed'
          ? <div className={css.state} role="alert">{t('aside.inlineFailed')}</div>
          : <div className={css.state} role="status" aria-label={t('aside.loading')}><IconLoadingOutlineRegular size={20} className={css.spinner} /></div>}
    </div>
  </section>
}

function ChatView({ renderSlot, fromSeq }: ConversationViewsProps) {
  return <>{renderSlot('conversation.session', { view: 'chat', fromSeq })}</>
}

function QuickAnswerView({ renderSlot }: ConversationViewsProps) {
  return renderSlot('conversation.session', { view: 'chat', compact: true })
}

/** Render a compact child Conversation without the new-task hero or workspace picker. */
export function AsideConversation({ renderFactorySlot, t, kind, fromSeq }: PropsRuntime<'conversation.input.aside'> & PropsRenderFactories & PropsLocale<'command'> & { kind: 'side' | 'btw'; fromSeq?: number }) {
  return renderFactorySlot('conversation.content', {
    variant: 'embedded', phase: 'active', hero: false, composer: kind === 'side', placeholder: t('aside.placeholder'), fromSeq,
  }, { slots: { views: kind === 'btw' ? QuickAnswerView : ChatView } })
}

/** Bind a sidebar resource to the child session; resource failures stay visible in the panel. */
export function SidebarAsidePanel({ sessionId, useSessions, useTabInfo, useResource, SessionProvider, renderSlot, t, markRead, clear }:
  PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'sidebar.aside.conversation'> & PropsLocale<'command'>
  & { markRead: (child: SessionId, seq: number) => void; clear: (child: SessionId) => void }) {
  const { tab } = useTabInfo()
  const resource = useResource<'aside'>(asideParent(tab.contentId) === undefined ? asideAddress(sessionId) : tab.contentId)
  const child = resource.value?.reference.sessionId
  const seq = useSessions(list => sideMetadata(list, child)?.result?.seq)
  const asked = useSessions(list => sideMetadata(list, child)?.asked === true)
  const clearable = canClearSide(child, asked)
  useEffect(() => {
    if (!tab.visible || resource.status !== 'live' || child === undefined || seq === undefined) return
    const acknowledge = () => { if (document.visibilityState === 'visible') markRead(child, seq) }
    acknowledge()
    document.addEventListener('visibilitychange', acknowledge)
    return () => document.removeEventListener('visibilitychange', acknowledge)
  }, [child, seq, tab.visible, resource.status, markRead])
  return <section className={css.sidebar} aria-label={t('aside.side')} data-aside="side">
    <div className={css.context}>
      <span>{t('aside.inherited')}</span>
      <button type="button" className={css.clearHistory} disabled={!clearable}
        onClick={() => { if (child !== undefined && clearable) clear(child) }}>{t('aside.clearHistory')}</button>
    </div>
    {resource.status === 'failed' && resource.value !== undefined && <p role="alert" className={css.notice}>{t('aside.failed')}</p>}
    {resource.value === undefined
      ? resource.status === 'failed'
        ? <div className={css.state} role="alert">{t('aside.failed')}</div>
        : <div className={css.state} role="status" aria-label={t('aside.loading')}><IconLoadingOutlineRegular size={20} className={css.spinner} /></div>
      : <SessionProvider session={resource.value.reference}>{renderSlot('sidebar.aside.conversation', { fromSeq: resource.value.fromSeq })}</SessionProvider>}
  </section>
}

/**
 * Render the side-question title in the current locale.
 * @param props - Locale supplied by the title slot.
 * @returns Fork glyph and localized label.
 */
export function AsideTitle({ t }: PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'command'>) {
  return <><AsideIcon size={16} />{t('aside.side')}</>
}

/**
 * Render the side-question shortcut and the state of the Session's side conversation.
 * @param props - the current Session, read position, open action and localized titles.
 * @returns the launcher with a status light after its side conversation receives a prompt.
 */
export function AsideHeaderAction({ sessionId, useSessions, useSessionStatus, useAsideRead, open, t }:
  PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'command'>
  & InjectFace<{ hooks: { asideRead: ReturnType<AsideReads['for']> }; open: () => void }>) {
  const child = useSessions(list => newestSide(list, sessionId))
  const side = useSessions(list => sideMetadata(list, child))
  const running = useSessionStatus(statuses => child !== undefined && statuses.get(child)?.running)
  const listedRunning = useSessions(list => child !== undefined && list.byId[child]?.running)
  const read = useAsideRead(value => value)
  const state = !side?.asked ? undefined : (running ?? listedRunning) ? 'running' : side.result?.interrupted ? 'interrupted'
    : side.result && !(read && read.child === child && read.seq >= side.result.seq) ? 'unread' : 'read'
  const label = state ? t(`aside.status.${state}`) : t('aside.side')
  return <Tooltip label={label} side="bottom" portal>
    <button type="button" className={css.launcher} onClick={open} aria-label={t('aside.side')} aria-description={state && label}>
      <AsideIcon size={16} />
      {state && <span aria-hidden="true" className={css.light} data-aside-status={state} />}
    </button>
  </Tooltip>
}
