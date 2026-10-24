/**
 * Client-safe payloads for the security-mode egress proxy seam. These values
 * cross the Host/Client Remote boundary, so they are plain JSON and never carry
 * proxy credentials: the password is addressed by an existing credential
 * reference and reported only as {@link SecurityProxySettings.hasPassword}.
 * @module @deepseek-ai/dsh-security-proxy/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Lifecycle of the configured upstream, as the settings surface reports it. */
export type SecurityProxyStatus = 'off' | 'connecting' | 'ready' | 'failed'

/** Why the last connection check failed; the Client owns the localized copy. */
export type SecurityProxyFailure =
  | 'invalid-config'
  | 'unreachable'
  | 'timeout'
  | 'auth'
  | 'tls'
  | 'unknown'

/** Upstream proxy transport this deployment can configure. */
export type SecurityProxyProtocol = 'http' | 'https'

/** What a captured flow actually is. */
export type SecurityProxyFlowKind = 'http' | 'tunnel'

/** Which side produced the flow: the controlled Client, or the loopback chain proxy. */
export type SecurityProxyFlowOrigin = 'client' | 'proxy'

/** How completely one tool's traffic is covered by this proxy. */
export type SecurityProxyCoverageCode = 'captured' | 'proxied' | 'partial' | 'uncovered'

/** Settings the owner edits, with the credential reduced to presence. */
export interface SecurityProxySettings {
  /** The feature switch. Off means no security traffic is routed and no listener runs. */
  enabled: boolean
  /** Transport used to reach the upstream proxy. */
  protocol: SecurityProxyProtocol
  /** Upstream proxy host name or IP literal. */
  host: string
  /** Upstream proxy TCP port. */
  port: number
  /** Whether the upstream requires Proxy-Authorization. */
  authEnabled: boolean
  /** Non-secret user name sent with Proxy-Authorization. */
  username: string
  /** Whether a password record exists in the credential store. Never the value. */
  hasPassword: boolean
  /** Ask once per security session when the proxy is off. Defaults to false. */
  warnWhenDisabled: boolean
  /** Stop appending new flows while keeping the retained ones. */
  capturePaused: boolean
  /** Retained flow count cap. */
  maxFlows: number
  /** Per-body capture cap in bytes; larger bodies are cut and flagged. */
  maxBodyBytes: number
  /** Age after which a retained flow is dropped. */
  retentionMinutes: number
}

/** One tool's real coverage, so the surface never claims more than it delivers. */
export interface SecurityProxyCoverage {
  /** Stable tool family id; the Client localizes it. */
  readonly id: 'web_fetch' | 'shell' | 'browser' | 'mcp' | 'model_api'
  /** How far this proxy reaches that family. */
  readonly code: SecurityProxyCoverageCode
}

/** Bytes and counts the capture store currently holds. */
export interface SecurityProxyCaptureStats {
  /** New flows stop being appended while paused; retained ones remain readable. */
  readonly paused: boolean
  /** Flows created since the Host started, including pruned ones. */
  readonly total: number
  /** Flows currently retained and listable. */
  readonly retained: number
  /** Captured request plus response bytes currently retained. */
  readonly bytes: number
}

/** Complete state the settings surface renders. */
export interface SecurityProxyState {
  readonly settings: SecurityProxySettings
  readonly status: SecurityProxyStatus
  /** Machine reason for the last failure; null while not failed. */
  readonly failure: SecurityProxyFailure | null
  /** Unlocalized transport diagnostic for the detail line; carries no credential. */
  readonly detail: string | null
  /** Epoch milliseconds of the last completed connection check. */
  readonly checkedAt: number | null
  /** Handshake latency of the last successful check. */
  readonly latencyMs: number | null
  readonly capture: SecurityProxyCaptureStats
  /** Session listeners currently open for child processes. */
  readonly listeners: number
  readonly coverage: readonly SecurityProxyCoverage[]
}

/** One configured field group; every field is optional and merged over the stored value. */
export interface SecurityProxySettingsPatch {
  readonly enabled?: boolean
  readonly protocol?: SecurityProxyProtocol
  readonly host?: string
  readonly port?: number
  readonly authEnabled?: boolean
  readonly username?: string
  readonly warnWhenDisabled?: boolean
  readonly capturePaused?: boolean
  readonly maxFlows?: number
  readonly maxBodyBytes?: number
  readonly retentionMinutes?: number
}

/** Result of one real proxy-path check. */
export interface SecurityProxyTestResult {
  readonly ok: boolean
  readonly durationMs: number
  readonly failure: SecurityProxyFailure | null
  readonly detail: string | null
  readonly state: SecurityProxyState
}

/** One header as captured, after default redaction. */
export interface SecurityProxyHeader {
  readonly name: string
  readonly value: string
}

/** List row for one captured exchange. */
export interface SecurityProxyFlowSummary {
  /** Stable identity within this Host lifetime. */
  readonly id: string
  /** Epoch milliseconds when the exchange started. */
  readonly at: number
  readonly kind: SecurityProxyFlowKind
  readonly origin: SecurityProxyFlowOrigin
  /** Owning conversation, or null when the exchange cannot be attributed. */
  readonly sessionId: string | null
  /** Tool that produced the exchange, such as `web_fetch` or `pwsh`. */
  readonly tool: string
  readonly method: string
  /** Absolute URL for `http` flows; `host:port` for tunnels. */
  readonly target: string
  /** Response status; null for tunnels and unfinished exchanges. */
  readonly status: number | null
  readonly durationMs: number | null
  readonly requestBytes: number
  readonly responseBytes: number
  readonly outcome: 'complete' | 'error' | 'pending'
  /** Stable note code for the surface, such as `tunnel-metadata-only`. */
  readonly note: string | null
}

/** Detail view of one captured exchange. */
export interface SecurityProxyFlowDetail extends SecurityProxyFlowSummary {
  readonly requestHeaders: readonly SecurityProxyHeader[]
  readonly responseHeaders: readonly SecurityProxyHeader[]
  /** Decoded request body, or null when absent. */
  readonly requestBody: string | null
  /** Decoded response body, or null when absent or not captured. */
  readonly responseBody: string | null
  /** Whether a stored body was cut at the captured byte cap. */
  readonly bodyTruncated: boolean
  /** Media type as reported by the response, when known. */
  readonly contentType: string | null
}

/** Filters accepted by the flow list. */
export interface SecurityProxyFlowQuery {
  readonly sessionId?: string
  readonly kind?: SecurityProxyFlowKind
  /** Case-insensitive substring over method, target, and tool. */
  readonly text?: string
  /** Row cap; the Host applies its own ceiling. */
  readonly limit?: number
}

/** Counters returned after a mutation of the capture store. */
export interface SecurityProxyFlowsResult {
  readonly flows: readonly SecurityProxyFlowSummary[]
  readonly capture: SecurityProxyCaptureStats
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The caller is not the application owner. */
    'security-proxy/owner-required': { readonly action: string }
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * The session's agent preset was chosen after creation. The owning domain is
     * `@deepseek-ai/dsh-agent-preset-registry`; this provider restates the entry
     * because it reads the committed selection to decide mode coverage and that
     * package publishes no session subpath.
     */
    'agent-preset/selected': { agentPreset: string }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One security-mode tool call ran while the independent proxy was off, at
     * most once per session. The Client renders the reminder; it changes no
     * proxy state.
     * @mode emit
     * @param sessionId - the conversation whose call triggered the reminder.
     */
    'security-proxy/warning'(sessionId: SessionId): void
  }
}
