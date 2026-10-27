/**
 * The Remote surface of the security-mode egress proxy: settings, connection
 * check, and the bounded traffic list/detail the settings panel renders.
 *
 * Mutations require the application owner. Reads carry no credential: the
 * upstream password is reported as presence only and flows are stored already
 * redacted.
 * @module @deepseek-ai/dsh-security-proxy-local/service
 */

import type { Context } from '@deepseek-ai/cordis'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  SecurityProxyCaptureStats,
  SecurityProxyFlowDetail,
  SecurityProxyFlowQuery,
  SecurityProxyFlowsResult,
  SecurityProxySettingsPatch,
  SecurityProxyState,
  SecurityProxyTestResult,
} from '@deepseek-ai/dsh-security-proxy/types'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import type { SecurityProxyEngine } from './engine.ts'

/**
 * Host service consumed by tools in-process and by the settings panel over the
 * Remote gateway. One instance serves the whole Host.
 */
export class SecurityProxyService extends TypertRemoteService {
  /**
   * @param ctx - owning context; the service registers as `ctx.securityProxy`.
   * @param engine - the proxy runtime this service fronts.
   */
  constructor(ctx: Context, private readonly engine: SecurityProxyEngine) {
    super(ctx, 'securityProxy', { namespace: 'securityProxy' })
  }

  /**
   * Resolve whether one tool execution is routed through the proxy.
   * @param agent - the executing Agent.
   * @param tool - the model-facing tool name.
   * @returns the route, or undefined when the session is not covered.
   */
  route(agent: Agent | undefined, tool: string): { sessionId: SessionId; preset: string; tool: string } | undefined {
    return this.engine.route(agent, tool)
  }

  /**
   * Environment for one child process in a covered session.
   * @param agent - the executing Agent.
   * @param tool - the model-facing tool name.
   * @returns the overlay, or undefined when the session is not covered.
   */
  async environment(agent: Agent | undefined, tool: string): Promise<Readonly<Record<string, string>> | undefined> {
    return await this.engine.environment(agent, tool)
  }

  /**
   * Retrieve one target through the proxy with full plaintext capture.
   * @param agent - the executing Agent.
   * @param url - the absolute HTTP(S) target.
   * @param signal - caller cancellation.
   * @returns the decoded response.
   */
  async fetchTarget(agent: Agent | undefined, url: string, signal: AbortSignal): Promise<WebFetchResult> {
    return await this.engine.fetchTarget(agent, url, signal)
  }

  /**
   * Read the whole settings and status surface.
   * @returns current state.
   */
  @Remote
  async get(): Promise<SecurityProxyState> {
    return await this.engine.state()
  }

  /**
   * Change settings; transport changes are re-verified before this resolves.
   * @param patch - owner-edited fields.
   * @returns state after the write.
   */
  @Remote
  async configure(patch: SecurityProxySettingsPatch): Promise<SecurityProxyState> {
    this.assertOwner('securityProxy/configure')
    return await this.engine.configure(patch)
  }

  /**
   * Store or remove the upstream password.
   * @param password - the new secret, or null to remove the record.
   * @returns state after the write.
   */
  @Remote
  async setPassword(password: string | null): Promise<SecurityProxyState> {
    this.assertOwner('securityProxy/setPassword')
    return await this.engine.setPassword(password)
  }

  /**
   * Run one real proxy-path check.
   * @returns the check outcome and the state after it.
   */
  @Remote
  async test(): Promise<SecurityProxyTestResult> {
    this.assertOwner('securityProxy/test')
    return await this.engine.test()
  }

  /**
   * List retained flows, newest first.
   * @param query - optional filters.
   * @returns matching rows and the capture counters.
   */
  @Remote
  async list(query: SecurityProxyFlowQuery): Promise<SecurityProxyFlowsResult> {
    const state = await this.engine.state()
    return { flows: this.engine.list(query), capture: state.capture }
  }

  /**
   * Read one flow's detail.
   * @param id - flow identity.
   * @returns the detail, or null when pruned or unknown.
   */
  @Remote
  detail(id: string): Promise<SecurityProxyFlowDetail | null> {
    return Promise.resolve(this.engine.detail(id))
  }

  /**
   * Drop every retained flow.
   * @returns the capture counters after clearing.
   */
  @Remote
  async clear(): Promise<SecurityProxyCaptureStats> {
    this.assertOwner('securityProxy/clear')
    this.engine.clear()
    return (await this.engine.state()).capture
  }

  /**
   * Pause or resume capture; forwarding continues either way.
   * @param paused - whether new flows are refused.
   * @returns state after the change.
   */
  @Remote
  async pause(paused: boolean): Promise<SecurityProxyState> {
    this.assertOwner('securityProxy/pause')
    return await this.engine.setPaused(paused)
  }

  /**
   * Refuse a mutation that did not come from the application owner.
   * @param action - the attempted Remote method.
   */
  private assertOwner(action: string): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('security-proxy/owner-required', 'Only the application owner can change the security proxy.', { action })
    }
  }
}
