// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { AsideHeaderAction } from '../src/client/asides/AsidePanel.tsx'

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

function props(side: Partial<SessionSummary> | undefined, sideId: SessionId | undefined = side === undefined ? undefined : SIDE) {
  return {
    sessionId: PARENT,
    t: (key: string) => key,
    open: vi.fn(),
    sideOf: () => sideId,
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

it('breathes beside the launcher for a stopped side conversation', () => {
  const view = render(<AsideHeaderAction {...props({ blank: false, running: false })} />)
  const light = view.container.querySelector('[data-aside-status]')
  expect(light?.getAttribute('data-aside-status')).toBe('stopped')
  // Decorative chrome: the accessible tree skips the dot itself.
  expect(light?.getAttribute('aria-hidden')).toBe('true')
  const launcher = view.container.querySelector('button')
  if (light === null || launcher === null) throw new Error('light or launcher missing')
  expect(light.compareDocumentPosition(launcher) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('blinks while the side conversation works', () => {
  const view = render(<AsideHeaderAction {...props({ blank: false, running: true })} />)
  expect(statusOf(view.container)).toBe('running')
})
