/** Shared state and serialized Remote calls for the security-proxy settings surface. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  SecurityProxyCaptureStats,
  SecurityProxyFlowDetail,
  SecurityProxyFlowKind,
  SecurityProxyFlowQuery,
  SecurityProxyFlowsResult,
  SecurityProxyFlowSummary,
  SecurityProxySettingsPatch,
  SecurityProxyState,
  SecurityProxyTestResult,
} from '@deepseek-ai/dsh-security-proxy/types'

/** Feedback kinds this surface shows after a write. */
export type SecurityProxyFeedback = 'saved' | 'saveFailed' | 'passwordSaved' | 'passwordFailed'

/** Filter the list applies; `all` keeps every kind. */
export interface SecurityProxyFilter {
  readonly text: string
  readonly kind: 'all' | SecurityProxyFlowKind
}

/** Everything the surface renders, retained across Settings reopenings. */
export interface SecurityProxyViewState {
  /** Host settings and status; absent until the first read completes. */
  state: SecurityProxyState | null
  loading: boolean
  failed: boolean
  saving: boolean
  testing: boolean
  flows: readonly SecurityProxyFlowSummary[]
  flowsLoading: boolean
  flowsFailed: boolean
  detail: SecurityProxyFlowDetail | null
  detailFailed: boolean
  filter: SecurityProxyFilter
  feedback: { id: number; code: SecurityProxyFeedback; success: boolean } | null
}

/** Remote operations this surface needs; a test drives a stub port directly. */
export interface SecurityProxyPort {
  get(): Promise<SecurityProxyState>
  configure(patch: SecurityProxySettingsPatch): Promise<SecurityProxyState>
  setPassword(password: string | null): Promise<SecurityProxyState>
  test(): Promise<SecurityProxyTestResult>
  list(query: SecurityProxyFlowQuery): Promise<SecurityProxyFlowsResult>
  detail(id: string): Promise<SecurityProxyFlowDetail | null>
  clear(): Promise<SecurityProxyCaptureStats>
  pause(paused: boolean): Promise<SecurityProxyState>
}

/**
 * Owns the section's reads and writes. Writes are serialized: a second write
 * while one is in flight is refused, so a slow password save cannot race a
 * settings save. Reads never publish over a newer completed write.
 */
export class SecurityProxyController {
  /** Shared observations; the component renders from this store. */
  readonly state = createSnapshotStore<SecurityProxyViewState>({
    state: null,
    loading: true,
    failed: false,
    saving: false,
    testing: false,
    flows: [],
    flowsLoading: false,
    flowsFailed: false,
    detail: null,
    detailFailed: false,
    filter: { text: '', kind: 'all' },
    feedback: null,
  })

  private closed = false
  private revision = 0
  private sequence = 0
  private write: Promise<void> | undefined

  /** @param port - Remote operations for this Host. */
  constructor(private readonly port: SecurityProxyPort) {}

  /** Read settings and the current list; safe to call repeatedly. */
  readonly load = (): void => {
    if (this.closed) return
    this.revision += 1
    const revision = this.revision
    this.patch({ loading: true, failed: false })
    void this.read(revision)
  }

  /** Re-read the flow list without touching the settings form. */
  readonly refreshFlows = (): void => {
    if (this.closed) return
    const filter = this.state.getSnapshot().filter
    this.patch({ flowsLoading: true, flowsFailed: false })
    void this.readFlows(filter).then((flows) => {
      if (!this.closed) this.patch({ flows, flowsLoading: false })
    }, () => {
      if (!this.closed) this.patch({ flowsLoading: false, flowsFailed: true })
    })
  }

  /**
   * Persist one settings change.
   * @param patch - fields the owner changed.
   * @returns whether the write committed.
   */
  readonly configure = (patch: SecurityProxySettingsPatch): Promise<boolean> => this.run(async () => {
    const state = await this.port.configure(patch)
    this.revision += 1
    const flows = await this.readFlows(this.state.getSnapshot().filter).catch(() => this.state.getSnapshot().flows)
    this.patch({ state, flows, loading: false, failed: false })
    return 'saved'
  }, 'saved')

  /**
   * Store or remove the proxy password.
   * @param password - new secret, or null to remove it.
   * @returns whether the write committed.
   */
  readonly setPassword = (password: string | null): Promise<boolean> => this.run(async () => {
    const state = await this.port.setPassword(password)
    this.revision += 1
    this.patch({ state, loading: false, failed: false })
    return 'passwordSaved'
  }, 'passwordSaved')

