/**
 * Service Definition for the security-mode egress proxy seam (`ctx.securityProxy`).
 *
 * The seam answers three questions for a tool execution: whether this Agent's
 * session is a security-mode session the proxy serves, which environment a child
 * process needs to reach it, and how to retrieve one target through it while
 * recording the exchange. The providing plugin owns configuration, the upstream
 * connection, the loopback chain proxy, and the capture store; consumers never
 * build ordinary transports of their own. Native enforcement retains an egress
 * lease when it needs its own policy-checked gateway.
 *
 * The session's mode is read from its durable log, never from a tool argument: a
 * consumer passes the executing {@link Agent}, and a call without one is never
 * covered.
 * @module @deepseek-ai/dsh-security-proxy
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import type {
  SecurityProxyCaptureStats,
  SecurityProxyFlowDetail,
  SecurityProxyFlowQuery,
  SecurityProxyFlowsResult,
  SecurityProxySettingsPatch,
  SecurityProxyState,
  SecurityProxyTestResult,
  SecurityProxyProtocol,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    securityProxy: SecurityProxyRuntime
  }
}

/**
 * Why one execution is covered. A consumer that receives a route may rely on
 * both branches it names: the session is the attribution key, and the tool name
 * is what the traffic list shows.
 */
export interface SecurityProxyRoute {
  /** Conversation the exchange is attributed to. */
  readonly sessionId: SessionId
  /** Preset the session currently runs; `security` is the only covered value. */
  readonly preset: string
  /** Tool that is about to reach the network. */
  readonly tool: string
}

/** Host-only raw exchange; the proxy owner assigns identity and redacts it before storage. */
export type SecurityProxyCaptureInput = Omit<SecurityProxyFlowDetail,
  'id' | 'requestHeaders' | 'responseHeaders' | 'bodyTruncated'> & {
    readonly requestHeaders: readonly (readonly [string, string])[]
    readonly responseHeaders: readonly (readonly [string, string])[]
  }

/** Host-only upstream snapshot. Credentials must never enter a Remote result or diagnostic. */
export interface SecurityProxyUpstream {
  readonly protocol: SecurityProxyProtocol
  readonly host: string
  readonly port: number
  readonly username: string
  readonly password: string | undefined
}

/** Native enforcement's retained use of one conversation's independent proxy and capture store. */
export interface SecurityProxyEgressLease {
  readonly upstream: SecurityProxyUpstream
  /** Cancels when configuration, conversation, caller or provider ownership is withdrawn. */
  readonly signal: AbortSignal
  readonly capture: {
    /** @param input - Observed exchange; conversation and tool attribution are overwritten by the owner.
     * @returns The redacted stored flow, or undefined while capture is paused. */
    append(input: SecurityProxyCaptureInput): SecurityProxyFlowDetail | undefined
  }
  /** @returns Whether the user currently pauses capture, without changing forwarding. */
  paused(): boolean
  /**
   * Report delegated cleanup after the process range and gateway have closed.
   * @param failure - Omitted for confirmed closure. An error reports untrusted closure and retains dependencies.
   */
  release(failure?: { readonly error: unknown }): void
}

/**
 * The egress seam. Implementations are Host-local: they own one configured
 * upstream, one loopback chain proxy, and one bounded capture store.
 */
export abstract class SecurityProxyRuntime extends Service {
  /**
   * @param ctx - owning Cordis context; the service registers as `ctx.securityProxy`.
   */
  constructor(ctx: Context) {
    super(ctx, 'securityProxy')
  }

  /**
   * Decide whether one tool execution is routed through the security proxy.
   * A call with no Agent is never covered, and a session whose recorded preset
   * is not `security` is never covered regardless of what the tool reports.
   * @param agent - the Agent executing the tool call, when the caller has one.
   * @param tool - the model-facing tool name, used for traffic attribution.
   * @returns the route when covered, otherwise `undefined`.
   */
  abstract route(agent: Agent | undefined, tool: string): SecurityProxyRoute | undefined

