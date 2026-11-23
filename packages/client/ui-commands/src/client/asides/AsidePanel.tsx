/** Native inline and sidebar hosts for the shared Conversation factory. */
import type { PropsRuntime, PropsRenderFactories, PropsRenderSlots, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseOutlineRegular, IconNewChatOutlineRegular, IconLoadingOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InlineAsideController } from './controller.ts'
import { AsideIcon } from './AsideIcon.tsx'
import { AsideStatusLight } from './AsideStatusLight.tsx'
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
export function SidebarAsidePanel({ sessionId, useTabInfo, useResource, SessionProvider, renderSlot, t }: PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'sidebar.aside.conversation'> & PropsLocale<'command'>) {
  const { tab } = useTabInfo()
  const resource = useResource<'aside'>(asideParent(tab.contentId) === undefined ? asideAddress(sessionId) : tab.contentId)
  return <section className={css.sidebar} aria-label={t('aside.side')} data-aside="side">
    <div className={css.context}>{t('aside.inherited')}</div>
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
 * @param props - the current Session, its side-conversation lookup, the open action and localized titles.
 * @returns the status light while the side conversation has a prompt, then the launcher.
 */
export function AsideHeaderAction({ sessionId, useSessions, open, sideOf, t }: PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'command'> & {
  /** Open the side-conversation panel for the current Session. */
  open: () => void
  /** The Session's current persistent side conversation, when one exists. */
  sideOf: (parent: SessionId) => SessionId | undefined
}) {
  const sideId = sideOf(sessionId)
  // A side conversation with no prompt of its own reports no state yet.
  const blank = useSessions(list => sideId === undefined || list.byId[sideId]?.blank !== false)
  const running = useSessions(list => sideId !== undefined && list.byId[sideId]?.running === true)
  return <>
    {!blank && <AsideStatusLight running={running} label={t(running ? 'aside.status.running' : 'aside.status.stopped')} />}
    <Tooltip label={t('aside.side')} side="bottom" portal>
      <button type="button" className={css.launcher} onClick={open} aria-label={t('aside.side')}><AsideIcon size={16} /></button>
    </Tooltip>
  </>
}
