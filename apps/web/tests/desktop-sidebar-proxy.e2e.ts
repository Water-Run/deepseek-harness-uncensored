/** A cold, recorded Security conversation supplies the proxy to a real native sidebar guest. */
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createWebConnectionRpc } from '@deepseek-ai/dsh-client-connection/src/client/rpc.ts'
import type {} from '@deepseek-ai/dsh-security-proxy'
import { startLocalProxy, startLocalTarget, startTcpEcho } from '../../../packages/guard/security-proxy-local/tests/support/local-proxy.ts'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const electron = process.env.DSH_DESKTOP_BROWSER_EXECUTABLE

it.skipIf(electron === undefined)('isolates an actual desktop browser from ordinary networking and captures the recorded Security owner',
  { timeout: 120_000, retry: 0 }, async () => {
    if (electron === undefined) throw new Error('Set DSH_DESKTOP_BROWSER_EXECUTABLE to the development Electron executable')
    const root = await mkdtemp(join(tmpdir(), 'dshu-sidebar-browser-'))
    let target: Awaited<ReturnType<typeof startLocalTarget>> | undefined
    let control: Awaited<ReturnType<typeof startLocalTarget>> | undefined
    let echo: Awaited<ReturnType<typeof startTcpEcho>> | undefined
    let upstream: Awaited<ReturnType<typeof startLocalProxy>> | undefined
    let scaffold: WebScaffold | undefined
    try {
      target = await startLocalTarget('sidebar fixture body')
      control = await startLocalTarget('control fixture must not be reached')
      echo = await startTcpEcho()
      const owned = [new URL(target.url), new URL(control.url)]
      upstream = await startLocalProxy({ origins: new Set(owned.map(url => url.origin)),
        tunnels: new Set([`127.0.0.1:${echo.port}`, ...owned.map(url => url.host)]) })
      const overlay = join(root, 'cordis.patch.yml')
      await writeFile(overlay, JSON.stringify([{ id: 'security-proxy', config: {
        path: join(root, 'proxy.json'), testHost: '127.0.0.1', testPort: echo.port,
      } }]))
      const host = scaffold = await launchWebScaffold({ extraOverlayPath: overlay })
      const configured = await host.ctx.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })
      expect(configured.status).toBe('ready')
      const rpc = createWebConnectionRpc((path, init) => host.hostFetch(String(path), init))
      const securityId = SessionId('desktop-proxy-security')
      const ordinaryId = SessionId('desktop-proxy-ordinary')
      for (const [id, mode] of [[securityId, 'security'], [ordinaryId, 'standard']] as const) {
        const handle = await host.ctx.agents.create({ sessionId: id, meta: { cwd: host.workspaceCwd, agentPreset: mode } })
        await handle.dispose()
        expect(host.ctx.agents.get(id)).toBeUndefined()
      }
      const route = await rpc.call('/api', 'securityProxy/browserEnvironment', { args: { agentId: securityId } }, AbortSignal.timeout(20000))
      if (!route.ok || typeof route.value !== 'string') throw new Error(`Security proxy route failed: ${JSON.stringify(route)}`)
      const ordinary = await rpc.call('/api', 'securityProxy/browserEnvironment', { args: { agentId: ordinaryId } }, AbortSignal.timeout(20000))
      expect(ordinary).toEqual({ ok: true, value: undefined })
      const secure = `${target.url}?security`
      const normal = `${target.url}?ordinary`
      const input = join(root, 'browser.json')
      await writeFile(input, JSON.stringify({ userData: root, control: control.url, ordinary: normal, secure,
        routing: { sessionId: securityId, server: route.value } }))
      const fixture = fileURLToPath(new URL('../../desktop/tests/fixtures/sidebar-browser-proxy-smoke.mjs', import.meta.url))
      const { stdout } = await promisify(execFile)(electron, [fixture, input], { windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024,
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) })
      expect(stdout).toContain('NATIVE_SIDEBAR_PROXY_PASS')
      expect(upstream.requests.some(row => row.url === normal || row.url === control!.url)).toBe(false)
      const flow = (await host.ctx.securityProxy.list({})).flows.find(row => row.target === secure)
      expect(flow).toMatchObject({ sessionId: securityId, tool: 'sidebar_browser', status: 200 })
      expect((await host.ctx.securityProxy.detail(flow!.id))?.responseBody).toBe('sidebar fixture body')
    } finally {
      try { await scaffold?.close() }
      finally {
        await Promise.all([upstream?.close(), target?.close(), control?.close(), echo?.close()])
        await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
      }
    }
  })