  /**
   * Environment entries a child process needs to send its traffic through this
   * proxy. The caller merges them into that one execution's environment; nothing
   * here mutates the Host process or the operating system.
   * @param agent - the Agent executing the tool call.
   * @param tool - the model-facing tool name, used for traffic attribution.
   * @returns the overlay for one spawn, or `undefined` when not covered.
   */
  abstract environment(agent: Agent | undefined, tool: string): Promise<Readonly<Record<string, string>> | undefined>

  /**
   * Retain the configured upstream and capture writer for a native enforcement gateway.
   * This Host-only operation exposes credentials; it is never a Remote method.
   * @param agent - Actual executing Agent; omission and uncovered modes acquire nothing.
   * @param tool - Tool attribution bound to every captured exchange.
   * @param stop - Stop and join the delegated process range and gateway when ownership is withdrawn.
   * @param signal - Caller cancellation, retained for the entire lease.
   * @param admission - Optional startup-only cancellation; omission uses the caller lifetime alone.
   * @returns A lease for enabled Security mode, otherwise undefined. Covered admission failures reject without fallback.
   */
  abstract openEgress(
    agent: Agent | undefined, tool: string, stop: () => Promise<void>, signal: AbortSignal, admission?: AbortSignal,
  ): Promise<SecurityProxyEgressLease | undefined>

  /**
   * Resolve the sidebar browser's loopback proxy from the actual owning Agent.
   * @param agent - Conversation resolved by the Host's Agent resource loader.
   * @returns A local proxy URL, or undefined when this conversation is not covered.
   */
  abstract browserEnvironment(agent: Agent): Promise<string | undefined>

  /**
   * Retrieve one HTTP(S) target through the configured upstream, recording the
   * exchange at the controlled Client layer. TLS verification stays at the
   * Node defaults for both the proxy hop and the origin.
   * @param agent - the Agent executing the tool call.
   * @param url - the absolute HTTP(S) target.
   * @param signal - caller cancellation.
   * @returns the decoded response, bounded by the provider's normal limits.
   * @throws {@link import('@deepseek-ai/dsh-web').WebError} when not covered or retrieval fails.
   */
  abstract fetchTarget(agent: Agent | undefined, url: string, signal: AbortSignal): Promise<WebFetchResult>

  /**
   * Read the settings and status the surface renders.
   * @returns current state.
   */
  abstract get(): Promise<SecurityProxyState>

  /**
   * Merge one settings change; the provider persists it before resolving.
   * @param patch - owner-edited fields.
   * @returns state after the write.
   */
  abstract configure(patch: SecurityProxySettingsPatch): Promise<SecurityProxyState>

  /**
   * Store or remove the upstream password in the credential provider.
   * @param password - the new secret, or null to remove the record.
   * @returns state after the write.
   */
  abstract setPassword(password: string | null): Promise<SecurityProxyState>

  /**
   * Run one real proxy-path check and publish its result.
   * @returns the check outcome and the state after it.
   */
  abstract test(): Promise<SecurityProxyTestResult>

  /**
   * List retained flows, newest first.
   * @param query - optional session, kind, text, and limit filters.
   * @returns matching rows and the capture counters.
   */
  abstract list(query: SecurityProxyFlowQuery): Promise<SecurityProxyFlowsResult>

  /**
   * Read one flow's stored detail.
   * @param id - flow identity.
   * @returns the detail, or null when pruned or unknown.
   */
  abstract detail(id: string): Promise<SecurityProxyFlowDetail | null>

  /**
   * Drop every retained flow.
   * @returns the capture counters after clearing.
   */
  abstract clear(): Promise<SecurityProxyCaptureStats>

  /**
   * Pause or resume capture without changing routing.
   * @param paused - whether new flows are refused.
   * @returns state after the change.
   */
  abstract pause(paused: boolean): Promise<SecurityProxyState>
}

export default SecurityProxyRuntime
