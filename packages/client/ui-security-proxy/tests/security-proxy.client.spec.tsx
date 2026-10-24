// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '../src/client/index.ts'
import type {
  SecurityProxyFlowDetail,
  SecurityProxyFlowSummary,
  SecurityProxySettings,
  SecurityProxyState,
} from '@deepseek-ai/dsh-security-proxy/types'
import { SecurityProxyController, type SecurityProxyPort, type SecurityProxyViewState } from '../src/client/controller.ts'
import { en } from '../src/client/locales.ts'
import { SecurityProxySection, SecurityProxyWarning, type SecurityProxySectionProps, type SecurityProxyWarningProps } from '../src/client/SecurityProxySection.tsx'

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
    { id: 'browser', code: 'uncovered' },
    { id: 'mcp', code: 'uncovered' },
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

describe('controller', () => {
  it('reads settings and flows on load, then publishes a successful save', async () => {
    const port: SecurityProxyPort = {
      get: vi.fn(async () => STATE),
      configure: vi.fn(async () => ({ ...STATE, settings: { ...SETTINGS, enabled: false } })),
      setPassword: vi.fn(async () => STATE),
      test: vi.fn(async () => ({ ok: true, durationMs: 5, failure: null, detail: null, state: STATE })),
      list: vi.fn(async () => ({ flows: [FLOW], capture: STATE.capture })),
      detail: vi.fn(async () => DETAIL),
      clear: vi.fn(async () => ({ paused: false, total: 2, retained: 0, bytes: 0 })),
      pause: vi.fn(async () => ({ ...STATE, settings: { ...SETTINGS, capturePaused: true } })),
    }
    const controller = new SecurityProxyController(port)
    try {
      controller.load()
      await waitFor(() => { expect(controller.state.getSnapshot().state).not.toBeNull() })
      expect(controller.state.getSnapshot().flows).toEqual([FLOW])
      expect(await controller.configure({ enabled: false })).toBe(true)
      expect(port.configure).toHaveBeenCalledWith({ enabled: false })
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
    openFlow: vi.fn(async () => undefined),
    closeFlow: vi.fn(),
    setFilter: vi.fn(),
    dismissFeedback: vi.fn(),
  }
  const props: SecurityProxySectionProps = {
    ...actions,
    modeId,
    usePanelInfo: unusedHook, useSessions: unusedHook, useSessionStatus: unusedHook, useSessionRetainInfo: unusedHook,
    useWorkspaces: unusedHook, useResource: unusedHook,
    ...allowAllAccess,
    useSecurityProxy: bindSnapshotSelector(store),
    t,
  }
  render(<SecurityProxySection {...props} />)
  return actions
}

const READY: SecurityProxyViewState = {
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
  it('renders nothing while another mode is selected', () => {
    renderSection(READY, 'reverse')
    expect(screen.queryByText(en['securityProxy.title'])).toBeNull()
  })

  it('shows the real status, coverage, and the captured row', () => {
    renderSection(READY)
    expect(screen.getByText(en['securityProxy.title'])).toBeTruthy()
    expect(screen.getByText(en['securityProxy.status.ready'])).toBeTruthy()
    expect(screen.getByText(en['securityProxy.coverage.captured'])).toBeTruthy()
    expect(screen.getAllByText(en['securityProxy.coverage.uncovered'])).toHaveLength(3)
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

  it('renders one exchange detail with redacted headers and its body', () => {
    renderSection({ ...READY, detail: DETAIL })
    expect(screen.getByText(en['securityProxy.detail.title'])).toBeTruthy()
    expect(screen.getByText('target body')).toBeTruthy()
    expect(screen.getByText(en['securityProxy.detail.redacted'])).toBeTruthy()
  })

  it('marks a tunnel row as metadata only', () => {
    const tunnel: SecurityProxyFlowSummary = { ...FLOW, id: 'tunnel-1', kind: 'tunnel', method: 'CONNECT', status: null, note: 'tunnel-metadata-only' }
    renderSection({ ...READY, flows: [tunnel], detail: { ...DETAIL, ...tunnel, requestBody: null, responseBody: null } })
    expect(screen.getByText(en['securityProxy.detail.tunnel'])).toBeTruthy()
  })
})

describe('proxy-off reminder', () => {
  it('paints the reminder only while the host reports one', () => {
    const store = createSnapshotStore<{ id: number } | null>({ id: 1 })
    const props: SecurityProxyWarningProps = {
      dismissWarning: vi.fn(),
      usePanelInfo: unusedHook, useSessions: unusedHook, useSessionStatus: unusedHook, useSessionRetainInfo: unusedHook,
      useWorkspaces: unusedHook, useResource: unusedHook,
      ...allowAllAccess,
      useSecurityProxyWarning: bindSnapshotSelector(store),
      t,
    }
    render(<SecurityProxyWarning {...props} />)
    expect(screen.getByText(en['securityProxy.warnToast'])).toBeTruthy()
  })
})

// The controller's port types are exercised through the store; keep the helper
// type imported so the spec fails if the Remote surface loses a method.
export type PortCheck = keyof SecurityProxyPort
export const PORT_METHODS: readonly PortCheck[] = ['get', 'configure', 'setPassword', 'test', 'list', 'detail', 'clear', 'pause']
