// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '../src/client/index.ts'
import type {
  SecurityProxyCaptureExport,
  SecurityProxyFlowDetail,
  SecurityProxyFlowSummary,
  SecurityProxyFlowsResult,
  SecurityProxySettings,
  SecurityProxyState,
} from '@deepseek-ai/dsh-security-proxy/types'
import { SecurityProxyController, type SecurityProxyPort, type SecurityProxyViewState } from '../src/client/controller.ts'
import { en } from '../src/client/locales.ts'
import { SecurityProxySection, type SecurityProxySectionProps } from '../src/client/SecurityProxySection.tsx'
import { SecurityProxyBanner } from '../src/client/SecurityProxyBanner.tsx'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

const t = makeTranslate(en)

const SETTINGS: SecurityProxySettings = {
  enabled: true,
  protocol: 'http',
  host: '127.0.0.1',
  port: 3128,
  authEnabled: false,
  username: '',
  hasPassword: false,
  warnWhenDisabled: false,
  capturePaused: false,
  maxFlows: 500,
  maxBodyBytes: 65_536,
  retentionMinutes: 1_440,
}

const STATE: SecurityProxyState = {
  settings: SETTINGS,
  status: 'ready',
  failure: null,
  detail: null,
  checkedAt: 1_000,
  latencyMs: 12,
  capture: { paused: false, total: 2, retained: 1, bytes: 64 },
  listeners: 1,
  coverage: [
    { id: 'web_fetch', code: 'captured' },
    { id: 'shell', code: 'partial' },
    { id: 'browser', code: 'partial' },
    { id: 'mcp', code: 'partial' },
    { id: 'delegates', code: 'partial' },
    { id: 'model_api', code: 'uncovered' },
  ],
}

const FLOW: SecurityProxyFlowSummary = {
  id: 'flow-1',
  at: 1_700_000_000_000,
  kind: 'http',
  origin: 'client',
  sessionId: 'session-abcdef',
  tool: 'web_fetch',
  method: 'GET',
  target: 'http://target.test/page',
  status: 200,
  durationMs: 34,
  requestBytes: 0,
  responseBytes: 11,
  outcome: 'complete',
  note: null,
}

const DETAIL: SecurityProxyFlowDetail = {
  ...FLOW,
  requestHeaders: [{ name: 'user-agent', value: 'dshu-test' }],
  responseHeaders: [{ name: 'content-type', value: 'text/plain' }],
  requestBody: null,
  responseBody: 'target body',
  bodyTruncated: false,
  contentType: 'text/plain',
}

const EXPORT: SecurityProxyCaptureExport = { format: 'dshu-security-proxy-capture', version: 1, exportedAt: 1_000,
  filtered: false, capture: STATE.capture, flows: [DETAIL] }

function proxyPort(overrides: Partial<SecurityProxyPort> = {}): SecurityProxyPort {
  return {
    get: async () => STATE,
    configure: async () => STATE,
    setPassword: async () => STATE,
    test: async () => ({ ok: true, durationMs: 1, failure: null, detail: null, state: STATE }),
    list: async () => ({ flows: [FLOW], capture: STATE.capture }),
    detail: async () => DETAIL,
    exportCapture: async () => EXPORT,
    clear: async () => ({ ...STATE.capture, retained: 0, bytes: 0 }),
    pause: async () => STATE,
    ...overrides,
  }
}

/** Observe state after all callbacks for the resolved Remote promise have run. */
async function remoteTurn(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
}

