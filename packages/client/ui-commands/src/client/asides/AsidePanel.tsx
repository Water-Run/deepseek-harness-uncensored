/** Native inline and sidebar hosts for the shared Conversation factory. */
import type { PropsRuntime, PropsRenderFactories, PropsRenderSlots, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseOutlineRegular, IconNewChatOutlineRegular, IconLoadingOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InlineAsideController } from './controller.ts'
import { AsideIcon } from './AsideIcon.tsx'
import { asideAddress, asideParent } from './address.ts'
import css from './AsidePanel.module.css'

/** Session-scoped callbacks and observable inline window state. */
export interface InlineAsideInjected {
  hooks: { inlineAside: InlineAsideController['state'] }
  close(): void
  retry(): void
}

type InlineProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'command'>
  & PropsRenderSlots<'conversation.input.aside'> & InjectFace<InlineAsideInjected>

/** Render one independent quick-question window above the parent's composer. */
export function InlineAsidePanel({ sessionId, useInlineAside, SessionProvider, renderSlot, close, retry, t }: InlineProps) {
  const state = useInlineAside(value => value.get(sessionId))
  if (state === undefined) return null
  return <section className={css.inline} aria-label={t('aside.btw')} data-aside="btw">
    <header className={css.header}>
      <IconNewChatOutlineRegular />
      <span>{t('aside.btw')}</span>
      <span className={css.hint}>{t('aside.fresh')}</span>
      <Tooltip label={t('aside.close')} side="top" portal>
        <button type="button" onClick={close} aria-label={t('aside.close')} className={css.close}><IconCloseOutlineRegular /></button>
      </Tooltip>
    </header>
    <div className={css.content}>
      {state.status === 'ready'
        ? <SessionProvider session={state.reference}>{renderSlot('conversation.input.aside', {})}</SessionProvider>
        : state.status === 'failed'
          ? <div className={css.state} role="alert"><span>{t('aside.inlineFailed')}</span><button type="button" onClick={retry}>{t('aside.retry')}</button></div>
          : <div className={css.state} role="status" aria-label={t('aside.loading')}><IconLoadingOutlineRegular size={20} className={css.spinner} /></div>}
    </div>
  </section>
}

function ChatView({ renderSlot }: ConversationViewsProps) {
  return <>{renderSlot('conversation.session', { view: 'chat' })}</>
}

/** Render a compact child Conversation without the new-task hero or workspace picker. */
export function AsideConversation({ renderFactorySlot, t, kind }: PropsRuntime<'conversation.input.aside'> & PropsRenderFactories & PropsLocale<'command'> & { kind: 'side' | 'btw' }) {
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false, placeholder: t(kind === 'side' ? 'aside.placeholder' : 'aside.btwPlaceholder') }, { slots: { views: ChatView } })
}

/** Bind a sidebar resource to the child session; resource failures stay visible in the panel. */
export function SidebarAsidePanel({ sessionId, useTabInfo, useResource, SessionProvider, renderSlot, t }: PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'sidebar.aside.conversation'> & PropsLocale<'command'>) {
  const { tab } = useTabInfo()
  const resource = useResource<'aside'>(asideParent(tab.contentId) === undefined ? asideAddress(sessionId) : tab.contentId)
  return <section className={css.sidebar} aria-label={t('aside.side')} data-aside="side">
    <div className={css.context}>{t('aside.inherited')}</div>
    {resource.value === undefined
      ? resource.status === 'failed'
        ? <div className={css.state} role="alert">{t('aside.failed')}</div>
        : <div className={css.state} role="status" aria-label={t('aside.loading')}><IconLoadingOutlineRegular size={20} className={css.spinner} /></div>
      : <SessionProvider session={resource.value.reference}>{renderSlot('sidebar.aside.conversation', {})}</SessionProvider>}
  </section>
}

/** Sidebar title with a distinct fork glyph. */
export function AsideTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>) {
  return <><AsideIcon size={16} />{useTabInfo().tab.title}</>
}
