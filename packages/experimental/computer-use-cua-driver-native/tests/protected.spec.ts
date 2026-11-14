/** Target rules reach the native SDK dispatch without accessing the host desktop. */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import ComputerUseRegistry from '@deepseek-ai/dsh-computer-use'
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import TargetProtection from '@deepseek-ai/dsh-target-protection'
import type { TargetPreferences, TargetRuleId } from '@deepseek-ai/dsh-target-protection/types'
import * as Protected from '../src/protected.ts'
import { mountNativeComputerUse } from '../src/native.ts'
import { catalog, fixture, resetFixture } from './fixtures/cua-driver.ts'

vi.mock('@trycua/cua-driver', async () => import('./fixtures/cua-driver.ts'))

async function harness(persistent = false, audit = false) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-cua-policy-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.plugin(ComputerUseRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  await ctx.plugin(NativeExecutor)
  const config = { path: persistent ? join(root, 'rules.sqlite') : ':memory:', hostsFile: '', auditPath: audit ? join(root, 'audit.sqlite') : '' }
  const owner = await ctx.plugin(TargetProtection, config)
  const configure = async (preferences: TargetPreferences) => {
    const previous = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure(preferences, previous.revision)
  }
  const input = { name: 'cua_driver_native__click', callId: ToolCallId('guarded-native'), arguments: { pid: 9, window_id: 7 }, signal: new AbortController().signal }
  return { ctx, owner, config, configure, input, execute: () => executeToolFixture(ctx, input) }
}

const production: TargetPreferences = { mainlandEnabled: false, rules: [{
  id: '00000000-0000-4000-8000-000000000001' as TargetRuleId, name: 'Production', enabled: true, kind: 'server', environment: 'production',
  protection: 'full', match: 'host', address: 'production.example',
}] }

it.each([
  { mainlandEnabled: true, rules: [] }, production,
  { ...production, rules: production.rules.map(rule => ({ ...rule, protection: 'audit' as const })) },
])('rejects native initialization under protected targets: %j', async (preferences) => {
  resetFixture()
  const h = await harness()
  await h.configure(preferences)
  await expect(h.ctx.plugin(Protected)).rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(fixture.creates).toBe(0)
  expect(fixture.calls).toEqual([])
  expect(h.ctx.tools.schemas()).toEqual([])
  expect(h.ctx.computerUse.providerName).toBeUndefined()
})

it('protects durable owner files even with no production or mainland rules', async () => {
  resetFixture()
  const h = await harness(true)
  await expect(h.ctx.plugin(Protected)).rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(fixture.creates).toBe(0)
})

it('runs in an explicitly unprotected in-memory composition and closes before releasing its slot', async () => {
  resetFixture()
  const h = await harness()
  const provider = await h.ctx.plugin(Protected)
  expect((await h.execute()).isError).toBe(false)
  expect(fixture.clicked).toBe(true)
  await provider.dispose()
  expect(fixture.shutdowns).toBe(1)
  expect(fixture.destroys).toBe(1)
  expect(h.ctx.computerUse.providerName).toBeUndefined()
  await h.owner.dispose()
})

it('rejects held definitions and waits for native completion and shutdown after a policy change', async () => {
  resetFixture()
  const h = await harness()
  await h.ctx.plugin(Protected)
  const held = h.ctx.tools.get(h.input.name)!
  const pipeline = new ToolExecutionPipeline(h.ctx)
  const prepared = await pipeline.prepare(h.input)
  if (prepared.kind !== 'dispatch') throw new Error('Fixture requires an admitted tool')
  const called = Promise.withResolvers<undefined>(), finished = Promise.withResolvers<unknown>()
  const shuttingDown = Promise.withResolvers<undefined>(), closed = Promise.withResolvers<undefined>()
  fixture.call = () => { called.resolve(undefined); return finished.promise }
  fixture.shutdown = async () => { shuttingDown.resolve(undefined); await closed.promise }
  const operation = h.execute()
  await called.promise
  await h.configure(production)
  let ownerClosed = false
  const disposal = h.owner.dispose().then(() => { ownerClosed = true })
  try {
    expect(fixture.calls[0]?.signal?.aborted).toBe(true)
    await expect(held.execute(h.input.arguments, { ...prepared.exec, deferContext() {}, concludeTurn() {} })).rejects.toBeDefined()
    expect(fixture.calls).toHaveLength(1)
    expect(h.ctx.computerUse.providerName).toBe('cua-driver-native')
    finished.resolve({ content: [] })
    await shuttingDown.promise
    expect(ownerClosed).toBe(false)
    expect(fixture.destroys).toBe(0)
  } finally {
    finished.resolve({ content: [] }); closed.resolve(undefined)
    await disposal
    await operation
  }
  expect((await operation).isError).toBe(true)
  expect(ownerClosed).toBe(true)
  expect(fixture.destroys).toBe(1)
})

