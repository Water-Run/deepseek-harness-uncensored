import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { request } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as credentials from '@deepseek-ai/dsh-credentials-local'
import { Session, SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PeerId, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-security-proxy'
import * as securityProxy from '../src/index.ts'
import { startLocalProxy, startLocalTarget, startTcpEcho, type LocalProxy, type LocalTarget, type LocalTcpTarget } from './support/local-proxy.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { 'security-proxy-viewer-test': { kind: 'security-proxy-viewer-test' } }
}

/** A real Session carrying the recorded preset, wrapped as the Agent a tool execution passes. */
function subject(id: string, preset = 'security'): Agent {
  const sessionId = SessionId(id)
  const session = Session.create(sessionId, [], {
    version: SESSION_FORMAT_VERSION,
    id: sessionId,
    createdAt: 1,
    isSeeded: false,
    agentPreset: preset,
  })
  return { id: sessionId, session } as Agent
}

let root: string | undefined
let ctx: Context | undefined
let upstream: LocalProxy | undefined
let target: LocalTarget | undefined
let echo: LocalTcpTarget | undefined

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dshu-security-composition-'))
  upstream = await startLocalProxy()
  target = await startLocalTarget()
  echo = await startTcpEcho()
})

afterEach(async () => {
  if (ctx !== undefined) await ctx.fiber.dispose()
  ctx = undefined
  if (upstream !== undefined) await upstream.close()
  if (target !== undefined) await target.close()
  if (echo !== undefined) await echo.close()
  upstream = undefined
  target = undefined
  echo = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the composition through the real Loader with literal temp paths. */
async function boot(): Promise<Context> {
  const configPath = join(root ?? tmpdir(), 'cordis.yml')
  const settings = join(root ?? tmpdir(), 'security-proxy.json')
  const credentialsPath = join(root ?? tmpdir(), 'credentials.yaml')
  await writeFile(configPath, [
    '- id: credentials',
    '  name: cordis:credentials-local',
    '  config:',
    `    path: ${JSON.stringify(credentialsPath)}`,
    '    watch: false',
    '- id: security-proxy',
    '  name: cordis:security-proxy-local',
    '  config:',
    `    path: ${JSON.stringify(settings)}`,
    "    testHost: '127.0.0.1'",
    `    testPort: ${String(echo?.port ?? 9)}`,
    '    connectTimeoutMs: 2000',
    '    requestTimeoutMs: 5000',
    '',
  ].join('\n'), 'utf8')
  const instance = new Context()
  await instance.plugin(Loader)
  instance.loader.builtins.include = Include
  instance.loader.builtins['credentials-local'] = credentials
  instance.loader.builtins['security-proxy-local'] = securityProxy
  await instance.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await instance.loader.await()
  ctx = instance
  return instance
}

describe('security proxy composition', () => {
  it('boots through the Loader with the credential provider and defaults off', async () => {
    const instance = await boot()
    const state = await instance.securityProxy.get()
    expect(state.settings.enabled).toBe(false)
    expect(state.settings.warnWhenDisabled).toBe(false)
    expect(state.status).toBe('off')
    expect(state.settings.hasPassword).toBe(false)
  })

  it('routes a real security-session request through the configured upstream', async () => {
    const instance = await boot()
    if (upstream === undefined || target === undefined || echo === undefined) throw new Error('fixtures missing')
    const configured = await instance.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })
    expect(configured.status).toBe('ready')
    const url = `${target.url}?api%5Fkey=first&keep=a%20b&api_key=second`
    const result = await instance.securityProxy.fetchTarget(subject('sess-a'), url, new AbortController().signal)
    expect(result.body).toEqual({ kind: 'text', content: 'target body' })
    expect(upstream.requests.map(entry => entry.url)).toEqual([url])
    const flows = await instance.securityProxy.list({})
    expect(flows.flows[0]).toMatchObject({ sessionId: 'sess-a', tool: 'web_fetch', status: 200,
      target: `${target.url}?api%5Fkey=%5Bredacted%5D&keep=a%20b&api_key=%5Bredacted%5D` })
    expect((await instance.securityProxy.list({ text: 'first' })).flows).toEqual([])
  })

  it('allows delegated status reads while protecting capture and configuration', async () => {
    const instance = await boot()
    if (upstream === undefined || target === undefined) throw new Error('fixtures missing')
    await instance.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })
    await instance.securityProxy.fetchTarget(subject('owner-capture'), target.url, new AbortController().signal)
    const flow = (await instance.securityProxy.list({})).flows[0]
    if (flow === undefined) throw new Error('expected a captured exchange')
    expect(await instance.securityProxy.detail(flow.id)).toMatchObject({ responseBody: 'target body' })
    const invocation: RemoteInvocation = {
      request: { namespace: 'securityProxy', method: 'configure', args: {} },
      service: 'securityProxy',
      peer: {
        id: 'security-viewer' as PeerId,
        ctx: instance,
        principal: { kind: 'security-proxy-viewer-test' },
        interactions: 'answer',
        signal: new AbortController().signal,
        dispose: async () => {},
      },
      signal: new AbortController().signal,
      uplink: <In>(): AsyncIterable<In> => ({
        [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
      }),
    }
    const viewer = instance.extend({ invocation }).securityProxy
    expect((await viewer.get()).status).toBe('ready')
    await expect(viewer.configure({ enabled: false })).rejects.toMatchObject({ code: 'security-proxy/owner-required' })
    await expect(viewer.setPassword('x')).rejects.toMatchObject({ code: 'security-proxy/owner-required' })
    await expect(viewer.clear()).rejects.toMatchObject({ code: 'security-proxy/owner-required' })
    await expect(viewer.browserEnvironment(subject('viewer-browser'))).rejects.toMatchObject({ code: 'security-proxy/owner-required' })
    await expect(viewer.list({ sessionId: 'owner-capture' })).rejects.toMatchObject({ code: 'security-proxy/owner-required' })
    await expect(viewer.detail(flow.id)).rejects.toMatchObject({ code: 'security-proxy/owner-required' })
    expect((await instance.securityProxy.get()).settings.enabled).toBe(true)
  })

  it('routes sidebar HTTP through the owning Security conversation without covering other modes', async () => {
    const instance = await boot()
    if (upstream === undefined || target === undefined) throw new Error('fixtures missing')
    expect(await instance.securityProxy.browserEnvironment(subject('off'))).toBeUndefined()
    await instance.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })
    expect(await instance.securityProxy.browserEnvironment(subject('ordinary', 'standard'))).toBeUndefined()
    const endpoint = await instance.securityProxy.browserEnvironment(subject('sidebar-security'))
    expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u)
    const address = new URL(endpoint!)
    const url = target.url
    const body = await new Promise<string>((resolve, reject) => {
      const outgoing = request({ host: address.hostname, port: address.port, path: url, agent: false, timeout: 5000 }, (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (part: string) => { text += part })
        response.once('end', () => { resolve(text) })
      })
      outgoing.once('error', reject)
      outgoing.once('timeout', () => { outgoing.destroy(new Error('Sidebar proxy fixture timed out')) })
      outgoing.end()
    })
    expect(body).toBe('target body')
    const flow = (await instance.securityProxy.list({})).flows.find(row => row.target === url)
    expect(flow).toMatchObject({ sessionId: 'sidebar-security', tool: 'sidebar_browser', status: 200 })
    expect((await instance.securityProxy.detail(flow!.id))?.responseBody).toBe('target body')
  })

  it('announces committed transport changes without reconnecting for capture preferences', async () => {
    const instance = await boot()
    if (upstream === undefined) throw new Error('fixtures missing')
    let changes = 0
    instance.on('security-proxy/transport-changed', () => { changes++ })
    await instance.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.port })
    expect(changes).toBe(1)
    await instance.securityProxy.configure({ enabled: true, port: upstream.port, capturePaused: true })
    await instance.securityProxy.pause(false)
    expect(changes).toBe(1)
    await instance.securityProxy.setPassword('private-fixture')
    expect(changes).toBe(2)
    await instance.securityProxy.configure({ enabled: false })
    expect(changes).toBe(3)
  })

  it('emits the proxy-off reminder once per conversation', async () => {
    const instance = await boot()
    const seen: string[] = []
    instance.on('security-proxy/warning', (sessionId) => { seen.push(sessionId) })
    await instance.securityProxy.configure({ enabled: false, warnWhenDisabled: true })
    expect(instance.securityProxy.route(subject('sess-a'), 'bash')).toBeUndefined()
    expect(instance.securityProxy.route(subject('sess-a'), 'bash')).toBeUndefined()
    expect(seen).toEqual(['sess-a'])
  })

  it('keeps the proxy password in the credential store only', async () => {
    const instance = await boot()
    await instance.securityProxy.configure({ authEnabled: true, username: 'ops' })
    await instance.securityProxy.setPassword('top-secret')
    expect((await instance.securityProxy.get()).settings.hasPassword).toBe(true)
    const settingsText = await readFile(join(root ?? tmpdir(), 'security-proxy.json'), 'utf8')
    expect(settingsText).not.toContain('top-secret')
    const credentialsText = await readFile(join(root ?? tmpdir(), 'credentials.yaml'), 'utf8')
    expect(credentialsText).toContain('DSH_SECURITY_PROXY_PASSWORD')
    expect(credentialsText).toContain('top-secret')
    await instance.securityProxy.setPassword(null)
    expect((await instance.securityProxy.get()).settings.hasPassword).toBe(false)
  })

  it('keeps a configured address across a restart and never reports ready after a failed check', async () => {
    const instance = await boot()
    if (upstream === undefined) throw new Error('fixtures missing')
    await instance.securityProxy.configure({ enabled: true, protocol: 'http', host: '127.0.0.1', port: upstream.port })
    expect((await instance.securityProxy.get()).status).toBe('ready')
    await instance.fiber.dispose()
    ctx = undefined
    const restarted = await boot()
    const state = await restarted.securityProxy.get()
    expect(state.settings).toMatchObject({ enabled: true, host: '127.0.0.1', port: upstream.port })
    await upstream.close()
    const failed = await restarted.securityProxy.test()
    expect(failed.ok).toBe(false)
    expect((await restarted.securityProxy.get()).status).toBe('failed')
  })
})
