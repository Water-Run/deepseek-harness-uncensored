/** Exact Agent SSH ownership through real loopback SSH and CONNECT transports. @module */
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as ProxyHost from '@deepseek-ai/dsh-security-proxy-local'
import TargetProtection from '@deepseek-ai/dsh-target-protection'
import SessionSsh, { type Config as SessionSshConfig } from '@deepseek-ai/dsh-target-protection/ssh-sessions'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { SessionId } from '@deepseek-ai/dsh-session'
import { join } from 'node:path'
import { copyFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { resolveSshExecution } from '../../src/execution.ts'
import { targetSchema } from '../../src/schemas.ts'
import { harness } from './fixture.ts'
import { proxyFixture } from './proxy.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { sshSessionFixture: SessionSshConfig }
}

async function setup({ maxSessions = 4, mountedByAgent = false, connectTimeoutMs = 5000 }: {
  maxSessions?: number
  mountedByAgent?: boolean
  connectTimeoutMs?: number
} = {}) {
  const h = await harness({ handle: async (method, params) => {
    if (method !== 'fs.resolve') throw new Error(`Unsupported fixture operation: ${method}`)
    const { path } = z.object({ path: z.string() }).parse(params)
    return { targetKey: path, displayPath: path }
  } })
  const upstream = await proxyFixture()
  onTestFinished(() => h.close())
  await mountAgentLoopTestDependencies(h.ctx)
  await mountAgentLoopTestHarness(h.ctx)
  await h.ctx.plugin(TargetProtection, { path: ':memory:', hostsFile: '', auditPath: join(h.root, 'audit.sqlite') })
  await h.ctx.plugin(ProxyHost, { path: join(h.root, 'proxy.json'), testHost: '127.0.0.1', testPort: h.config.port, connectTimeoutMs })
  await h.ctx.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: upstream.config.port })
  upstream.requests.splice(0)
  const first = await h.ctx.agents.create({ sessionId: SessionId('ssh-first') })
  const second = await h.ctx.agents.create({ sessionId: SessionId('ssh-second') })
  first.agent.session.append('agent-preset/selected', { agentPreset: 'security' })
  second.agent.session.append('agent-preset/selected', { agentPreset: 'security' })
  h.ctx.provide('sshSessionFixture', { ...h.config, maxSessions })
  h.ctx.baseUrl = pathToFileURL(h.root).href + '/'
  await h.ctx.plugin(Loader)
  Object.assign(h.ctx.loader.builtins, { include: Include, 'session-ssh': SessionSsh })
  const configuration = join(h.root, 'session-ssh.yml')
  await copyFile(fileURLToPath(new URL('./fixtures/sessions.yml', import.meta.url)), configuration)
  const mount = async () => {
    await h.ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configuration).href } })
    await h.ctx.loader.await()
    const entry = [...h.ctx.loader.entries()].find(entry => entry.options.id === 'session-ssh')
    if (entry?.fiber === undefined) throw new Error('Fixture SSH entry was not loaded')
    await entry.fiber.await()
    return entry.fiber
  }
  const provider = await (mountedByAgent ? h.ctx.agents.withInitiator(first.agent, mount) : mount())
  const capture = (agent: typeof first.agent) => h.ctx.agents.withInitiator(agent, () => {
    const source = agent.ctx.get('ssh')
    if (source === undefined) throw new Error('Fixture SSH provider was not published')
    return resolveSshExecution(source)
  })
  const read = (connection: ReturnType<typeof capture>) => connection.request('fs.resolve', { path: '/fixture/workspace/data' }, targetSchema)
  return { ...h, upstream, provider, first, second, capture, read }
}

