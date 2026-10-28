/** REA connection preferences and owner-facing diagnostics. @module */

/** Executor-owned admission retained until the native transport and its calls have closed. */
export interface ReaExecutionLease {
  /** Revokes the whole connection, including work already queued. */
  readonly signal: AbortSignal
  /** Reject before allocating the process and immediately before each upstream call. */
  check(): void
  /** Release the execution owner's resources after native close and request settlement. */
  release(): void
}

/** Persisted launch preferences; executable paths refer to physical host files. */
export interface ReaOptions {
  /** Permit Reverse conversations to start REA; defaults to false. */
  enabled: boolean
  /** Physical executable for a Node version supported by the installed REA. */
  nodePath: string
  /** Physical path to the installed rea-agents/scripts/rea.mjs entry. */
  cliPath: string
  /** Optional Ghidra installation directory; empty delegates discovery to REA. */
  ghidraPath: string
  /** Optional Java home directory passed to the engine process. */
  javaHome: string
  /** Optional path to an existing IDA MCP configuration. */
  idaConfig: string
  /** Native analysis provider; auto lets REA select an installed engine. */
  provider: 'auto' | 'ghidra' | 'ida' | 'hopper' | 'kuna'
  /** Maximum milliseconds for MCP negotiation and catalog discovery. */
  startupTimeoutMs: number
  /** Maximum milliseconds for one external analysis call. */
  toolTimeoutMs: number
  /** Maximum tools returned on one discovery page. */
  catalogPageSize: number
}

/** Result of an explicit, temporary MCP connection check. */
export interface ReaProbe {
  name: string
  version: string
  toolCount: number
  tools: string[]
  /** Paths are configured inputs, not claims that an engine completed analysis. */
  engines: { name: string; state: 'configured' | 'discover' | 'missing' | 'unreadable'; path: string }[]
}
