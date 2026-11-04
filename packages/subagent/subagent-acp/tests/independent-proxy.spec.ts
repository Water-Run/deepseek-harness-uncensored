/** Real ACP child traffic through the delegating Security session's relay. */
import { Context } from '@deepseek-ai/cordis'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import * as SecurityProxy from '@deepseek-ai/dsh-security-proxy-local'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { startLocalProxy, startLocalTarget, startTcpEcho } from '../../../guard/security-proxy-local/tests/support/local-proxy.ts'
import { externalTestParent, startExternalActivation } from '../../subagent/tests/external-activation-helpers.ts'
import { mountWorkingDirectoryFixture } from '../../subagent/tests/working-directory-fixture.ts'
import * as acp from '../src/index.ts'

it('routes only Security delegates and attributes their tunnel to the parent session', async ({ onTestFinished }) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-delegate-proxy-'))
  const ctx = new Context()
  const close: Array<() => Promise<void>> = []
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally {
      try { await Promise.all(close.map(dispose => dispose())) }
      finally { await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }) }
    }
  })
  const target = await startLocalTarget('ACP delegate reached the local target')
  close.push(() => target.close())
  const echo = await startTcpEcho()
  close.push(() => echo.close())
  const authority = new URL(target.url).host
  const upstream = await startLocalProxy({ origins: new Set(), tunnels: new Set([authority, `127.0.0.1:${echo.port}`]) })
  close.push(() => upstream.close())

  const parent = await externalTestParent(ctx, root)
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(CredentialsLocal, { dshHome: root, watch: false })
  await ctx.plugin(SecurityProxy, SecurityProxy.Config({ path: join(root, 'proxy.json'), testHost: '127.0.0.1', testPort: echo.port }))
  await ctx.plugin(acp, acp.Config({
    providerName: 'acp-fixture',
    command: process.execPath,
    args: [fileURLToPath(new URL('./mock-acp-server.ts', import.meta.url))],
    permission: 'reject',
    env: { MOCK_FETCH_URL: target.url, NODE_USE_ENV_PROXY: '0', no_proxy: '127.0.0.1' },
  }))
  expect((await ctx.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })).status).toBe('ready')
  const send = async (): Promise<void> => {
    const run = await startExternalActivation(ctx, 'acp-fixture', {
      prompt: [{ type: 'text', text: 'Check the local fixture' }], parent, signal: AbortSignal.timeout(15_000),
    })
    try {
      expect(await run.result).toMatchObject({
        stopReason: 'completed', output: [{ type: 'text', text: 'ACP delegate reached the local target' }],
      })
    } finally { await run.dispose() }
  }
  const targetTunnels = () => upstream.tunnels.filter(tunnel => tunnel.authority === authority)
  await send()
  expect(targetTunnels()).toHaveLength(0)
  parent.session.append('agent-preset/selected', { agentPreset: 'security' })
  await send()
  expect(targetTunnels()).toHaveLength(1)
  parent.session.append('agent-preset/selected', { agentPreset: 'standard' })
  await send()
  expect(targetTunnels()).toHaveLength(1)
  await ctx.securityProxy.configure({ enabled: false })
  const { flows } = await ctx.securityProxy.list({})
  expect(flows).toEqual([expect.objectContaining({
    sessionId: parent.id, tool: 'subagent:acp-fixture', kind: 'tunnel', target: authority,
  })])
  expect(flows[0]?.responseBytes).toBeGreaterThan(0)
})
