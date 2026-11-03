/** Real private-target proxy traffic and subsequent production refusal in a recorded Session. @module */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createServer, type Server } from 'node:http'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import Protection from '../src/index.ts'
import * as ProtectedProxy from '../src/security-proxy.ts'
import type { TargetRule, TargetRuleId } from '../src/types.ts'

/** Cordis fixture name. */
export const name = 'private-proxy-snapshot'
/** The profile owns tool execution; this fixture mounts private credentials. */
export const inject = ['tools']

/** @param ctx - Dedicated snapshot owner with no user targets. */
export async function apply(ctx: Context): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-private-proxy-snapshot-'))
  const sockets = new Set<Duplex>(), servers: Server[] = []
  let stopProviders = async (): Promise<void> => {}
  ctx.effect(() => async () => {
    try { await stopProviders() } finally {
      for (const socket of sockets) socket.destroy()
      try {
        await Promise.all(servers.filter(server => server.listening).map(server => new Promise<void>((resolve, reject) => {
          server.closeAllConnections()
          server.close((error) => { if (error) reject(error); else resolve() })
        })))
      } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
    }
  }, 'private-proxy-snapshot.resources')
  await ctx.plugin(Credentials, { path: join(root, 'credentials.yaml'), dshHome: root, watch: false })
  const own = (socket: Duplex): void => {
    sockets.add(socket); socket.once('close', () => { sockets.delete(socket) })
    socket.on('error', () => { socket.destroy() })
  }
  const listen = async (server: Server): Promise<number> => {
    servers.push(server); server.on('connection', own)
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address(); assert.ok(address !== null && typeof address !== 'string'); return address.port
  }
  let requests = 0, upstreamConnections = 0
  const target = createServer((_request, response) => {
    requests++; response.writeHead(200, { 'content-type': 'text/plain' }); response.end('private target reached')
  })
  const port = await listen(target)
  const upstream = createServer((_request, response) => { response.writeHead(405); response.end() })
  upstream.on('connect', (request, client, head) => {
    upstreamConnections++
    if (request.url !== `127.0.0.1:${port}`) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
    const peer = connect(port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.byteLength > 0) peer.write(head)
      client.pipe(peer); peer.pipe(client)
    })
    own(peer); client.once('close', () => { peer.destroy() }); peer.once('close', () => { client.destroy() })
  })
  const proxyPort = await listen(upstream)
  const protection = await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  stopProviders = () => protection.dispose()
  const rule: TargetRule = { id: brandString<TargetRuleId>('60444444-4444-4444-8444-444444444444'), name: 'snapshot private server',
    enabled: true, kind: 'server', environment: 'test', protection: 'full', match: 'host', address: '127.0.0.1', port }
  await ctx.inject(['targetProtection'], async (policy) => {
    const configure = async (environment: 'test' | 'production'): Promise<void> => {
      const before = await policy.targetProtection.snapshot()
      await policy.targetProtection.configure({ mainlandEnabled: true, rules: [{ ...rule, environment }] }, before.revision)
    }
    await configure('test')
    const proxy = await ctx.plugin(ProtectedProxy, { path: join(root, 'proxy.json'), testHost: '127.0.0.1', testPort: port })
    stopProviders = async () => { await proxy.dispose(); await protection.dispose() }
    await policy.inject(['securityProxy'], async (active) => {
      assert.equal((await active.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: proxyPort })).status, 'ready')
      const initialConnections = upstreamConnections
      active.effect(() => active.tools.register(defineTool({
        name: 'verify_private_proxy', description: 'Fetch the owned private test target through the guarded proxy and verify traffic capture.', parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        async execute(_args, exec) {
          assert.ok(exec.agent)
          exec.agent.session.append('agent-preset/selected', { agentPreset: 'security' })
          const result = await active.securityProxy.fetchTarget(exec.agent, `http://127.0.0.1:${port}/`, exec.signal)
          assert.equal(result.body.content, 'private target reached'); assert.equal(requests, 1)
          assert.equal(upstreamConnections, initialConnections + 1)
          const flow = (await active.securityProxy.list({})).flows.find(row => row.origin === 'client')
          assert.ok(flow)
          assert.equal((await active.securityProxy.detail(flow.id))?.responseBody, 'private target reached')
          return 'Private test target reached through the proxy; its response was captured.'
        },
      })))
      active.effect(() => active.tools.register(defineTool({
        name: 'verify_production_proxy', description: 'Protect the same owned endpoint and verify that the next request creates no connection.', parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        async execute(_args, exec) {
          const before = upstreamConnections
          await configure('production')
          await assert.rejects(active.securityProxy.fetchTarget(exec.agent, `http://127.0.0.1:${port}/`, exec.signal), { code: 'TARGET_FULLY_PROTECTED' })
          assert.equal(requests, 1); assert.equal(upstreamConnections, before)
          return 'Production protection refused the request before any new upstream or target connection.'
        },
      })))
    })
  })
}
