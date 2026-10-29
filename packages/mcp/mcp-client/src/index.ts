/**
 * MCP client bridge plugin: connects to an external MCP server and registers
 * its tools on `ctx.tools` under server-qualified public names
 * (`mcp__<serverName>__<rawName>`). Each plugin instance connects to one MCP
 * server; load multiple instances in `cordis.yml` for multiple servers.
 *
 * Namespace plugin (named exports, no default export). Lifecycle is
 * effect-scoped: disposal disconnects from the server, unregisters all tools,
 * and releases the `serverName` namespace reservation. HMR hot-swaps by
 * disposing the old instance and creating a new one; identical `serverName`
 * reproduces identical public tool names.
 *
 * @module @deepseek-ai/dsh-mcp-client
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { DEFAULT_MAX_INSTRUCTION_BYTES, RECONNECT_DEFAULTS, resolveReconnectPolicy, startConnection } from './connection.ts'
import type { ReconnectConfig } from './connection.ts'
import type { ConnectionHandle } from './connection.ts'
import type { McpExecutionLease } from './execution.ts'
import { registerServerContext } from './server-context.ts'
import { reserveServerName } from './namespaces.ts'
// Side-effect type import: declaration-merges `ctx.tools` onto Context.
import type {} from '@deepseek-ai/dsh-tools'

export { createMcpToolDefinition, publicToolName } from './tools.ts'
export type { McpResult, McpToolDefinitionOptions } from './tools.ts'
export type { ReconnectConfig, ResolvedReconnectPolicy } from './connection.ts'
export type { McpExecutionPolicy, McpExecutionLease } from './execution.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-client'

/** Services required by this plugin. */
export const inject = ['tools']

/** Default timeout for individual MCP tool calls and resource requests (ms). */
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

/** Valid `serverName`, kept below the public tool-name budget. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

// ---- Config ----

/** Config for connecting to an MCP server via a spawned child process over stdio. */
export interface StdioConfig {
  /** Selects child-process stdio transport. */
  transport: 'stdio'
  /**
   * Stable local namespace for this server's model-facing tool names
   * (`mcp__<serverName>__<rawName>`). Must match `[A-Za-z0-9_-]{1,32}` and be
   * unique across live mcp-client instances.
   */
  serverName: string
  /** Executable used to start the server. */
  command: string
  /** Arguments passed directly, without shell interpolation. */
  args: string[]
  /** Extra env vars merged on top of scrubbed ambient env. */
  env: Record<string, string>
  /** Working directory for the child process. */
  cwd: string
  /** Timeout per tool call or resource request in milliseconds. */
  toolCallTimeoutMs: number
  /** Fail plugin activation when the initial connection or tool synchronization fails. */
  failOnStartupError: boolean
  /** Maximum UTF-8 bytes of attributed server instructions (default 32768). */
  maxInstructionBytes?: number
  /** Automatic reconnect policy after a lost connection; omission uses the defaults. */
  reconnect?: ReconnectConfig
}

/** Config for connecting to an MCP server over Streamable HTTP (SSE). */
export interface StreamableHttpConfig {
  /** Selects Streamable HTTP transport. */
  transport: 'streamable-http'
  /**
   * Stable local namespace for this server's model-facing tool names
   * (`mcp__<serverName>__<rawName>`). Must match `[A-Za-z0-9_-]{1,32}` and be
   * unique across live mcp-client instances.
   */
  serverName: string
  /** MCP endpoint URL. */
  url: string
  /** Additional headers attached to MCP requests. */
  headers: Record<string, string>
  /** Timeout per tool call or resource request in milliseconds. */
  toolCallTimeoutMs: number
  /** Fail plugin activation when the initial connection or tool synchronization fails. */
  failOnStartupError: boolean
  /** Maximum UTF-8 bytes of attributed server instructions (default 32768). */
  maxInstructionBytes?: number
  /** Automatic reconnect policy after a lost connection; omission uses the defaults. */
  reconnect?: ReconnectConfig
}

/** Configuration for one stdio or Streamable HTTP MCP server. */
export type Config = StdioConfig | StreamableHttpConfig

type StdioConfigInput = Omit<StdioConfig, 'args' | 'env' | 'cwd' | 'toolCallTimeoutMs' | 'failOnStartupError'>
  & Partial<Pick<StdioConfig, 'args' | 'env' | 'cwd' | 'toolCallTimeoutMs' | 'failOnStartupError'>>
type StreamableHttpConfigInput = Omit<StreamableHttpConfig, 'headers' | 'toolCallTimeoutMs' | 'failOnStartupError'>
  & Partial<Pick<StreamableHttpConfig, 'headers' | 'toolCallTimeoutMs' | 'failOnStartupError'>>
type ConfigInput = StdioConfigInput | StreamableHttpConfigInput

const Reconnect: z<ReconnectConfig> = z.object({
  enabled: z.boolean().default(RECONNECT_DEFAULTS.enabled),
  initialDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(RECONNECT_DEFAULTS.initialDelayMs),
  maxDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(RECONNECT_DEFAULTS.maxDelayMs),
  maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(RECONNECT_DEFAULTS.maxAttempts),
})