describe('traffic request ownership', () => {
  it('does not start deferred settings access after the controller is retired', async () => {
    let retired = false
    let accessedAfterRetirement = false
    const controller = new SecurityProxyController(proxyPort({ get: async () => {
      accessedAfterRetirement ||= retired
      return STATE
    } }))
    controller.load()
    retired = true
    await controller.dispose()
    await remoteTurn()
    expect(accessedAfterRetirement).toBe(false)
  })

  it('reports a synchronous settings-port failure through the read state', async () => {
    const controller = new SecurityProxyController(proxyPort({ get: () => { throw new Error('retired port') } }))
    try {
      controller.load(); await remoteTurn()
      expect(controller.state.getSnapshot()).toMatchObject({ loading: false, failed: true })
    } finally { await controller.dispose() }
  })
  it('loads settings while retaining a newer filtered list and its counters', async () => {
    const old = Promise.withResolvers<SecurityProxyFlowsResult>()
    const capture = { ...STATE.capture, total: 9, retained: 4, bytes: 512 }
    const selected = { ...FLOW, id: 'filtered' }
    const controller = new SecurityProxyController(proxyPort({ list: vi.fn<SecurityProxyPort['list']>()
      .mockReturnValueOnce(old.promise).mockResolvedValue({ flows: [selected], capture }) }))
    try {
      controller.load()
      controller.setFilter({ text: 'filtered' }); await remoteTurn()
      old.resolve({ flows: [FLOW], capture: STATE.capture }); await remoteTurn()
      expect(controller.state.getSnapshot()).toMatchObject({ loading: false, flows: [selected], flowsFailed: false })
      expect(controller.state.getSnapshot().state).toMatchObject({ settings: SETTINGS, capture })
    } finally { old.resolve({ flows: [], capture: STATE.capture }); await controller.dispose() }
  })

  it('keeps available settings when reading the traffic list fails', async () => {
    const controller = new SecurityProxyController(proxyPort({ list: async () => { throw new Error('list unavailable') } }))
    try {
      controller.load(); await remoteTurn()
      expect(controller.state.getSnapshot()).toMatchObject({ state: STATE, loading: false, failed: false, flowsFailed: true })
    } finally { await controller.dispose() }
  })
  it('keeps the selected filter when an older refresh returns', async () => {
    const old = Promise.withResolvers<SecurityProxyFlowsResult>()
    const selected = { ...FLOW, id: 'selected', target: 'http://selected.test/' }
    const controller = new SecurityProxyController(proxyPort({
      list: vi.fn<SecurityProxyPort['list']>().mockResolvedValueOnce({ flows: [FLOW], capture: STATE.capture })
        .mockReturnValueOnce(old.promise).mockResolvedValue({ flows: [selected], capture: STATE.capture }),
    }))
    try {
      controller.load(); await remoteTurn()
      controller.refreshFlows()
      controller.setFilter({ text: 'selected' }); await remoteTurn()
      old.resolve({ flows: [FLOW], capture: STATE.capture }); await remoteTurn()
      expect(controller.state.getSnapshot()).toMatchObject({ filter: { text: 'selected' }, flows: [selected], flowsFailed: false })
    } finally { old.resolve({ flows: [], capture: STATE.capture }); await controller.dispose() }
  })

  it('ignores a failed previous filter after the current filter succeeds', async () => {
    const old = Promise.withResolvers<SecurityProxyFlowsResult>()
    const controller = new SecurityProxyController(proxyPort({
      list: vi.fn<SecurityProxyPort['list']>().mockResolvedValueOnce({ flows: [FLOW], capture: STATE.capture })
        .mockReturnValueOnce(old.promise).mockResolvedValue({ flows: [FLOW], capture: STATE.capture }),
    }))
    try {
      controller.load(); await remoteTurn()
      controller.setFilter({ text: 'old' })
      controller.setFilter({ text: 'current' }); await remoteTurn()
      old.reject(new Error('old request failed')); await remoteTurn()
      expect(controller.state.getSnapshot()).toMatchObject({ filter: { text: 'current' }, flows: [FLOW], flowsFailed: false, flowsLoading: false })
    } finally { old.resolve({ flows: [], capture: STATE.capture }); await controller.dispose() }
  })

  it('keeps the latest detail and does not reopen a closed detail', async () => {
    const old = Promise.withResolvers<SecurityProxyFlowDetail | null>()
    const closing = Promise.withResolvers<SecurityProxyFlowDetail | null>()
    const selected = { ...DETAIL, id: 'selected' }
    const controller = new SecurityProxyController(proxyPort({ detail: vi.fn<SecurityProxyPort['detail']>()
      .mockReturnValueOnce(old.promise).mockResolvedValueOnce(selected).mockReturnValueOnce(closing.promise) }))
    try {
      const first = controller.openFlow('old')
      await controller.openFlow('selected')
      old.resolve(DETAIL); await first
      expect(controller.state.getSnapshot().detail).toEqual(selected)
      const pending = controller.openFlow('closing')
      controller.closeFlow()
      closing.resolve(DETAIL); await pending
      expect(controller.state.getSnapshot()).toMatchObject({ detail: null, detailFailed: false })
    } finally { old.resolve(null); closing.resolve(null); await controller.dispose() }
  })

  it('does not restore rows, details or capture counters after clearing', async () => {
    const list = Promise.withResolvers<SecurityProxyFlowsResult>()
    const detail = Promise.withResolvers<SecurityProxyFlowDetail | null>()
    const controller = new SecurityProxyController(proxyPort({
      list: vi.fn<SecurityProxyPort['list']>().mockResolvedValueOnce({ flows: [FLOW], capture: STATE.capture }).mockReturnValueOnce(list.promise),
      detail: () => detail.promise,
    }))
    try {
      controller.load(); await remoteTurn()
      controller.load()
      const pending = controller.openFlow(FLOW.id)
      await controller.clear()
      list.resolve({ flows: [FLOW], capture: STATE.capture }); detail.resolve(DETAIL)
      await pending; await remoteTurn()
      expect(controller.state.getSnapshot()).toMatchObject({ flows: [], detail: null, flowsLoading: false, detailFailed: false })
      expect(controller.state.getSnapshot().state?.capture.retained).toBe(0)
    } finally { list.resolve({ flows: [], capture: STATE.capture }); detail.resolve(null); await controller.dispose() }
  })

  it('preserves cleared capture counters when an earlier settings write completes', async () => {
    const save = Promise.withResolvers<SecurityProxyState>()
    const controller = new SecurityProxyController(proxyPort({ configure: () => save.promise,
      list: vi.fn<SecurityProxyPort['list']>().mockResolvedValueOnce({ flows: [FLOW], capture: STATE.capture })
        .mockResolvedValue({ flows: [], capture: { ...STATE.capture, retained: 0, bytes: 0 } }),
    }))
    try {
      controller.load(); await remoteTurn()
      const pending = controller.configure({ enabled: false }); await remoteTurn()
      await controller.clear()
      save.resolve({ ...STATE, settings: { ...SETTINGS, enabled: false } })
      expect(await pending).toBe(true); await remoteTurn()
      expect(controller.state.getSnapshot().state).toMatchObject({ settings: { enabled: false }, capture: { retained: 0, bytes: 0 } })
    } finally { save.resolve(STATE); await controller.dispose() }
  })

  it('refreshes capture counters with the accepted traffic list', async () => {
    const capture = { ...STATE.capture, total: 8, retained: 7, bytes: 512 }
    const controller = new SecurityProxyController(proxyPort({ list: vi.fn<SecurityProxyPort['list']>()
      .mockResolvedValueOnce({ flows: [FLOW], capture: STATE.capture }).mockResolvedValue({ flows: [FLOW], capture }) }))
    try {
      controller.load(); await remoteTurn()
      controller.refreshFlows(); await remoteTurn()
      expect(controller.state.getSnapshot().state?.capture).toEqual(capture)
    } finally { await controller.dispose() }
  })

  it('retains displayed records and details when clearing fails', async () => {
    const controller = new SecurityProxyController(proxyPort({ clear: async () => { throw new Error('clear refused') } }))
    try {
      controller.load(); await remoteTurn()
      await controller.openFlow(FLOW.id)
      await controller.clear()
      expect(controller.state.getSnapshot()).toMatchObject({ flows: [FLOW], detail: DETAIL, flowsFailed: true })
    } finally { await controller.dispose() }
  })

  it('does not publish an error from a detail request that was closed', async () => {
    const pending = Promise.withResolvers<SecurityProxyFlowDetail | null>()
    const controller = new SecurityProxyController(proxyPort({ detail: () => pending.promise }))
    try {
      const opened = controller.openFlow(FLOW.id)
      controller.closeFlow()
      pending.reject(new Error('old detail unavailable')); await opened
      expect(controller.state.getSnapshot()).toMatchObject({ detail: null, detailFailed: false })
    } finally { pending.resolve(null); await controller.dispose() }
  })
})