  /**
   * Run one real proxy-path check and adopt its state.
   * @returns whether the check succeeded.
   */
  readonly test = async (): Promise<boolean> => {
    if (this.closed || this.state.getSnapshot().testing) return false
    this.patch({ testing: true })
    try {
      const result = await this.port.test()
      this.revision += 1
      this.patch({ state: result.state, loading: false, failed: false })
      return result.ok
    } catch {
      this.patch({ failed: true })
      return false
    } finally {
      if (!this.closed) this.patch({ testing: false })
    }
  }

  /** Pause or resume capture without restarting the proxy. */
  readonly setPaused = (paused: boolean): Promise<boolean> => this.run(async () => {
    const state = await this.port.pause(paused)
    this.revision += 1
    this.patch({ state })
    return 'saved'
  }, 'saved')

  /** Drop every retained flow. */
  readonly clear = async (): Promise<void> => {
    try {
      const capture = await this.port.clear()
      if (this.closed) return
      const current = this.state.getSnapshot().state
      this.patch({
        flows: [],
        detail: null,
        state: current === null ? null : { ...current, capture },
      })
    } catch {
      this.patch({ flowsFailed: true })
    }
  }

  /**
   * Read one flow's detail.
   * @param id - flow identity from the list.
   */
  readonly openFlow = async (id: string): Promise<void> => {
    this.patch({ detail: null, detailFailed: false })
    try {
      const detail = await this.port.detail(id)
      if (this.closed) return
      this.patch({ detail, detailFailed: detail === null })
    } catch {
      if (!this.closed) this.patch({ detailFailed: true })
    }
  }

  /** Close the detail view. */
  readonly closeFlow = (): void => { this.patch({ detail: null, detailFailed: false }) }

  /**
   * Change the list filter and re-read.
   * @param patch - text and/or kind.
   */
  readonly setFilter = (patch: Partial<SecurityProxyFilter>): void => {
    const filter = { ...this.state.getSnapshot().filter, ...patch }
    this.patch({ filter })
    this.revision += 1
    const revision = this.revision
    this.patch({ flowsLoading: true, flowsFailed: false })
    void this.readFlows(filter).then((flows) => {
      if (!this.closed && revision === this.revision) this.patch({ flows, flowsLoading: false })
    }, () => {
      if (!this.closed) this.patch({ flowsLoading: false, flowsFailed: true })
    })
  }

  /**
   * Retire one feedback message.
   * @param id - the message identity.
   */
  readonly dismiss = (id: number): void => {
    if (this.state.getSnapshot().feedback?.id === id) this.patch({ feedback: null })
  }

  /** Stop publishing and wait for the in-flight write. */
  async dispose(): Promise<void> {
    this.closed = true
    await this.write
  }

  /** Serialize one write and publish its feedback. */
  private async run(operation: () => Promise<SecurityProxyFeedback>, successCode: SecurityProxyFeedback): Promise<boolean> {
    if (this.closed || this.write !== undefined) return false
    this.patch({ saving: true })
    this.write = Promise.resolve().then(operation).then((code) => {
      if (!this.closed) {
        this.patch({
          saving: false,
          feedback: { id: ++this.sequence, code, success: code === successCode },
        })
      }
    }, () => {
      if (!this.closed) {
        this.patch({
          saving: false,
          feedback: { id: ++this.sequence, code: successCode === 'saved' ? 'saveFailed' : 'passwordFailed', success: false },
        })
      }
    })
    await this.write
    this.write = undefined
    return this.state.getSnapshot().feedback?.success === true
  }

  /** Read settings and flows for one generation. */
  private async read(revision: number): Promise<void> {
    try {
      const [state, result] = await Promise.all([this.port.get(), this.port.list(this.query())])
      if (this.closed || revision !== this.revision) return
      this.patch({ state, flows: result.flows, loading: false, failed: false })
    } catch {
      if (this.closed || revision !== this.revision) return
      this.patch({ loading: false, failed: true })
    }
  }

  /** Read the list for one filter. */
  private async readFlows(filter: SecurityProxyFilter): Promise<readonly SecurityProxyFlowSummary[]> {
    const result = await this.port.list(queryOf(filter))
    return result.flows
  }

  /** The current filter as a Remote query. */
  private query(): SecurityProxyFlowQuery {
    return queryOf(this.state.getSnapshot().filter)
  }

  /** Publish one partial state change. */
  private patch(patch: Partial<SecurityProxyViewState>): void {
    if (this.closed) return
    this.state.set({ ...this.state.getSnapshot(), ...patch })
  }
}

/** Translate the UI filter into the Remote query. */
function queryOf(filter: SecurityProxyFilter): SecurityProxyFlowQuery {
  return {
    ...filter.text === '' ? {} : { text: filter.text },
    ...filter.kind === 'all' ? {} : { kind: filter.kind },
    limit: 200,
  }
}