export const Config = z.union([
  z.object({
    transport: z.const('stdio'),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
    command: z.string().required(),
    args: z.array(String).default([]),
    env: z.dict(String).default({}),
    cwd: z.string().default(''),
    toolCallTimeoutMs: z.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
    failOnStartupError: z.boolean().default(false),
    maxInstructionBytes: z.number().step(1).min(1).default(DEFAULT_MAX_INSTRUCTION_BYTES),
    reconnect: Reconnect,
  }),
  z.object({
    transport: z.const('streamable-http'),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
    url: z.string().required(),
    headers: z.dict(String).default({}),
    toolCallTimeoutMs: z.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
    failOnStartupError: z.boolean().default(false),
    maxInstructionBytes: z.number().step(1).min(1).default(DEFAULT_MAX_INSTRUCTION_BYTES),
    reconnect: Reconnect,
  }),
]) as z<ConfigInput, Config>

// ---- Plugin apply ----

/**
 * Connect one MCP server and publish its initial tool generation before activation.
 * This entry remains explicitly `async`: Cordis treats a prototype-bearing
 * ordinary function as a constructor, whose returned Promise is not startup work.
 * @param ctx - plugin context carrying the tool registry.
 * @param config - resolved transport and server namespace configuration.
 * @returns startup readiness after connection and initial tool discovery settle.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  await mountMcpClient(ctx, config, undefined)
}

/** One mounted MCP supervisor, including startup and verified native shutdown. */
export interface McpClientLifetime {
  /** Initial connection and discovery; callers await it before using the tools. */
  ready: Promise<void>
  /** Stop calls and reconnection; reject when native closure remains unconfirmed. */
  close(): Promise<void>
  /** Resolve after native transports and active requests actually settle, including late closure. */
  whenClosed(): Promise<void>
}

/**
 * Mount one MCP bridge with an optional executor-owned lease.
 * @param ctx - Plugin owner providing tools and any required policy service.
 * @param config - Resolved server and reconnect settings.
 * @param execution - Explicit guarded admission; omission is the ordinary provider behavior.
 * @returns Initial connection and discovery readiness. The owner retains failed cleanup until native closure is confirmed.
 */
export async function mountMcpClient(ctx: Context, config: Config, execution: McpExecutionLease | undefined): Promise<void> {
  await createMcpClient(ctx, config, execution).ready
}

/**
 * Mount an MCP supervisor and expose its lifetime before startup can fail.
 * @param ctx - Plugin owner with the tool registry and any mandatory execution policy.
 * @param config - Resolved server transport and discovery settings.
 * @param execution - Optional executor-owned admission and resource retention.
 * @returns Startup readiness, verified shutdown and actual transport settlement.
 */
export function createMcpClient(ctx: Context, config: Config, execution: McpExecutionLease | undefined): McpClientLifetime {
  let connection: ConnectionHandle | undefined = undefined
  let stopping: Promise<void> | undefined
  const dispose = (): Promise<void> => stopping ??= (async () => {
    execution?.signal.removeEventListener('abort', revoke)
    if (execution === undefined) await connection?.dispose()
    else {
      if (connection === undefined) execution.release()
      else {
        void connection.whenClosed().then(() => { execution.release() }, (error: unknown) => {
          ctx.logger.error('MCP rule resources remain retained because shutdown could not settle: %o', error)
        })
        await connection.disposeVerified()
      }
    }
  })()
  const revoke = (): void => { void dispose().catch((error: unknown) => { ctx.logger.error('MCP execution could not close: %o', error) }) }
  ctx.effect(() => dispose, 'mcp-client.connection')
  execution?.signal.addEventListener('abort', revoke, { once: true })
  execution?.signal.throwIfAborted(); execution?.check()
  // Validate reconnect settings before registering a server or starting its transport.
  const reconnect = resolveReconnectPolicy(config.reconnect, `mcp-client(${config.serverName}): reconnect`)

  // Reserve the namespace next: a duplicate `serverName` fails THIS instance
  // at load with an actionable error and leaves the earlier instance intact.
  ctx.effect(() => reserveServerName(ctx, config.serverName), 'mcp-client.serverName')

  // The supervisor owns the client/transport generations, the reconnect
  // loop, and the live tool registrations; disposal stops reconnection,
  // quiesces in-flight work, and unregisters the current generation.
  connection = startConnection(ctx, config, reconnect, execution)
  registerServerContext(ctx, config.serverName, connection)
  // Cordis announces unload before awaiting an unfinished apply(). Closing
  // the transport here releases startup requests that are still awaiting a reply.
  ctx.on('internal/plugin', (fiber) => {
    if (fiber !== ctx.fiber || fiber.uid !== null) return
    revoke()
  }, { global: true })

  // Block plugin activation on the initial connection + tool discovery so
  // Cordis consumers observe the tools immediately after the fiber activates.
  // When failOnStartupError is true, a failed initial attempt rejects the
  // fiber (Cordis rolls it back); otherwise the error is logged and the
  // supervisor enters its reconnect loop.
  const ownedConnection = connection
  const ready = connection.ready.then((outcome) => {
    if (outcome.error !== undefined && config.failOnStartupError) {
      throw new Error(`mcp-client(${config.serverName}): initial connection or tool synchronization failed`, { cause: outcome.error })
    }
  })
  return { ready, close: () => ownedConnection.disposeVerified(), whenClosed: () => ownedConnection.whenClosed() }
}
