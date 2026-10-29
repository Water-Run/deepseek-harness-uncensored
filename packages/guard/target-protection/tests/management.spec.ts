/** Real profile writes and dynamic-runner admission across caller identities. @module */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { initProfile, getDshRuntimeVersion, PROFILE_COMPATIBILITY_FILENAME } from '@deepseek-ai/dsh-app-boot'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { PeerId, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import DynamicRunner, { CordisDynamicPluginRunId } from '@deepseek-ai/dsh-cordis-host-runner'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import * as ManagerTools from '@deepseek-ai/dsh-plugin-manager/tools'
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import Protection from '../src/index.ts'
import TargetDynamicCordis from '../src/cordis.ts'
import TargetPluginManager from '../src/plugin-manager.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Delegated identity used to verify protected management ownership. */
    'management-test': { kind: 'management-test' }
  }
}

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-management-')), ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const dir = join(root, 'profile')
  await mkdir(dir)
  initProfile(dir, [])
  const installAnchor = join(root, 'package.json')
  await writeFile(installAnchor, '{"name":"owned-fixture","dependencies":{}}')
  ctx.provide('profileContext', { name: 'fixture', dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor,
    cwd: root, home: root, overlays: [], startedBundles: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Loader)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access' })
  const owner = await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  await ctx.plugin(TargetPluginManager, { pnpmCommand: join(root, 'must-not-execute') })
  const dynamic = await ctx.plugin(TargetDynamicCordis, {})
  const runtime = await mountAgentLoopTestHarness(ctx)
  const agent = await runtime.create(SessionId('management-fixture'))
  const controller = new AbortController(), peer = new AbortController()
  const invocation: RemoteInvocation = {
    request: { namespace: 'pluginManager', method: 'setVersionExemption', args: {} }, service: 'pluginManager',
    peer: { id: 'owned-manager-peer' as PeerId, ctx, principal: { kind: 'owner' }, interactions: 'none',
      signal: peer.signal, dispose: async () => {} },
    signal: controller.signal, uplink: async function *<In>(): AsyncIterable<In> {},
  }
  const ownerCtx = ctx.extend({ invocation })
  const disk = async () => {
    const files = (await readdir(dir)).sort()
    return Promise.all(files.map(async path => [path, await readFile(join(dir, path), 'utf8')]))
  }
  return { root, dir, ctx, ownerCtx, owner, dynamic, runtime, agent, invocation, controller, peer, disk }
}

it('rejects every unowned profile mutation and package process before files or installs change', async () => {
  const h = await harness(), manager = h.ctx.pluginManager, before = await h.disk()
  const visible = await manager.listBundles()
  const operations: Array<() => unknown> = [
    () => manager.setVersionExemption('fixture@1.0.0', getDshRuntimeVersion(), true, true),
    () => manager.setBundleEnabled('fixture', false),
    () => manager.setPluginEnabled('missing' as Parameters<typeof manager.setPluginEnabled>[0], false),
    () => manager.installBundle('https://127.0.0.1/never.tgz'),
    () => manager.removeBundle('fixture'),
    () => manager.registries(),
    () => manager.inspect('fixture'),
  ]
  for (const operation of operations) {
    await expect(Promise.resolve().then(operation)).rejects.toMatchObject({ code: 'TARGET_MANAGEMENT_OWNER_REQUIRED' })
  }
  expect(await manager.waitForInstall('absent' as Parameters<typeof manager.waitForInstall>[0])).toBeNull()
  expect(await h.disk()).toEqual(before)
  expect(manager.listVersionExemptions()).toEqual({ exemptions: {}, warnings: [] })
  expect(await manager.listBundles()).toEqual(visible)
})

it('allows an authenticated owner to persist a version decision through the real manager', async () => {
  const h = await harness(), version = getDshRuntimeVersion()
  const result = await h.ownerCtx.pluginManager.setVersionExemption('fixture@1.0.0', version, true, true)
  expect(result).toMatchObject({ changed: true, application: 'restart-required' })
  expect(await readFile(join(h.dir, PROFILE_COMPATIBILITY_FILENAME), 'utf8')).toContain('fixture@1.0.0')
  expect(h.ctx.pluginManager.listVersionExemptions().exemptions['fixture@1.0.0']).toEqual([version])
})

it('refuses a delegated Remote principal before the real manager writes settings', async () => {
  const h = await harness(), before = await h.disk()
  const invocation: RemoteInvocation = { ...h.invocation, peer: { ...h.invocation.peer, principal: { kind: 'management-test' } } }
  const caller = h.ctx.extend({ invocation })
  expect(() => caller.pluginManager.setBundleEnabled('fixture', false)).toThrow('authenticated application owner')
  expect(await h.disk()).toEqual(before)
})

it.each(['request', 'peer'] as const)('refuses disconnected owner %s before any profile write', async (kind) => {
  const h = await harness(), before = await h.disk()
  const reason = new Error('owned caller disconnected')
  h[kind === 'request' ? 'controller' : 'peer'].abort(reason)
  await expect(Promise.resolve().then(() => h.ownerCtx.pluginManager.setBundleEnabled('fixture', false))).rejects.toBe(reason)
  expect(await h.disk()).toEqual(before)
})

