/** Reverse-preset consumer: discover REA tools on demand within one Agent. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createMcpToolDefinition, publicToolName } from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-working-directory'
import type {} from './index.ts'

/** Cordis diagnostics name. */
export const name = 'rea-agent'
/** Services that own tool routing, process configuration, and execution policy. */
export const inject = ['rea', 'tools', 'agents', 'sandboxPolicy', 'workingDirectory']

type OwnedConnection = Awaited<ReturnType<Context['rea']['connect']>>
interface Owner {
  scope: Scope
  abort: AbortController
  ready: Promise<OwnedConnection>
  selected: Set<string>
  close: () => Promise<void>
}

/**
 * Mount lazy discovery and Agent-owned external tool definitions.
 * @param ctx - Reverse preset context; no other preset mounts this consumer.
 */
export function apply(ctx: Context): void {
  const owners = new Map<Agent, Owner>()
  const cleanups = new Map<Agent, () => Promise<void>>()
  let stopped = false
  const authorize = (agent: Agent | undefined): Agent => {
    if (stopped || agent === undefined || ctx.agents.get(agent.id) !== agent) throw new Error('REA requires a live reverse conversation')
    if (!ctx.rea.options.enabled) throw new Error('REA is disabled. Configure it in Reverse settings.')
    if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode !== 'danger-full-access') {
      throw new Error('REA external engines require full access; the current conversation policy does not allow this process.')
    }
    return agent
  }
  const ownerFor = (agent: Agent): Owner => {
    const existing = owners.get(agent)
    if (existing !== undefined) return existing
    const abort = new AbortController()
    const scope = createScope(ctx, agent)
    const selected = new Set<string>()
    const ready = ctx.workingDirectory.ensure(agent, abort.signal).then(cwd => ctx.rea.connect(cwd, abort.signal))
    let closing: Promise<void> | undefined
    const close = (): Promise<void> => closing ??= (async () => {
      abort.abort(new Error('REA Agent disposed'))
      const opened = await Promise.allSettled([ready])
      if (opened[0].status === 'fulfilled') await opened[0].value.dispose()
      await scope.dispose()
      owners.delete(agent)
    })()
    const owner = { abort, scope, selected, ready, close }
    owners.set(agent, owner)
    if (!cleanups.has(agent)) {
      cleanups.set(agent, agent.ctx.effect(() => async () => {
        await owners.get(agent)?.close()
        cleanups.delete(agent)
      }, 'rea.agent.connection'))
    }
    // An abandoned startup still has an observer and remains owned until close.
    void ready.catch(() => {})
    return owner
  }
  ctx.effect(() => async () => {
    stopped = true
    const settled = await Promise.allSettled([...owners.values()].map(owner => owner.close()))
    const errors: unknown[] = []
    for (const result of settled) if (result.status === 'rejected') errors.push(result.reason)
    if (errors.length > 0) throw new AggregateError(errors, 'REA Agent cleanup failed')
    await Promise.all([...cleanups.values()].map(dispose => dispose()))
  }, 'rea.agent.connections')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rea_tools',
    description: 'Find REA analysis tools by keyword, then enable exact tool names with names. Enabled tools become directly callable in this conversation. All available tools can be discovered in pages; optional engines must be installed on the host. reset closes this conversation’s REA process and discards its active analysis target. Record verified findings in the reverse case ledger.',
    parameters: {
      query: { type: 'string', description: 'Search tool names and descriptions; omit for all tools.' },
      offset: { type: 'integer', description: 'Zero-based page offset.' },
      names: { type: 'array', items: { type: 'string' }, description: 'Exact upstream tool names to enable.' },
      reset: { type: 'boolean', description: 'Explicitly discard the active REA process before connecting again.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const agent = authorize(exec.agent)
      if (args.reset) await owners.get(agent)?.close()
      const owner = ownerFor(agent)
      let cancellation: Promise<void> | undefined
      const cancel = (): void => { cancellation = owner.close(); void cancellation.catch(() => {}) }
      exec.signal.addEventListener('abort', cancel, { once: true })
      let opened: OwnedConnection
      try { opened = await owner.ready }
      finally {
        exec.signal.removeEventListener('abort', cancel)
        if (cancellation !== undefined) await cancellation
      }
      const { connection } = opened
      exec.signal.throwIfAborted()
      authorize(agent)
      const catalog = connection.tools()
      const names = args.names ?? []
      const chosen = names.map((rawName) => {
        const tool = catalog.find(entry => entry.name === rawName)
        if (tool === undefined) throw new Error(`Unknown REA tool: ${rawName}`)
        return tool
      })
      for (const tool of chosen) {
        if (owner.selected.has(tool.name)) continue
        owner.scope.ctx.effect(() => owner.scope.ctx.tools.register(createMcpToolDefinition(owner.scope.ctx, {
          name: publicToolName('rea', tool.name), rawName: tool.name, description: tool.description ?? tool.name,
          inputSchema: tool.inputSchema, outputSchema: tool.outputSchema,
          taskRequired: tool.execution?.taskSupport === 'required',
          call: async (arguments_, call) => {
            if (authorize(call.agent) !== agent) throw new Error('This REA tool belongs to another conversation')
            return connection.call(tool, arguments_, call.signal)
          },
        })), `rea.tool.${tool.name}`)
        owner.selected.add(tool.name)
      }
      const query = (args.query ?? '').trim().toLocaleLowerCase('en-US')
      const matched = catalog.filter(tool => `${tool.name}\n${tool.description ?? ''}`.toLocaleLowerCase('en-US').includes(query))
      const offset = args.offset ?? 0
      if (offset < 0) throw new Error('REA catalog offset must be nonnegative')
      const page = matched.slice(offset, offset + ctx.rea.options.catalogPageSize)
      return { server: connection.describe().version, total: matched.length,
        nextOffset: offset + page.length < matched.length ? offset + page.length : null,
        tools: page.map(tool => ({ name: tool.name, description: tool.description ?? '' })),
        enabled: chosen.map(tool => publicToolName('rea', tool.name)) }
    },
    presentCall: args => ({ card: 'generic', title: 'REA tools', kind: 'other', rawInput: args }),
  })), 'rea.discovery')
}
