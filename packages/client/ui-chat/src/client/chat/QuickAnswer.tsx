/** One short question and its answer, without full transcript controls. */
import { MarkdownText, IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import type { ChatNode } from '../contract/chat-nodes.ts'
import { markdownLabels } from '../markdown-labels.ts'
import css from './QuickAnswer.module.css'

/**
 * Render the current one-shot exchange from the existing Chat projection.
 * @param props - Session and Chat hooks with localized status copy.
 * @returns A compact question, streamed answer and visible failure state.
 */
export function QuickAnswer({ useChat, useSession, t }: Pick<ChatViewSlotProps, 'useChat' | 'useSession' | 't'>) {
  const question = useChat((snapshot) => {
    for (const key of snapshot.order) {
      const node = snapshot.nodes.get(key)
      if (node?.kind === 'user') return (node as ChatNode<'user'>).data.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
    }
    return ''
  })
  const answer = useChat((snapshot) => {
    for (const key of snapshot.order.toReversed()) {
      const node = snapshot.nodes.get(key)
      if (node?.kind === 'assistant-step') return (node as ChatNode<'assistant-step'>).data.blocks
        .flatMap(block => block.kind === 'text' ? [block.text] : []).join('\n')
    }
    return ''
  })
  const failure = useChat((snapshot) => {
    for (const key of snapshot.order.toReversed()) {
      const node = snapshot.nodes.get(key)
      if (node?.kind === 'turn-error') return (node as ChatNode<'turn-error'>).data.message
    }
    return ''
  })
  const running = useSession(state => state.running)
  const openError = useSession(state => state.openError?.message ?? state.lastAgentError)
  return <div className={css.answer}>
    {question && <p className={css.question}>{question}</p>}
    {answer && <MarkdownText text={answer} streaming={running} labels={markdownLabels(t)} variant="compact" tone="primary" />}
    {(failure || openError) && <p className={css.error} role="alert">{failure || openError}</p>}
    {running && <span className={css.pending} role="status" aria-label={t('quick.answering')}><IconLoadingOutlineRegular size={14} /></span>}
  </div>
}
