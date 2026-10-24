/**
 * Service Definition for the security-mode egress proxy seam (`ctx.securityProxy`).
 *
 * The seam answers three questions for a tool execution: whether this Agent's
 * session is a security-mode session the proxy serves, which environment a child
 * process needs to reach it, and how to retrieve one target through it while
 * recording the exchange. The provideing plugin owns configuration, the upstream
 * connection, the loopback chain proxy, and the capture store; consumers never
 * build a transport of their own.
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
  abstract environment(agent: Agent | undefined, tool: string): Readonly<Record<string, string>> | undefined

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
}

export default SecurityProxyRuntime
