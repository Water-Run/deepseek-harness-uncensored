/**
 * Transport factory: creates the appropriate MCP transport based on the
 * plugin's resolved config. Stdio spawns a child process (with credential
 * scrubbing); Streamable HTTP connects to a URL.
 *
 * @module
 */

import type { Transport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type { Config } from './index.ts'

/** Private networking supplied by one owned MCP connection. */
export interface McpTransportOptions {
  readonly environment?: Readonly<Record<string, string>>
  readonly fetch?: (url: string | URL, init?: RequestInit) => Promise<Response>
}

/**
 * The subprocess seam's scrubbed parent env (credential-shaped and stale
 * `DSH_*` names dropped), plus the spec's explicit env. The MCP SDK owns the
 * actual spawn, so this transport shares the scrub definition rather than the
 * spawn path.
 */
function buildChildEnv(extra: Record<string, string>, overlay?: Readonly<Record<string, string>>): Record<string, string> {
  const env = { ...scrubbedParentEnv(), ...extra }
  if (overlay === undefined) return env
  const keys = new Set(Object.keys(overlay).map(key => key.toUpperCase()))
  for (const key of Object.keys(env)) {
    if (keys.has(key.toUpperCase())) Reflect.deleteProperty(env, key)
  }
  return { ...env, ...overlay }
}

/**
 * Create an MCP transport from the resolved plugin config.
 *
 * @param config - Resolved plugin config discriminated on `transport`.
 * @param options - Optional networking owned by this connection.
 * @returns A connected-ready MCP Transport (stdio or Streamable HTTP).
 */
export function createTransport(config: Config, options?: McpTransportOptions): Transport {
  switch (config.transport) {
    case 'stdio':
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: buildChildEnv(config.env, options?.environment),
        cwd: config.cwd,
      })
    case 'streamable-http':
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        { requestInit: { headers: config.headers }, ...options?.fetch === undefined ? {} : { fetch: options.fetch } },
      )
  }
}
