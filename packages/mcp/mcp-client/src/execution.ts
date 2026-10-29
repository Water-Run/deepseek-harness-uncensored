/** Executor admission supplied by an explicitly guarded MCP composition. @module */

/** Checks come from the executor owner, never MCP tool annotations or model arguments. */
export interface McpExecutionPolicy {
  /** Revokes transport acquisition, reconnects and all protocol requests. */
  readonly signal: AbortSignal
  /** Reject before connection or dispatch when current policy cannot authorize the effects. */
  check(): void
}

/** Rule resources remain owned until the MCP supervisor confirms transport shutdown. */
export interface McpExecutionLease extends McpExecutionPolicy {
  /** Release only after verified disposal; unknown transport closure must retain the owner. */
  release(): void
}