describe('controller', () => {
  it('retires settings, list and detail replies from the previous connection', async () => {
    const settings = Promise.withResolvers<SecurityProxyState>()
    const list = Promise.withResolvers<SecurityProxyFlowsResult>()
    const detail = Promise.withResolvers<SecurityProxyFlowDetail | null>()
    const next = { ...STATE, settings: { ...SETTINGS, host: 'new-host' } }
    const controller = new SecurityProxyController(proxyPort({
      get: vi.fn<SecurityProxyPort['get']>().mockReturnValueOnce(settings.promise).mockResolvedValue(next),
      list: vi.fn<SecurityProxyPort['list']>().mockReturnValueOnce(list.promise).mockResolvedValue({ flows: [], capture: next.capture }),
      detail: () => detail.promise,
    }))
    try {
      controller.load()
      controller.setFilter({ text: 'old-filter' })
      const pending = controller.openFlow(FLOW.id)
      controller.reset(); await remoteTurn()
      settings.resolve(STATE); list.resolve({ flows: [FLOW], capture: STATE.capture }); detail.resolve(DETAIL)
      await pending; await remoteTurn()
      expect(controller.state.getSnapshot()).toMatchObject({ connectionRevision: 1, state: next,
        filter: { text: '', kind: 'all' }, flows: [], detail: null, feedback: null })
    } finally {
      settings.resolve(STATE); list.resolve({ flows: [], capture: STATE.capture }); detail.resolve(null)
      await controller.dispose()
    }
  })

  it('starts writes in the clicked connection and ignores retired write acknowledgements', async () => {
    const old = Promise.withResolvers<SecurityProxyState>()
    const current = Promise.withResolvers<SecurityProxyState>()
    const configure = vi.fn<SecurityProxyPort['configure']>().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const controller = new SecurityProxyController(proxyPort({ configure }))
    try {
      const first = controller.configure({ host: 'old-host' })
      expect(configure).toHaveBeenCalledWith({ host: 'old-host' })
      controller.reset(); await remoteTurn()
      const second = controller.configure({ host: 'new-host' })
      old.resolve({ ...STATE, settings: { ...SETTINGS, host: 'old-host' } })
      expect(await first).toBe(false)
      expect(controller.state.getSnapshot()).toMatchObject({ saving: true, feedback: null })
      expect(await controller.configure({ port: 8080 })).toBe(false)
      current.resolve({ ...STATE, settings: { ...SETTINGS, host: 'new-host' } })
      expect(await second).toBe(true)
      expect(controller.state.getSnapshot()).toMatchObject({ saving: false, state: { settings: { host: 'new-host' } } })
    } finally { old.resolve(STATE); current.resolve(STATE); await controller.dispose() }
  })

  it('exports the matching snapshot without the on-screen list limit', async () => {
    const pending = Promise.withResolvers<SecurityProxyCaptureExport>()
    const exportCapture = vi.fn<SecurityProxyPort['exportCapture']>(() => pending.promise)
    const save = vi.fn(async (_data: SecurityProxyCaptureExport) => undefined)
    const controller = new SecurityProxyController(proxyPort({ exportCapture }))
    try {
      controller.setFilter({ text: 'target', kind: 'http' })
      const task = controller.exportCapture(save)
      await controller.exportCapture(save)
      expect(controller.state.getSnapshot().exporting).toBe(true)
      expect(exportCapture).toHaveBeenCalledExactlyOnceWith({ text: 'target', kind: 'http' })
      pending.resolve(EXPORT); await task
      expect(save).toHaveBeenCalledExactlyOnceWith(EXPORT)
      expect(controller.state.getSnapshot()).toMatchObject({ exporting: false, exportFailed: false })
    } finally { pending.resolve(EXPORT); await controller.dispose() }
  })

  it.each(['clear', 'reset', 'dispose'] as const)('does not save a pending export after %s', async (operation) => {
    const pending = Promise.withResolvers<SecurityProxyCaptureExport>()
    const save = vi.fn(async (_data: SecurityProxyCaptureExport) => undefined)
    const controller = new SecurityProxyController(proxyPort({ exportCapture: () => pending.promise }))
    const task = controller.exportCapture(save)
    let disposed: Promise<void> | undefined
    try {
      if (operation === 'dispose') disposed = controller.dispose()
      else if (operation === 'clear') await controller.clear()
      else controller.reset()
      pending.resolve(EXPORT); await task
      expect(save).not.toHaveBeenCalled()
    } finally { pending.resolve(EXPORT); await disposed; await controller.dispose() }
  })

  it('retains file-save dependencies until an accepted export finishes', async () => {
    const saved = Promise.withResolvers<undefined>()
    const controller = new SecurityProxyController(proxyPort())
    const save = vi.fn(() => saved.promise)
    const task = controller.exportCapture(save)
    await remoteTurn()
    expect(save).toHaveBeenCalledOnce()
    let disposed = false
    const closing = controller.dispose().then(() => { disposed = true })
    await remoteTurn()
    expect(disposed).toBe(false)
    saved.resolve(undefined); await task; await closing
    expect(disposed).toBe(true)
  })

  it.each(['read', 'save'] as const)('reports an export %s failure and allows retry', async (step) => {
    const exportCapture = vi.fn<SecurityProxyPort['exportCapture']>()
    if (step === 'read') exportCapture.mockRejectedValueOnce(new Error('export refused'))
    exportCapture.mockResolvedValue(EXPORT)
    const save = vi.fn(async (_data: SecurityProxyCaptureExport) => undefined)
    if (step === 'save') save.mockRejectedValueOnce(new Error('disk unavailable'))
    const controller = new SecurityProxyController(proxyPort({ exportCapture }))
    try {
      await controller.exportCapture(save)
      expect(controller.state.getSnapshot()).toMatchObject({ exporting: false, exportFailed: true })
      await controller.exportCapture(save)
      expect(controller.state.getSnapshot()).toMatchObject({ exporting: false, exportFailed: false })
    } finally { await controller.dispose() }
  })

  it('reads settings and flows on load, then publishes a successful save', async () => {
    const configure = vi.fn(async () => ({ ...STATE, settings: { ...SETTINGS, enabled: false } }))
    const port: SecurityProxyPort = {
      get: vi.fn(async () => STATE),
      configure,
      setPassword: vi.fn(async () => STATE),
      test: vi.fn(async () => ({ ok: true, durationMs: 5, failure: null, detail: null, state: STATE })),
      list: vi.fn(async () => ({ flows: [FLOW], capture: STATE.capture })),
      detail: vi.fn(async () => DETAIL),
      exportCapture: async () => EXPORT,
      clear: vi.fn(async () => ({ paused: false, total: 2, retained: 0, bytes: 0 })),
      pause: vi.fn(async () => ({ ...STATE, settings: { ...SETTINGS, capturePaused: true } })),
    }
    const controller = new SecurityProxyController(port)
    try {
      controller.load()
      await waitFor(() => { expect(controller.state.getSnapshot().state).not.toBeNull() })
      expect(controller.state.getSnapshot().flows).toEqual([FLOW])
      expect(await controller.configure({ enabled: false })).toBe(true)
      expect(configure).toHaveBeenCalledWith({ enabled: false })
      expect(controller.state.getSnapshot()).toMatchObject({ saving: false, feedback: { code: 'saved', success: true } })
      expect(controller.state.getSnapshot().state?.settings.enabled).toBe(false)
    } finally { await controller.dispose() }
  })

  it('serializes writes and reports a refused one without touching the committed state', async () => {
    const pending = Promise.withResolvers<SecurityProxyState>()
    const port: SecurityProxyPort = {
      get: async () => STATE,
      configure: () => pending.promise,
      setPassword: async () => STATE,
      test: async () => ({ ok: false, durationMs: 1, failure: 'auth', detail: 'HTTP 407', state: STATE }),
      list: async () => ({ flows: [FLOW], capture: STATE.capture }),
      detail: async () => DETAIL,
      exportCapture: async () => EXPORT,
      clear: async () => STATE.capture,
      pause: async () => STATE,
    }
    const controller = new SecurityProxyController(port)
    try {
      controller.load()
      await waitFor(() => { expect(controller.state.getSnapshot().state).not.toBeNull() })
      const first = controller.configure({ host: 'proxy.example.com' })
      expect(await controller.configure({ port: 8080 })).toBe(false)
      pending.reject(new Error('offline'))
      expect(await first).toBe(false)
      expect(controller.state.getSnapshot()).toMatchObject({ saving: false, feedback: { code: 'saveFailed', success: false } })
    } finally { await controller.dispose() }
  })

  it('reads one flow, clears the store, and pauses capture', async () => {
    const port: SecurityProxyPort = {
      get: async () => STATE,
      configure: async () => STATE,
      setPassword: async () => STATE,
      test: async () => ({ ok: true, durationMs: 1, failure: null, detail: null, state: STATE }),
      list: async () => ({ flows: [FLOW], capture: STATE.capture }),
      detail: async () => DETAIL,
      exportCapture: async () => EXPORT,
      clear: async () => ({ paused: false, total: 2, retained: 0, bytes: 0 }),
      pause: async () => ({ ...STATE, settings: { ...SETTINGS, capturePaused: true } }),
    }
    const controller = new SecurityProxyController(port)
    try {
      controller.load()
      await waitFor(() => { expect(controller.state.getSnapshot().flows).toHaveLength(1) })
      await controller.openFlow('flow-1')
      expect(controller.state.getSnapshot().detail).toEqual(DETAIL)
      controller.closeFlow()
      expect(controller.state.getSnapshot().detail).toBeNull()
      await controller.clear()
      expect(controller.state.getSnapshot().flows).toEqual([])
      expect(controller.state.getSnapshot().state?.capture.retained).toBe(0)
      await controller.setPaused(true)
      expect(controller.state.getSnapshot().state?.settings.capturePaused).toBe(true)
    } finally { await controller.dispose() }
  })

  it('keeps the failure state when the settings read fails', async () => {
    const port: SecurityProxyPort = {
      get: async () => { throw new Error('offline') },
      configure: async () => STATE,
      setPassword: async () => STATE,
      test: async () => ({ ok: false, durationMs: 1, failure: 'unknown', detail: null, state: STATE }),
      list: async () => ({ flows: [], capture: STATE.capture }),
      detail: async () => null,
      exportCapture: async () => EXPORT,
      clear: async () => STATE.capture,
      pause: async () => STATE,
    }
    const controller = new SecurityProxyController(port)
    try {
      controller.load()
      await waitFor(() => { expect(controller.state.getSnapshot().failed).toBe(true) })
      expect(controller.state.getSnapshot().state).toBeNull()
    } finally { await controller.dispose() }
  })
})