it('rechecks owner cancellation after waiting for the actual profile file lock', async () => {
  const h = await harness(), before = await h.disk()
  const locked: PromiseWithResolvers<void> = Promise.withResolvers()
  const release: PromiseWithResolvers<void> = Promise.withResolvers()
  const holding = withFileLock(join(h.dir, 'package.json'), async () => { locked.resolve(); await release.promise })
  onTestFinished(async () => { release.resolve(); await holding })
  await locked.promise
  const pending = h.ownerCtx.pluginManager.setVersionExemption('fixture@1.0.0', getDshRuntimeVersion(), true, true)
  const outcome = pending.catch((error: unknown) => error)
  const reason = new Error('owner cancelled while profile was locked')
  h.controller.abort(reason)
  release.resolve()
  await holding
  expect(await outcome).toBe(reason)
  expect(await h.disk()).toEqual(before)
})

it('does not let a full-access model tool inherit the owner Remote identity', async () => {
  const h = await harness(), before = await h.disk()
  await h.ownerCtx.plugin(ManagerTools)
  const result = await h.ctx.tools.execute({ agent: h.agent, name: 'plugin_manager',
    arguments: { action: 'set_version_exemption', target: 'fixture@1.0.0', enabled: true, acceptRisk: true,
      runtimeVersion: getDshRuntimeVersion() }, callId: ToolCallId('manager-owner-confusion'), signal: new AbortController().signal })
  expect(result).toMatchObject({ isError: true, error: { info: { code: 'TARGET_MANAGEMENT_OWNER_REQUIRED' } } })
  expect(await h.disk()).toEqual(before)
})

it('refuses Host start, panel start, Client delivery and stale handler invocation before code runs', async () => {
  const h = await harness(), runner = h.ctx.dynamicCordisRunner
  const configuration = vi.spyOn(h.ctx.targetProtection, 'configure')
  onTestFinished(() => { configuration.mockRestore() })
  const receipt = runner.define({ sessionId: h.agent.id, plugin: { kind: 'new', idPrefix: 'gate' }, name: 'guard fixture', purpose: 'owned refusal proof',
    code: { host: 'return { apply(ctx) { ctx.targetProtection.configure({mainlandEnabled:false,rules:[]},0) } }',
      client: "return { apply(ctx) { ctx.provide('mustNotStart', true) } }" } })
  const { pluginId, packageId } = receipt
  const operations: Array<() => unknown> = [
    () => runner.run(h.agent, pluginId, packageId, 'run'),
    () => h.ownerCtx.dynamicCordisRunner.runHostHalf(h.agent, pluginId, packageId, 'run', null, true),
    () => h.ownerCtx.dynamicCordisRunner.getClientCode(h.agent, pluginId, CordisDynamicPluginRunId('stale-run')),
    () => runner.invoke(pluginId, CordisDynamicPluginRunId('stale-run'), 'configure', {}),
  ]
  for (const operation of operations) await expect(Promise.resolve().then(operation)).rejects.toMatchObject({ code: 'TARGET_DYNAMIC_UNCONFINED' })
  expect(configuration).not.toHaveBeenCalled()
  expect(runner.inventory()[0]?.activeRun).toBeUndefined()
  const snapshot = await h.ctx.targetProtection.snapshot()
  configuration.mockRestore()
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, snapshot.revision)
  await expect(runner.run(h.agent, pluginId, packageId, 'run')).rejects.toMatchObject({ code: 'TARGET_DYNAMIC_UNCONFINED' })
})

it('retains the ordinary runner behavior only after an explicit provider replacement', async () => {
  const h = await harness()
  await h.dynamic.dispose()
  await h.ctx.plugin(DynamicRunner, {})
  const runner = h.ctx.dynamicCordisRunner
  const { pluginId, packageId } = runner.define({ sessionId: h.agent.id, plugin: { kind: 'new', idPrefix: 'open' },
    name: 'ordinary fixture', purpose: 'default composition proof', code: { host: "return { apply(ctx) { ctx.provide('ownedManagementProbe', true) } }" } })
  expect(await runner.run(h.agent, pluginId, packageId, 'run')).toMatchObject({ ok: true, status: 'running' })
  expect(h.ctx.get('ownedManagementProbe')).toBe(true)
  await runner.stop(h.agent, pluginId)
  expect(h.ctx.get('ownedManagementProbe')).toBeUndefined()
})

it('withdraws both guarded providers and refuses cached calls after the rule owner unloads', async () => {
  const h = await harness(), manager = h.ownerCtx.pluginManager, runner = h.ctx.dynamicCordisRunner
  await h.owner.dispose()
  expect(h.ctx.get('pluginManager')).toBeUndefined()
  expect(h.ctx.get('dynamicCordisRunner')).toBeUndefined()
  expect(() => manager.setBundleEnabled('fixture', false)).toThrow('closing')
  await expect(runner.invoke('missing' as Parameters<typeof runner.invoke>[0], CordisDynamicPluginRunId('old'), 'go', {})).rejects.toThrow('closing')
})
