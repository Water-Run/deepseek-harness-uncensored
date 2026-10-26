// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SpendingState } from '../src/client/spending-controller.ts'
import { SessionSpending } from '../src/client/SessionSpending.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('summarizes and expands only enabled windows, ignoring a fuller disabled window', () => {
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
  const props = { sessionId, useSession: bindSnapshotSelector(session), useSpending: bindSnapshotSelector(state),
    useProjection: () => undefined,
    useResource: () => ({ status: 'ready', value: { total: 0.22, requests: 1, unpricedRequests: 0, points: [{ time: 1000, total: 0.22 }] } }),
    t: makeTranslate(en),
  } as Parameters<typeof SessionSpending>[0]
  render(<SessionSpending {...props} />)
  expect(screen.getByRole('button', { name: 'Conversation cost: ￥0.22' })).toBeTruthy()
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
})