it('keeps concurrent Security sessions separate and preserves the captured owner in another caller scope', async () => {
  const h = await setup()
  expect(h.upstream.requests).toEqual([])
  const first = h.capture(h.first.agent), second = h.capture(h.second.agent)
  expect(first === second).toBe(false)
  await Promise.all([h.read(first), h.read(second)])
  expect(h.upstream.requests).toHaveLength(2)
  expect(h.upstream.requests.every(request => request.authority === `127.0.0.1:${h.config.port}`)).toBe(true)
  await h.read(h.capture(h.first.agent))
  await h.read(resolveSshExecution(h.ctx.ssh))
  expect(h.upstream.requests).toHaveLength(2)
  await h.ctx.agents.withInitiator(h.second.agent, () => h.read(first))
  const history = h.ctx.targetProtection.auditHistory().entries
  expect(history[0]?.source?.sessionId).toBe(h.first.agent.id)
  expect(history[0]).toMatchObject({ operation: 'file', effect: 'observe', decision: 'allow' })
  expect(h.first.agent.session.snapshotEvents().filter(event => event.type === 'target/admission'
    && event.data.operation === 'file').length).toBeGreaterThan(0)
  const flows = await h.ctx.securityProxy.list({ text: 'ssh' })
  expect(flows.flows.map(flow => flow.sessionId).sort()).toEqual(['ssh-first', 'ssh-second'])
  expect(flows.flows.every(flow => flow.kind === 'tunnel' && flow.note === 'tunnel-metadata-only')).toBe(true)
  expect(flows.flows.map(({ sessionId, kind, tool, note, outcome }) => ({ sessionId, kind, tool, note, outcome }))
    .sort((left, right) => String(left.sessionId).localeCompare(String(right.sessionId)))).toMatchInlineSnapshot(`
    [
      {
        "kind": "tunnel",
        "note": "tunnel-metadata-only",
        "outcome": "complete",
        "sessionId": "ssh-first",
        "tool": "ssh",
      },
      {
        "kind": "tunnel",
        "note": "tunnel-metadata-only",
        "outcome": "complete",
        "sessionId": "ssh-second",
        "tool": "ssh",
      },
    ]
  `)
})

it('closes only the disposed Agent connection and refuses its captured service', async () => {
  const h = await setup()
  const first = h.capture(h.first.agent), second = h.capture(h.second.agent)
  await Promise.all([h.read(first), h.read(second)])
  await h.first.dispose()
  await expect.poll(() => h.ctx.targetProtection.sshCoverage().connections).toBe(2)
  await expect(h.read(first)).rejects.toMatchObject({ code: 'SSH_UNAVAILABLE' })
  await expect(h.read(second)).resolves.toMatchObject({ targetKey: '/fixture/workspace/data' })
  expect(() => h.capture(h.first.agent)).toThrow()
})

it('bounds active Agent connections without replacing an existing owner', async () => {
  const h = await setup({ maxSessions: 1 })
  const first = h.capture(h.first.agent)
  await h.read(first)
  expect(() => h.capture(h.second.agent)).toThrow(expect.objectContaining({ code: 'SSH_SESSION_CAPACITY' }))
  await h.read(h.capture(h.first.agent))
  expect(h.upstream.requests).toHaveLength(1)
  await h.first.dispose()
  await first.dispose()
  await expect.poll(() => h.ctx.targetProtection.sshCoverage().connections).toBe(1)
  await expect(h.read(h.capture(h.second.agent))).resolves.toMatchObject({ targetKey: '/fixture/workspace/data' })
})

it('retires captured connections on proxy changes and selects the new route only for new operations', async () => {
  const h = await setup()
  const replacement = await proxyFixture()
  onTestFinished(() => h.close())
  const first = h.capture(h.first.agent), second = h.capture(h.second.agent)
  await Promise.all([h.read(first), h.read(second)])
  await h.ctx.securityProxy.configure({ port: replacement.config.port })
  await expect(h.read(first)).rejects.toMatchObject({ code: 'SSH_UNAVAILABLE' })
  await expect(h.read(second)).rejects.toMatchObject({ code: 'SSH_UNAVAILABLE' })
  const checks = replacement.requests.length
  await h.read(h.capture(h.first.agent))
  expect(replacement.requests).toHaveLength(checks + 1)
  expect(h.upstream.requests).toHaveLength(2)
  expect(h.ctx.targetProtection.sshCoverage().connections).toBe(2)
})

it('keeps uncovered modes direct while a Security session uses its configured proxy', async () => {
  const h = await setup()
  h.first.agent.session.append('agent-preset/selected', { agentPreset: 'standard' })
  await Promise.all([h.read(h.capture(h.first.agent)), h.read(h.capture(h.second.agent))])
  expect(h.upstream.requests).toHaveLength(1)
  const flows = await h.ctx.securityProxy.list({ text: 'ssh' })
  expect(flows.flows.map(flow => flow.sessionId)).toEqual(['ssh-second'])
  expect(h.ctx.targetProtection.sshCoverage().connections).toBe(3)
})

it('never falls back to deployment direct TCP after the selected session proxy refuses CONNECT', async () => {
  const h = await setup()
  const refusal = await proxyFixture({ status: 403 })
  onTestFinished(() => h.close())
  await h.ctx.securityProxy.configure({ port: refusal.config.port })
  const before = h.connected(), checks = refusal.requests.length
  await expect(h.read(h.capture(h.first.agent))).rejects.toMatchObject({ code: 'SSH_CONNECTION_FAILED' })
  expect(h.connected()).toBe(before)
  expect(refusal.requests).toHaveLength(checks + 1)
  const flows = await h.ctx.securityProxy.list({ text: 'ssh' })
  expect(flows.flows).toMatchObject([{ sessionId: 'ssh-first', outcome: 'error', kind: 'tunnel' }])
})

