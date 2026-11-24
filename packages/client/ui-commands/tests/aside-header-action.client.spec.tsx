// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { AsideHeaderAction } from '../src/client/asides/AsidePanel.tsx'
import { AsideReads, newestSide } from '../src/client/asides/read-status.ts'

afterEach(cleanup)

const PARENT = SessionId('session-main')
const SIDE = SessionId('session-side-0')

function listWith(side: Partial<SessionSummary> | undefined): SessionListState {
  const row: SessionSummary = {
    id: SIDE, parentId: PARENT, displayTitle: 'Side', running: false, retainedBy: {}, blank: false, updatedAt: 2,
  }
  return {
    ids: side === undefined ? [PARENT] : [PARENT, SIDE],
    byId: { [PARENT]: { ...row, id: PARENT, parentId: undefined, displayTitle: 'Main' }, ...side === undefined ? {} : { [SIDE]: { ...row, ...side } } },
    phase: 'ready',
    projectionsBySession: {},
  } as SessionListState
}

function props(side: Partial<SessionSummary> | undefined, seq?: number) {
  return {
    sessionId: PARENT,
    t: (key: string) => key,
    open: vi.fn(),
    useSessionStatus: (select: (statuses: Map<SessionId, never>) => unknown) => select(new Map<SessionId, never>()),
    useAsideRead: (select: (read: { child: SessionId; seq: number } | null) => unknown) =>
      select(seq === undefined ? null : { child: SIDE, seq }),
    useSessions: (selector: (state: SessionListState) => unknown) => selector(listWith(side)),
  } as Parameters<typeof AsideHeaderAction>[0]
}

function statusOf(container: HTMLElement): string | null | undefined {
  return container.querySelector('[data-aside-status]')?.getAttribute('data-aside-status')
}

it('keeps the launcher alone without a side conversation', () => {
  const view = render(<AsideHeaderAction {...props(undefined)} />)
  expect(statusOf(view.container)).toBeUndefined()
  expect(view.container.querySelector('button')?.getAttribute('aria-label')).toBe('aside.side')
})

it('leaves an unasked side conversation without a light', () => {
  const view = render(<AsideHeaderAction {...props({ blank: true })} />)
  expect(statusOf(view.container)).toBeUndefined()
})

it.each([
  [false, true, false, undefined, undefined],
  [true, true, true, 9, 'running'],
  [true, false, false, 8, 'unread'],
  [true, false, false, 9, 'read'],
  [true, false, true, 9, 'interrupted'],
] as const)('renders asked=%s running=%s interrupted=%s read=%s as %s', (asked, running, interrupted, seq, expected) => {
  const metadata = { blank: false, lastPromptAt: 0, side: { generation: 0, fromSeq: 0, asked, result: { seq: 9, interrupted } } }
  const input = props({ running, projectionValues: { sessionListMetadata: metadata } }, seq)
  const view = render(<AsideHeaderAction {...input} />)
  expect(statusOf(view.container)).toBe(expected)
  const button = view.getByRole('button', { name: 'aside.side' })
  if (expected) {
    const light = button.querySelector('[data-aside-status]')!
    expect(light.getAttribute('aria-hidden')).toBe('true')
    expect(button.getAttribute('aria-description')).toBe(`aside.status.${expected}`)
    fireEvent.click(light)
    expect(input.open).toHaveBeenCalledOnce()
  }
})

it('uses the newest generation even when the previous side has newer activity', () => {
  const side = { generation: 0, fromSeq: 0, asked: true }
  const row = { projectionValues: { sessionListMetadata: { blank: false, lastPromptAt: 9, side } } }
  const list = listWith(row), next = SessionId('session-side-new')
  const successor = { ...list.byId[SIDE]!, id: next, updatedAt: 1, projectionValues: {
    sessionListMetadata: { blank: true, lastPromptAt: null, side: { generation: 1, fromSeq: 0, asked: false } },
  } }
  expect(newestSide({ ...list, ids: [next, ...list.ids], byId: { ...list.byId, [next]: successor } }, PARENT)).toBe(next)
})

it('restores the read result after reload and drops it when its parent is deleted', () => {
  const reads = new AsideReads()
  try {
    reads.mark(PARENT, SIDE, 9)
    reads.mark(PARENT, SIDE, 7)
    expect(new AsideReads().for(PARENT).getSnapshot()).toEqual({ child: SIDE, seq: 9 })
  } finally { reads.forget(PARENT) }
  expect(new AsideReads().for(PARENT).getSnapshot()).toBeNull()
})
