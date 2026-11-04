/** Local upstream and registered parent for keyless native delegate tests. */
import type { Context } from '@deepseek-ai/cordis'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import * as SecurityProxy from '@deepseek-ai/dsh-security-proxy-local'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, onTestFinished } from 'vitest'
import { startLocalProxy, startTcpEcho } from '../../../guard/security-proxy-local/tests/support/local-proxy.ts'
import { externalTestParent } from './external-activation-helpers.ts'

/** Install a parent-specific proxy that can only forward to the fixture's address. */
export async function setupExternalProxy(ctx: Context, cwd: string, url: string, tunnelAlias?: string) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-external-proxy-'))
  const cleanup: Array<() => Promise<void>> = []
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally {
      try { await Promise.all(cleanup.map(close => close())) }
      finally { await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }) }
    }
  })
  const target = new URL(url)
  const echo = await startTcpEcho()
  cleanup.push(() => echo.close())
  const upstream = await startLocalProxy({
    origins: new Set([tunnelAlias === undefined ? target.origin : `${target.protocol}//${tunnelAlias}`]),
    tunnels: new Set([tunnelAlias ?? target.host, `127.0.0.1:${echo.port}`]),
    ...tunnelAlias === undefined ? {} : { aliases: new Map([[tunnelAlias, target.host]]) },
  })
  cleanup.push(() => upstream.close())
  await ctx.plugin(CredentialsLocal, { dshHome: directory, watch: false })
  await ctx.plugin(SecurityProxy, SecurityProxy.Config({ path: join(directory, 'proxy.json'), testHost: '127.0.0.1', testPort: echo.port }))
  expect((await ctx.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })).status).toBe('ready')
  const parent = await externalTestParent(ctx, cwd)
  parent.session.append('agent-preset/selected', { agentPreset: 'security' })
  return { parent }
}