/** A reusable hook that must not be read by this surface. */
function unusedHook(): never {
  throw new Error('This surface reads no global slot source')
}

function renderSection(state: SecurityProxyViewState, modeId = 'security') {
  const store = createSnapshotStore<SecurityProxyViewState>(state)
  const actions = {
    load: vi.fn(),
    refreshFlows: vi.fn(),
    configure: vi.fn(async () => true),
    setPassword: vi.fn(async () => true),
    test: vi.fn(async () => true),
    pause: vi.fn(async () => true),
    clear: vi.fn(async () => undefined),
    exportCapture: vi.fn(async () => undefined),
    openFlow: vi.fn(async () => undefined),
    closeFlow: vi.fn(),
    setFilter: vi.fn(),
    dismissFeedback: vi.fn(),
  }
  const props: SecurityProxySectionProps = {
    ...actions,
    modeId,
    usePanelInfo: unusedHook, useSessions: unusedHook, useSessionStatus: unusedHook, useSessionRetainInfo: unusedHook,
    useWorkspaces: unusedHook, useResource: unusedHook, useContextMenu: unusedHook,
    ...allowAllAccess,
    useSecurityProxy: bindSnapshotSelector(store),
    t,
  }
  render(<SecurityProxySection {...props} />)
  return { ...actions, store }
}

