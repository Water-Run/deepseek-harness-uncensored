// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { AppearanceRow } from '../src/client/AppearanceRow.tsx'
import type { AppearanceRowComponentProps } from '../src/client/AppearanceRow.tsx'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { SunEstimate, ThemePreference } from '../src/client/index.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = {
  'appearance.title': 'Appearance',
  'appearance.sun': 'Sunrise & sunset',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'sun.location': 'Location',
  'sun.auto': 'Automatic',
  'sun.city.beijing': 'Beijing',
  'sun.city.shanghai': 'Shanghai',
  'sun.estimate.zone': 'Estimated for {city}',
  'sun.unresolved': 'Follows the system',
  'sun.times': 'Sunrise {sunrise} · Sunset {sunset}',
}

const translate = (key: string, params?: Record<string, string>): string =>
  (COPY[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => params?.[name] ?? '')

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<AppearanceRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: AppearanceRowComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mount(preference: ThemePreference = 'system', sun?: SunEstimate) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createAppearanceRowStore().create()
  store.actions.sync({ preference, sunLocation: 'auto', ...(sun === undefined ? {} : { sun }), revision: 0 })
  const setTheme = vi.fn()
  const setSunLocation = vi.fn()
  const props: AppearanceRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: emptyWorkspaces(),
    ...allowAllAccess,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: translate as AppearanceRowComponentProps['t'],
    setTheme,
    setSunLocation,
  }
  render(<AppearanceRow {...props} />)
  return { store, setTheme, setSunLocation }
}

const checked = (name: RegExp): string | null =>
  screen.getByRole('radio', { name }).getAttribute('aria-checked')

describe('AppearanceRow', () => {
  it('renders four preview cards in order with the preference selected', () => {
    mount('dark')
    expect(screen.getByText('Appearance')).toBeDefined()
    expect(screen.getAllByRole('radio').map(card => card.getAttribute('data-theme-card'))).toEqual(['sun', 'system', 'light', 'dark'])
    expect(checked(/Dark/)).toBe('true')
    expect(checked(/Light/)).toBe('false')
    expect(checked(/System/)).toBe('false')
    expect(screen.queryByLabelText('Location')).toBeNull()
  })

  it('click drives setTheme; selection follows the store mirror, not the click echo', () => {
    const b = mount('dark')
    fireEvent.click(screen.getByRole('radio', { name: /Light/ }))
    expect(b.setTheme).toHaveBeenCalledWith('light')
    // No store write yet: selection is unchanged.
    expect(checked(/Dark/)).toBe('true')
    act(() => { b.store.actions.sync({ preference: 'light', sunLocation: 'auto', revision: 1 }) })
    expect(checked(/Light/)).toBe('true')
    expect(checked(/Dark/)).toBe('false')
  })

  it('shows the sunrise and sunset location and estimate only for that preference', () => {
    const b = mount('sun', { cityId: 'shanghai', source: 'zone', daylight: true, interval: [Date.UTC(2026, 5, 20, 20, 50), Date.UTC(2026, 5, 21, 11, 1)] })
    expect(checked(/Sunrise/)).toBe('true')
    expect(screen.getByText(/Estimated for Shanghai/)).toBeDefined()
    expect(screen.getByText(/^Sunrise .* · Sunset /)).toBeDefined()
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'beijing' } })
    expect(b.setSunLocation).toHaveBeenCalledWith('beijing')
  })

  it('explains the system fallback when the time zone matches no city', () => {
    mount('sun')
    expect(screen.getByText('Follows the system')).toBeDefined()
  })
})
