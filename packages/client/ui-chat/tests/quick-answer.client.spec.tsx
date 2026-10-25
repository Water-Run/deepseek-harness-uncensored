// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { QuickAnswer } from '../src/client/chat/QuickAnswer.tsx'
import { zh } from '../src/client/locale.ts'
import { chatSnapshotFixture } from './chat-snapshot-fixture.client.ts'

afterEach(cleanup)

it('shows one compact question and streamed answer without reasoning, timestamps or a follow-up input', () => {
  const chat = createSnapshotStore(chatSnapshotFixture({ nodes: [
    { kind: 'user', seq: 1, time: 1000, content: [{ type: 'text', text: '进度如何？' }], source: null },
    { kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1, blocks: [
      { kind: 'reasoning', text: 'Internal reasoning should stay out of the quick answer' },
      { kind: 'text', text: '已经完成检查，正在整理结果。' },
    ] },
  ] }))
  const session = createSnapshotStore<SessionSnapshot>({ sessionId: SessionId('quick'), running: true, pendingSubmissions: [],
    removed: false, subagent: null, openState: 'open', openError: null, hasMore: false, loadingOlder: false,
    promptError: null, blank: false, lastAgentError: null, promptAttempted: true, awaitingFirstTurn: false })
  render(<QuickAnswer useChat={bindSnapshotSelector(chat)} useSession={bindSnapshotSelector(session)} t={makeTranslate(zh, commonZh)} />)
  expect(screen.getByText('进度如何？')).toBeTruthy()
  expect(screen.getByText('已经完成检查，正在整理结果。')).toBeTruthy()
  expect(screen.queryByText(/Internal reasoning/u)).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByRole('status').getAttribute('aria-label')).toBe('正在回答')
  act(() => { session.set({ ...session.getSnapshot(), running: false, lastAgentError: '连接中断' }) })
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('alert').textContent).toBe('连接中断')
})