const READY: SecurityProxyViewState = {
  connectionRevision: 0,
  exporting: false,
  exportFailed: false,
  state: STATE,
  loading: false,
  failed: false,
  saving: false,
  testing: false,
  flows: [FLOW],
  flowsLoading: false,
  flowsFailed: false,
  detail: null,
  detailFailed: false,
  filter: { text: '', kind: 'all' },
  feedback: null,
}

describe('settings surface', () => {
  it('drops address and password drafts and clear confirmation when the Host changes', () => {
    const state = { ...READY, state: { ...STATE, settings: { ...SETTINGS, authEnabled: true } } }
    const { store } = renderSection(state)
    fireEvent.change(screen.getByRole('textbox', { name: en['securityProxy.host'] }), { target: { value: 'old-draft' } })
    fireEvent.change(screen.getByPlaceholderText(en['securityProxy.passwordPlaceholder']), { target: { value: 'old-password' } })
    fireEvent.click(screen.getByRole('button', { name: en['securityProxy.capture.clear'] }))
    expect(screen.getByText(en['securityProxy.capture.clearConfirm'])).toBeTruthy()
    act(() => { store.set({ ...state, connectionRevision: 1, state: { ...state.state, settings: { ...state.state.settings, host: 'new-host' } } }) })
    expect(screen.getByRole('textbox', { name: en['securityProxy.host'] }).getAttribute('value')).toBe('new-host')
    expect(screen.getByPlaceholderText(en['securityProxy.passwordPlaceholder']).getAttribute('value')).toBe('')
    expect(screen.queryByText(en['securityProxy.capture.clearConfirm'])).toBeNull()
  })

  it('offers export and shows its busy and failure states', () => {
    const actions = renderSection(READY)
    fireEvent.click(screen.getByRole('button', { name: en['securityProxy.capture.export'] }))
    expect(actions.exportCapture).toHaveBeenCalledOnce()
    cleanup()
    renderSection({ ...READY, exporting: true, exportFailed: true })
    expect(screen.getByRole('button', { name: en['securityProxy.capture.exporting'] }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain(en['securityProxy.capture.exportFailed'])
  })
  it('renders nothing while another mode is selected', () => {
    renderSection(READY, 'reverse')
    expect(screen.queryByText(en['securityProxy.title'])).toBeNull()
  })

  it('shows the real status, coverage, and the captured row', () => {
    renderSection(READY)
    expect(screen.getByText(en['securityProxy.title'])).toBeTruthy()
    expect(screen.getByText(en['securityProxy.status.ready'])).toBeTruthy()
    expect(screen.getByText(en['securityProxy.coverage.captured'])).toBeTruthy()
    expect(screen.getAllByText(en['securityProxy.coverage.uncovered'])).toHaveLength(1)
    expect(screen.getByText(en['securityProxy.coverage.browserHint'])).toBeTruthy()
    expect(screen.getByText(en['securityProxy.coverage.mcpHint'])).toBeTruthy()
    expect(screen.getByText(en['securityProxy.coverage.delegatesHint'])).toBeTruthy()
    expect(screen.getAllByText('web_fetch').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: `GET ${FLOW.target}` })).toBeTruthy()
  })

  it('writes the enable switch and opens a flow detail', async () => {
    const actions = renderSection(READY)
    fireEvent.click(screen.getAllByRole('switch', { name: en['securityProxy.enabled'] })[0] as HTMLElement)
    expect(actions.configure).toHaveBeenCalledWith({ enabled: false })
    fireEvent.click(screen.getByRole('button', { name: `GET ${FLOW.target}` }))
    expect(actions.openFlow).toHaveBeenCalledWith('flow-1')
  })

  it('shows a failure reason instead of claiming the proxy is available', () => {
    renderSection({ ...READY, state: { ...STATE, status: 'failed', failure: 'unreachable', detail: 'ECONNREFUSED' } })
    expect(screen.getByText(en['securityProxy.status.failed'])).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(en['securityProxy.failure.unreachable'])
  })

  it('renders one exchange detail with its headers and its body', () => {
    renderSection({ ...READY, detail: DETAIL })
    expect(screen.getByText(en['securityProxy.detail.title'])).toBeTruthy()
    expect(screen.getByText('target body')).toBeTruthy()
    expect(screen.getByText('dshu-test')).toBeTruthy()
  })

  it('shows a failed transfer separately from its HTTP response status', () => {
    renderSection({ ...READY, detail: { ...DETAIL, status: 200, outcome: 'error' } })
    const dialog = screen.getByRole('dialog', { name: en['securityProxy.detail.title'] })
    expect(within(dialog).getByText('200')).toBeTruthy()
    expect(within(dialog).getByText('Transport result')).toBeTruthy()
    expect(within(dialog).getByText('Failed', { exact: true })).toBeTruthy()
  })

  it('shows the capped body and each preceding capture limit in one note', () => {
    renderSection({ ...READY, detail: { ...DETAIL, bodyTruncated: true,
      bodyLimits: { requestStorage: true, responseCapture: 'read', responseStorage: true } } })
    expect(screen.getByText(
      'The request body exceeded the storage limit. The response body exceeded the read limit. '
      + 'The response body exceeded the storage limit.',
    )).toBeTruthy()
    expect(screen.queryByText(en['securityProxy.detail.truncated'])).toBeNull()
  })

  it('shows the general truncation note when the capture stage is unavailable', () => {
    renderSection({ ...READY, detail: { ...DETAIL, bodyTruncated: true } })
    expect(screen.getByText(en['securityProxy.detail.truncated'])).toBeTruthy()
  })

  it('marks a tunnel row as metadata only', () => {
    const tunnel: SecurityProxyFlowSummary = { ...FLOW, id: 'tunnel-1', kind: 'tunnel', method: 'CONNECT', status: null, note: 'tunnel-metadata-only' }
    renderSection({ ...READY, flows: [tunnel], detail: { ...DETAIL, ...tunnel, requestBody: null, responseBody: null } })
    expect(screen.getByText(en['securityProxy.detail.tunnel'])).toBeTruthy()
  })
})

