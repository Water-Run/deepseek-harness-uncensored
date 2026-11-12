/** Security-mode MCP connections are owned by the Agent that dispatches the call. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-security-proxy'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { Dispatcher1Wrapper, ProxyAgent } from 'undici'
import type { Config } from './index.ts'
import { McpStatusCell } from './status.ts'
import { resolveReconnectPolicy, startConnection, type ConnectionHandle } from './connection.ts'
import type { McpTransportOptions } from './transport.ts'

interface OwnedConnection {
  readonly endpoint: string
  readonly handle: ConnectionHandle
  readonly abort: AbortController
  close(): Promise<void>
}

interface Lane {
  tail: Promise<void>
  connection?: OwnedConnection
  retiring?: Promise<void>
}

/** One plugin's private connections and their shutdown owner. */
export interface McpRouting {
  /** @param exec - Actual dispatch owner. @returns a routed connection, or the ordinary route. */
  select(this: void, exec: ToolExecution): Promise<ConnectionHandle | undefined> | undefined
  /** @returns after all owned connections have been retired. */
  close(): Promise<void>
}

/**
 * Keep one verified connection per Agent and selected proxy endpoint.
 * @param ctx - MCP plugin's registration owner.
 * @param config - Same server identity, authentication and protocol as the shared catalog.
 * @returns Independent dispatch and shutdown operations.
 */
export function createMcpRouting(ctx: Context, config: Config): McpRouting {
  const lanes = new Map<Agent, Lane>()
  const label = `mcp-client(${config.serverName})`
  const tool = `mcp:${config.serverName}`
  const reconnect = resolveReconnectPolicy(config.reconnect, `${label}: reconnect`)
  let closing: Promise<void> | undefined

  const retire = (agent: Agent, lane: Lane): Promise<void> => {
    if (lane.retiring !== undefined) return lane.retiring
    lane.connection?.abort.abort(new Error(`${label}: Agent connection retired`))
    lane.retiring = lane.tail.then(async () => {
      await lane.connection?.close()
      lanes.delete(agent)
    })
    return lane.retiring
  }

  ctx.on('agent/disposed', ({ agent }) => {
    const lane = lanes.get(agent)
    if (lane !== undefined) void retire(agent, lane).catch((error: unknown) => { ctx.logger.error(error) })
  })

  const connect = (endpoint: string, environment: Readonly<Record<string, string>>): OwnedConnection => {
    const abort = new AbortController()
    const dispatcher = config.transport === 'streamable-http'
      // proxy-exempt: this endpoint is the owning session's dedicated relay.
      ? new Dispatcher1Wrapper(new ProxyAgent({ uri: endpoint, proxyTunnel: false })) : undefined
    const transport: McpTransportOptions = dispatcher === undefined ? { environment: { ...environment, NODE_USE_ENV_PROXY: '1' } } : {
      fetch: (input, init) => {
        // proxy-exempt: the local relay owns the conversation's proxy, including redirects.
        const request = { ...init, dispatcher }
        return fetch(input, request)
      },
    }
    const status = new McpStatusCell((message, error) => {
      ctx.logger.warn(`${label}: ${message}`)
      if (!config.expandTemplates) ctx.logger.warn(error)
    })
    const handle = startConnection(ctx, config, reconnect, status,
      { signal: abort.signal, check: () => { abort.signal.throwIfAborted() } }, { catalogOnly: true, transport })
    return {
      endpoint, handle, abort,
      async close(): Promise<void> {
        abort.abort(new Error(`${label}: independent proxy connection changed`))
        try { await handle.disposeVerified() }
        catch (error) {
          void handle.whenClosed().then(async () => { await dispatcher?.destroy() }).catch((cleanupError: unknown) => {
            ctx.logger.error('MCP proxy dispatcher remains retained after incomplete shutdown: %o', cleanupError)
          })
          throw error
        }
        await dispatcher?.destroy()
      },
    }
  }

  const assertOpen = (lane: Lane): void => {
    if (closing !== undefined || lane.retiring !== undefined) throw new Error(`${label}: Agent connection is closing`)
  }

  return {
    select(exec) {
      if (closing !== undefined) throw new Error(`${label}: MCP connections are closing`)
      const agent = exec.agent
      if (agent === undefined) return undefined
      let lane = lanes.get(agent)
      if (lane === undefined) {
        if (ctx.get('securityProxy')?.route(agent, tool) === undefined) return undefined
        lane = { tail: Promise.resolve() }
        lanes.set(agent, lane)
      }
      const owner = lane
      const selection = owner.tail.then(async () => {
        assertOpen(owner)
        exec.signal.throwIfAborted()
        const proxy = ctx.get('securityProxy')
        const environment = await proxy?.environment(agent, tool)
        assertOpen(owner)
        exec.signal.throwIfAborted()
        if (environment === undefined && ctx.get('securityProxy')?.route(agent, tool) !== undefined) {
          throw new Error(`${label}: proxy routing changed during connection setup; retry the operation`)
        }
        const endpoint = environment?.HTTP_PROXY
        if (environment !== undefined && endpoint === undefined) throw new Error(`${label}: missing independent HTTP proxy`)
        if (owner.connection?.endpoint !== endpoint || owner.connection?.abort.signal.aborted === true) {
          await owner.connection?.close()
          delete owner.connection
        }
        assertOpen(owner)
        exec.signal.throwIfAborted()
        if (endpoint === undefined || environment === undefined) return undefined
        const connection = owner.connection ??= connect(endpoint, environment)
        const ready = await connection.handle.ready
        assertOpen(owner)
        exec.signal.throwIfAborted()
        if (ready.error !== undefined && !reconnect.enabled) {
          await connection.close()
          delete owner.connection
          throw new Error(`${label}: independent proxy connection failed`, { cause: ready.error })
        }
        return connection.handle
      })
      owner.tail = selection.then(() => undefined, () => undefined)
      return selection
    },
    close() {
      closing ??= Promise.allSettled([...lanes].map(([agent, lane]) => retire(agent, lane))).then((results) => {
        const failures: unknown[] = []
        for (const result of results) {
          if (result.status === 'rejected') failures.push(result.reason)
        }
        if (failures.length > 0) throw new AggregateError(failures, `${label}: independent proxy connections could not close`)
      })
      return closing
    },
  }
}