it('retires a direct Security connection when the independent proxy is enabled', async () => {
  const h = await setup()
  await h.ctx.securityProxy.configure({ enabled: false })
  const direct = h.capture(h.first.agent)
  await h.read(direct)
  expect(h.upstream.requests).toHaveLength(0)
  await h.ctx.securityProxy.configure({ enabled: true })
  await direct.dispose()
  await expect(h.read(direct)).rejects.toMatchObject({ code: 'SSH_UNAVAILABLE' })
  const checks = h.upstream.requests.length
  await h.read(h.capture(h.first.agent))
  expect(h.upstream.requests).toHaveLength(checks + 1)
})

it('retires an uncovered connection before the same Agent starts Security-mode work', async () => {
  const h = await setup()
  h.first.agent.session.append('agent-preset/selected', { agentPreset: 'standard' })
  const direct = h.capture(h.first.agent)
  await h.read(direct)
  expect(h.upstream.requests).toHaveLength(0)
  h.first.agent.session.append('agent-preset/selected', { agentPreset: 'security' })
  await direct.dispose()
  await expect(h.read(direct)).rejects.toMatchObject({ code: 'SSH_UNAVAILABLE' })
  await h.read(h.capture(h.first.agent))
  expect(h.upstream.requests).toHaveLength(1)
})

it('does not attribute deployment initialization to the Agent that mounts the provider', async () => {
  const h = await setup({ mountedByAgent: true })
  expect(h.upstream.requests).toHaveLength(0)
  expect(h.ctx.targetProtection.auditHistory().entries.every(entry => entry.source === undefined)).toBe(true)
  await h.read(h.capture(h.first.agent))
  const flows = await h.ctx.securityProxy.list({ text: 'ssh' })
  expect(flows.flows.map(flow => flow.sessionId)).toEqual(['ssh-first'])
})

it('joins a connection withdrawn while its CONNECT acknowledgement is pending', async () => {
  const h = await setup({ connectTimeoutMs: 100 })
  const held = await proxyFixture({ hold: true })
  onTestFinished(() => h.close())
  await h.ctx.securityProxy.configure({ port: held.config.port })
  const before = h.connected(), checks = held.requests.length
  const connection = h.capture(h.first.agent)
  const reading = h.read(connection)
  const rejected = expect(reading).rejects.toBeDefined()
  await expect.poll(() => held.requests.length).toBe(checks + 1)
  await h.first.dispose()
  await connection.dispose()
  await rejected
  await expect.poll(() => held.open()).toBe(0)
  expect(h.connected()).toBe(before)
  expect(h.ctx.targetProtection.sshCoverage().connections).toBe(1)
})

it('releases a session withdrawn before its execution lease arrives without opening TCP', async () => {
  const h = await setup({ maxSessions: 1 })
  const entered = Promise.withResolvers<undefined>(), released = Promise.withResolvers<undefined>()
  const original = h.ctx.targetProtection.snapshot.bind(h.ctx.targetProtection)
  const snapshot = vi.spyOn(h.ctx.targetProtection, 'snapshot').mockImplementationOnce(async () => {
    entered.resolve(undefined)
    await released.promise
    return original()
  })
  const before = h.connected()
  const connection = h.capture(h.first.agent)
  const rejected = expect(connection.ready).rejects.toBeDefined()
  try {
    await entered.promise
    await h.first.dispose()
    const closing = connection.dispose()
    released.resolve(undefined)
    await closing
    await rejected
    expect(h.connected()).toBe(before)
  } finally {
    released.resolve(undefined)
    snapshot.mockRestore()
    await connection.dispose()
  }
  await h.read(h.capture(h.second.agent))
})

it('does not retain an unowned audit wait when route selection throws', async () => {
  const h = await setup({ maxSessions: 1 })
  const listeners = () => [...h.ctx.events.dispatch('emit', [h.ctx, 'session/disposed', h.first.agent.session])].length
  const before = listeners(), connected = h.connected()
  const route = vi.spyOn(h.ctx.securityProxy, 'route').mockImplementationOnce(() => { throw new Error('route unavailable') })
  try {
    expect(() => h.capture(h.first.agent)).toThrow('route unavailable')
    expect(listeners()).toBe(before)
    expect(h.connected()).toBe(connected)
  } finally { route.mockRestore() }
  await h.read(h.capture(h.first.agent))
})