describe('proxy-off reminder', () => {
  it('stays visible in security mode and lets the owner disable the saved reminder', async () => {
    const store = createSnapshotStore<SecurityProxyViewState>({ ...READY,
      state: { ...STATE, settings: { ...SETTINGS, enabled: false, warnWhenDisabled: true } } })
    const configure = vi.fn(async () => true)
    const props: Parameters<typeof SecurityProxyBanner>[0] = {
      modeId: 'security', load: vi.fn(), configure,
      usePanelInfo: unusedHook, useSessions: unusedHook, useSessionStatus: unusedHook, useSessionRetainInfo: unusedHook,
      useWorkspaces: unusedHook, useResource: unusedHook, useContextMenu: unusedHook,
      ...allowAllAccess,
      useSecurityProxy: bindSnapshotSelector(store),
      t,
    }
    const view = render(<SecurityProxyBanner {...props} />)
    expect(screen.getByText(en['securityProxy.bannerTitle'])).toBeTruthy()
    await expect(`${screen.getByRole('status').textContent}\n`).toMatchFileSnapshot('./expected/proxy-banner.txt')
    fireEvent.click(screen.getByRole('switch', { name: en['securityProxy.bannerPreference'] }))
    expect(configure).toHaveBeenCalledWith({ warnWhenDisabled: false })
    view.rerender(<SecurityProxyBanner {...props} modeId="reverse" />)
    expect(screen.queryByText(en['securityProxy.bannerTitle'])).toBeNull()
    view.rerender(<SecurityProxyBanner {...props} modeId="security" />)
    expect(screen.getByText(en['securityProxy.bannerTitle'])).toBeTruthy()
  })
})

// The controller's port types are exercised through the store; keep the helper
// type imported so the spec fails if the Remote surface loses a method.
export type PortCheck = keyof SecurityProxyPort
export const PORT_METHODS: readonly PortCheck[] = ['get', 'configure', 'setPassword', 'test', 'list', 'detail', 'exportCapture', 'clear', 'pause']
