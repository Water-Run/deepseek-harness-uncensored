/** Main-conversation notices receive the same live mode used by its picker and theme. @module */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CurrentModeState } from './AgentPresetSection.tsx'

/** Mode observation injected by its existing owner. */
export interface ModeNoticeInjected { hooks: { currentMode: SnapshotStore<CurrentModeState> } }

type Props = PropsRuntime<'conversation.header.notices'> & PropsRenderSlots<'conversation.mode.notice'> & InjectFace<ModeNoticeInjected>

/** @param props - Bound mode observation and authorized notice slot. @returns Current-mode notices. */
export function ModeNoticeHost({ useCurrentMode, renderSlot }: Props) {
  const modeId = useCurrentMode(state => state.id)
  return <>{renderSlot('conversation.mode.notice', { modeId })}</>
}
