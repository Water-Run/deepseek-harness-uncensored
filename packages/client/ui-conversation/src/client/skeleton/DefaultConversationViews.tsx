import { useEffect, useRef } from 'react'
import type { ConversationSessionSlotProps } from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import { writeNewConversationDraft } from '../draft.ts'
import { resolveActiveView } from '../view-selection.ts'
import css from './ConversationRoot.module.css'

/** Empty draft used to release the new-conversation slot once it is spent. */
const EMPTY_DRAFT = { text: '', references: [] } as const

/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft persisted while blank Hero chrome is visible. A blank
 * Session also mirrors its draft into the new-conversation slot, so switching
 * to another conversation and starting a new one brings the unsent text back.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function DefaultConversationViews({
  view, compact, fromSeq, useSession, useConversation, useConversationViews, inputActions, useStore, actions,
  renderSlot, bindDraftPersistence, openView, useInspectCall,
}: ConversationSessionSlotProps) {
  const tabs = useConversationViews(value => value)
  const inspectCall = useInspectCall(value => value)
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const viewRequest = useStore(s => s.viewRequest ?? null)
  // The persistence writer is bound for the whole mount, so it reads the
  // current blankness through a ref rather than a stale closure.
  const blank = useRef(session.blank)
  blank.current = session.blank
  const mirrored = useRef(false)

  useEffect(() => {
    const unbindDraftPersistence = bindDraftPersistence((draft) => {
      actions.setDraft(draft)
      if (!blank.current) return
      mirrored.current = true
      writeNewConversationDraft(draft)
    })
    inputActions.persistDraft()
    return () => { unbindDraftPersistence() }
    // The Session input owns content before this persistence writer is attached.
  }, [inputActions])

  useEffect(() => {
    // The slot was spent: its first prompt started a conversation, so the
    // carried draft must not greet the next new conversation.
    if (session.blank || !mirrored.current) return
    mirrored.current = false
    writeNewConversationDraft(EMPTY_DRAFT)
  }, [session.blank])

  if (session.blank && conversationPhase(session, conversation) === 'blank') return null
  const viewId = view ?? active?.id
  return (
    <div className={css.viewArea}>
      {viewId !== undefined && renderSlot('conversation.view', {
        compact, fromSeq,
        inspectCall,
        viewRequest,
        openView,
        completeViewRequest: actions.completeViewRequest,
      }, { only: viewId })}
    </div>
  )
}