it('waits for native calls through held tool definitions before shutting down', async () => {
  resetFixture()
  const h = await harness()
  const provider = await h.ctx.plugin(Protected)
  const held = h.ctx.tools.get(h.input.name)!
  const prepared = await new ToolExecutionPipeline(h.ctx).prepare(h.input)
  if (prepared.kind !== 'dispatch') throw new Error('Fixture requires an admitted tool')
  const called = Promise.withResolvers<undefined>(), finished = Promise.withResolvers<unknown>()
  fixture.call = () => { called.resolve(undefined); return finished.promise }
  const operation = Promise.resolve(held.execute(h.input.arguments, { ...prepared.exec, deferContext() {}, concludeTurn() {} }))
  const settled = Promise.allSettled([operation])
  await called.promise
  const disposal = provider.dispose()
  try {
    await vi.waitFor(() => { expect(fixture.calls[0]?.signal?.aborted).toBe(true) })
    expect(fixture.shutdowns).toBe(0)
    expect(h.ctx.computerUse.providerName).toBe('cua-driver-native')
  } finally {
    finished.resolve({ content: [] })
    await disposal
    await settled
  }
  expect(fixture.shutdowns).toBe(1)
  expect(fixture.destroys).toBe(1)
})

it('closes discovery that settles after revocation without publishing tools', async () => {
  resetFixture()
  const h = await harness()
  const started = Promise.withResolvers<undefined>(), discovery = Promise.withResolvers<string>()
  fixture.list = () => { started.resolve(undefined); return discovery.promise }
  const loading = Promise.resolve(h.ctx.plugin(Protected))
  const result = Promise.allSettled([loading])
  await started.promise
  try { await h.configure(production) }
  finally { discovery.resolve(JSON.stringify(catalog)) }
  expect((await result)[0]?.status).toBe('rejected')
  await vi.waitFor(() => { expect(fixture.destroys).toBe(1) })
  expect(h.ctx.tools.schemas()).toEqual([])
  expect(h.ctx.computerUse.providerName).toBeUndefined()
})

it('releases admission after a registration collision so the target owner can close', async () => {
  resetFixture()
  const h = await harness()
  const release = h.ctx.computerUse.register(ComputerUseProviderName('other'))
  await expect(h.ctx.plugin(Protected)).rejects.toThrow('already registered')
  expect(fixture.creates).toBe(0)
  await release()
  await h.owner.dispose()
})

it('revokes only the native runtime belonging to the changed target owner', async () => {
  resetFixture()
  const first = await harness(), second = await harness()
  await first.ctx.plugin(Protected)
  await second.ctx.plugin(Protected)
  await first.configure(production)
  await vi.waitFor(() => { expect(fixture.shutdowns).toBe(1) })
  expect((await second.execute()).isError).toBe(false)
  expect(second.ctx.computerUse.providerName).toBe('cua-driver-native')
  expect(first.ctx.tools.schemas()).toEqual([])
})

it('records the rejected execution before SDK initialization and retains it after reopening the audit', async () => {
  resetFixture()
  const h = await harness(false, true)
  await h.configure(production)
  await expect(h.ctx.plugin(Protected)).rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  const history = h.ctx.targetProtection.auditHistory()
  expect(history.entries[0]).toMatchObject({ revision: 2, phase: 'execution', operation: 'unconfined',
    decision: 'deny', code: 'TARGET_EXECUTION_UNCONFINED', ruleIds: [production.rules[0]!.id] })
  expect(fixture.creates).toBe(0)
  await h.owner.dispose()
  await h.ctx.plugin(TargetProtection, h.config)
  expect(h.ctx.targetProtection.auditHistory()).toEqual(history)
})

it('withdraws its tools when the mandatory target owner disappears and reloads only with a new owner', async () => {
  resetFixture()
  const h = await harness()
  await h.ctx.plugin(Protected)
  await h.owner.dispose()
  expect(fixture.shutdowns).toBe(1)
  expect(h.ctx.tools.schemas()).toEqual([])
  expect((await h.execute()).isError).toBe(true)
  expect(fixture.calls).toEqual([])
  await h.ctx.plugin(TargetProtection, h.config)
  await vi.waitFor(() => { expect(fixture.creates).toBe(2) })
  expect((await h.execute()).isError).toBe(false)
})

it('retains the execution lease and provider reservation when SDK shutdown fails', async () => {
  resetFixture()
  const h = await harness()
  const revoked = new AbortController(), release = vi.fn()
  fixture.shutdown = async () => { throw new Error('Native shutdown unconfirmed') }
  await h.ctx.plugin({ inject: ['computerUse', 'tools', 'systemPrompt'], apply: ctx => mountNativeComputerUse(ctx, {
    signal: revoked.signal, check: () => { revoked.signal.throwIfAborted() }, release,
  }) })
  revoked.abort()
  await vi.waitFor(() => { expect(fixture.shutdowns).toBe(1) })
  expect(h.ctx.tools.schemas()).toEqual([])
  expect(h.ctx.computerUse.providerName).toBe('cua-driver-native')
  expect(fixture.destroys).toBe(0)
  expect(release).not.toHaveBeenCalled()
})
