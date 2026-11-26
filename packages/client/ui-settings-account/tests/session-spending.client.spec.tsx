// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SpendingState } from '../src/client/spending-controller.ts'
import { SessionSpending } from '../src/client/SessionSpending.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('shows partial costs and enabled spending windows in the main conversation footer', () => {
  const sessionId = SessionId('cost-test')
  const session = createSnapshotStore({ sessionId, running: false, blank: false, pendingSubmissions: [],
    removed: false, subagent: null, openState: 'open' as const, openError: null, hasMore: false, loadingOlder: false,
    promptError: null, lastAgentError: null, promptAttempted: true, awaitingFirstTurn: false })
  const state = createSnapshotStore<SpendingState>({ failed: false, saving: false, toast: null, data: {
    preferences: { enabledPeriods: ['5h', '7d'], autoResume: false, limits: { '15m': 5, '1h': 15, '5h': 50, '1d': 100, '7d': 500, '30d': 2000 } },
    paused: false, pending: 0, waiting: 0, pausedSessions: [], nextExpiry: null, updatedAt: 0,
    windows: [
      { period: '15m', enabled: false, limit: 5, spent: 5, reserved: 0, remaining: 0, uncertain: 0 },
      { period: '5h', enabled: true, limit: 50, spent: 49, reserved: 0, remaining: 1, uncertain: 0 },
      { period: '7d', enabled: true, limit: 500, spent: 50, reserved: 0, remaining: 450, uncertain: 0 },
    ],
  } })
  const cost = { total: 0.22, requests: 1, unpricedRequests: 0, points: [{ time: 1000, total: 0.22 }] }
  const props = { sessionId, useSession: bindSnapshotSelector(session), useSpending: bindSnapshotSelector(state),
    useProjection: () => undefined,
    useSessions: bindSnapshotSelector(createSnapshotStore({ ids: [], byId: {}, phase: 'ready' as const, projectionsBySession: {} })),
    useResource: () => ({ status: 'ready', value: cost }),
    t: makeTranslate(en),
  } as Parameters<typeof SessionSpending>[0]
  const view = render(<SessionSpending {...props} />)
  expect(screen.getByRole('button', { name: 'Conversation cost: ￥0.22' })).toBeTruthy()
  cost.requests++
  cost.unpricedRequests++
  view.rerender(<SessionSpending {...props} />)
  const partial = screen.getByRole('button', { name: 'Conversation cost: ≥ ￥0.22' })
  fireEvent.click(partial)
  const details = within(screen.getByRole('dialog', { name: 'Conversation cost' }))
  const openTotal = details.getByText('≥ ￥0.22')
  cost.total = 0.25
  cost.points.push({ time: 2000, total: 0.25 })
  cost.unpricedRequests = 0
  view.rerender(<SessionSpending {...props} />)
  expect(openTotal.textContent).toBe('￥0.25')
  fireEvent.click(screen.getByRole('button', { name: 'Conversation cost: ￥0.25' }))
  fireEvent.click(screen.getByRole('button', { name: 'Spending limits: 5h 98%' }))
  expect(screen.getAllByRole('progressbar')).toHaveLength(2)
  expect(screen.queryByRole('progressbar', { name: '15 minutes' })).toBeNull()
  act(() => {
    const data = state.getSnapshot().data!
    state.set({ ...state.getSnapshot(), data: { ...data,
      preferences: { ...data.preferences, enabledPeriods: [] }, windows: data.windows.map(window => ({ ...window, enabled: false })),
    } })
  })
  expect(screen.getByRole('button', { name: 'Spending limits: Off' })).toBeTruthy()
  expect(screen.queryAllByRole('progressbar')).toHaveLength(0)
  view.rerender(<SessionSpending {...props} occurrence="embedded" />)
  expect(screen.queryByRole('button', { name: /^Conversation cost:/u })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Spending limits:/u })).toBeNull()
})
