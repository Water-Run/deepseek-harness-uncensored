/** Real MCP tool and resource traffic over an Agent-owned independent proxy. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import McpResources from '@deepseek-ai/dsh-mcp-resources'
import * as SecurityProxy from '@deepseek-ai/dsh-security-proxy-local'
import { SessionId } from '@deepseek-ai/dsh-session'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { startLocalProxy, startLocalTarget, startTcpEcho } from '../../../guard/security-proxy-local/tests/support/local-proxy.ts'
import * as McpClient from '../src/index.ts'
import { startHttpMcpFixture } from './http-fixture.ts'

async function fixture(target: { url: string; close(): Promise<void> }) {
  const ctx = new Context()
  const cleanup = [() => target.close()]
  const root = mkdtemp(join(tmpdir(), 'dsh-mcp-routing-'))
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally {
      try { await Promise.all(cleanup.map(close => close())) }
      finally {
        await root.then(path => rm(path, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }), () => {
          // Fixture setup reports the failed allocation and has no directory to clean.
        })
      }
    }
  })
  const dshHome = await root
  const echo = await startTcpEcho()
  cleanup.push(() => echo.close())
  const upstream = await startLocalProxy({ origins: new Set([new URL(target.url).origin]),
    tunnels: new Set([`127.0.0.1:${echo.port}`, new URL(target.url).host]) })
  cleanup.push(() => upstream.close())
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(McpResources)
  await ctx.plugin(CredentialsLocal, { dshHome, watch: false })
  await ctx.plugin(SecurityProxy, SecurityProxy.Config({ path: join(dshHome, 'proxy.json'), testHost: '127.0.0.1', testPort: echo.port }))
  const security = await ctx.agents.create({ sessionId: SessionId('proxy-security'), meta: { agentPreset: 'security' } })
  const ordinary = await ctx.agents.create({ sessionId: SessionId('proxy-ordinary'), meta: { agentPreset: 'standard' } })
  expect((await ctx.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })).status).toBe('ready')
  return { ctx, dshHome, upstream, security, ordinary }
}

it('routes HTTP tools and resources by session without using the ordinary connection', async () => {
  const server = await startHttpMcpFixture()
  const { ctx, upstream, security, ordinary } = await fixture(server)
  await ctx.plugin(McpClient, McpClient.Config({ transport: 'streamable-http', serverName: 'fixture', url: server.url, failOnStartupError: true }))
  expect(upstream.requests).toEqual([])
  const call = (owner: typeof security, name: string, args = {}) => executeToolFixture(ctx, {
    agent: owner.agent, name, arguments: args, callId: ToolCallId(`routing-${owner.agent.id}-${name}`), signal: AbortSignal.timeout(15000),
  })
  expect((await call(ordinary, 'mcp__fixture__ping')).isError).toBe(false)
  expect(upstream.requests).toEqual([])
  const proxied = await call(security, 'mcp__fixture__ping')
  expect(proxied.isError, JSON.stringify(proxied)).toBe(false)
  expect(proxied.content).toEqual([{ type: 'text', text: 'pong' }])
  const read = await call(security, 'read_mcp_resource', { server: 'fixture', uri: 'test://routing' })
  expect(read.isError, JSON.stringify(read)).toBe(false)
  expect(JSON.stringify(read.content)).toContain('routed resource body')
  const { flows } = await ctx.securityProxy.list({})
  expect(flows.length).toBeGreaterThan(0)
  expect(flows.every(row => row.sessionId === security.agent.id && row.tool === 'mcp:fixture')).toBe(true)
  const details = await Promise.all(flows.map(row => ctx.securityProxy.detail(row.id)))
  expect(details.some(row => row?.requestBody?.includes('tools/call'))).toBe(true)
  expect(details.some(row => row?.requestBody?.includes('resources/read'))).toBe(true)
  const requests = upstream.requests.length
  await ctx.securityProxy.configure({ enabled: false })
  expect((await call(security, 'mcp__fixture__ping')).isError).toBe(false)
  expect(upstream.requests).toHaveLength(requests)
})

it('keeps each stdio server state independent and routes its real Node fetches', async () => {
  const target = await startLocalTarget('stdio proxy fixture')
  const { ctx, dshHome, upstream, security, ordinary } = await fixture(target)
  const server = fileURLToPath(new URL('./proxy-stdio-server.mjs', import.meta.url))
  await ctx.plugin(McpClient, McpClient.Config({ transport: 'stdio', serverName: 'stdio', command: process.execPath,
    args: [server, target.url], cwd: dshHome, failOnStartupError: true }))
  let sequence = 0
  const inspect = (owner: typeof security) => executeToolFixture(ctx, {
    agent: owner.agent, name: 'mcp__stdio__inspect', arguments: {}, callId: ToolCallId(`stdio-routing-${++sequence}`),
    signal: AbortSignal.timeout(15000),
  })
  expect((await inspect(ordinary)).content).toEqual([{ type: 'text', text: 'stdio proxy fixture:1' }])
  expect(upstream.requests).toEqual([])
  const first = await inspect(security)
  expect(first.isError, JSON.stringify(first)).toBe(false)
  expect(first.content).toEqual([{ type: 'text', text: 'stdio proxy fixture:1' }])
  expect((await inspect(security)).content).toEqual([{ type: 'text', text: 'stdio proxy fixture:2' }])
  const tunnels = upstream.tunnels.filter(row => row.authority === new URL(target.url).host)
  expect(tunnels.length).toBeGreaterThan(0)
  await ctx.securityProxy.configure({ enabled: false })
  expect((await inspect(security)).content).toEqual([{ type: 'text', text: 'stdio proxy fixture:2' }])
  const { flows } = await ctx.securityProxy.list({})
  expect(flows).toHaveLength(tunnels.length)
  for (const flow of flows) {
    expect(flow).toMatchObject({ sessionId: security.agent.id, tool: 'mcp:stdio', kind: 'tunnel' })
    expect(flow.requestBytes).toBeGreaterThan(0)
    expect(flow.responseBytes).toBeGreaterThan(0)
  }
})
