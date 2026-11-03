/** Recorded terminal-route attribution using actual loopback HTTP traffic. @module */
import type { Context } from '@deepseek-ai/cordis'
import { request } from 'node:http'
import assert from 'node:assert/strict'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-security-proxy'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { startLocalProxy, startLocalTarget } from './support/local-proxy.ts'

/** Cordis test fixture name. */
export const name = 'terminal-proxy-snapshot'
/** The shipped profile supplies routing, credentials and tool execution. */
export const inject = ['tools', 'securityProxy']

/** @param ctx - Private recorded-session profile owner. */
export async function apply(ctx: Context): Promise<void> {
  const upstream = await startLocalProxy()
  const resources: { target?: Awaited<ReturnType<typeof startLocalTarget>> } = {}
  ctx.effect(() => async () => {
    await Promise.all([upstream.close(), resources.target?.close()])
  }, 'terminal-proxy-snapshot.listeners')
  const target = resources.target = await startLocalTarget()
  const targetUrl = target.url
  await ctx.securityProxy.configure({ host: '127.0.0.1', port: upstream.port, enabled: true })
  let route: string | undefined
  let sessionId: SessionId | undefined
  const fetchThrough = (proxy: string): Promise<string> => new Promise((resolve, reject) => {
    const endpoint = new URL(proxy)
    const call = request({ hostname: endpoint.hostname, port: endpoint.port, path: targetUrl,
      headers: { host: new URL(targetUrl).host } }, (response) => {
      let body = ''
      response.setEncoding('utf8'); response.on('data', (chunk: string) => { body += chunk })
      response.on('end', () => { resolve(body) })
    })
    call.on('error', reject); call.end()
  })
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_terminal_proxy', description: 'Verify a security terminal route carries and captures the owned HTTP response.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      assert.ok(exec.agent)
      exec.agent.session.append('agent-preset/selected', { agentPreset: 'security' })
      const environment = await ctx.securityProxy.environment(exec.agent, 'terminal_open')
      assert.ok(environment)
      route = environment.HTTP_PROXY; sessionId = exec.agent.session.id
      assert.ok(route)
      assert.equal(await fetchThrough(route), 'target body')
      const flow = (await ctx.securityProxy.list({})).flows.find(item => item.tool === 'terminal_open')
      assert.ok(flow)
      assert.equal((await ctx.securityProxy.detail(flow.id))?.responseBody, 'target body')
      return 'Terminal traffic passed through the session proxy and its response was captured.'
    },
  })))
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_terminal_attribution', description: 'Open a command route and verify the original terminal retains its traffic attribution.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      assert.ok(route)
      const command = await ctx.securityProxy.environment(exec.agent, 'pwsh')
      assert.ok(command)
      assert.notEqual(command.HTTP_PROXY, route)
      assert.equal(await fetchThrough(route), 'target body')
      const flows = (await ctx.securityProxy.list({})).flows
      assert.equal(flows.filter(item => item.tool === 'terminal_open' && item.sessionId === sessionId).length, 2)
      return 'Opening a command route preserved the terminal traffic attribution.'
    },
  })))
}
