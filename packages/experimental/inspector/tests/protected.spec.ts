/** Protected debugger admission never opens a Worker, including when target rules are disabled. */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import TargetProtection from '@deepseek-ai/dsh-target-protection'
import type { TargetPreferences, TargetRuleId } from '@deepseek-ai/dsh-target-protection/types'
import * as Protected from '../src/protected.ts'
import { startInspector } from '../src/host/bridge/controller.ts'

vi.mock('../src/host/bridge/controller.ts', async (original) => {
  const module = await original<typeof import('../src/host/bridge/controller.ts')>()
  return { ...module, startInspector: vi.fn(module.startInspector) }
})

async function harness(persistentAudit = false) {
  const ctx = new Context()
  let directory: string | undefined
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
    vi.clearAllMocks()
  })
  if (persistentAudit) directory = await mkdtemp(join(tmpdir(), 'dshu-inspector-audit-'))
  await ctx.plugin(TargetProtection, {
    path: ':memory:', hostsFile: '', auditPath: directory === undefined ? '' : join(directory, 'audit.sqlite'),
  })
  const configure = async (preferences: TargetPreferences): Promise<void> => {
    const previous = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure(preferences, previous.revision)
  }
  return { ctx, configure }
}

const production: TargetPreferences = { mainlandEnabled: false, rules: [{
  id: '00000000-0000-4000-8000-000000000001' as TargetRuleId,
  name: 'Production', enabled: true, kind: 'server', environment: 'production',
  protection: 'full', match: 'host', address: 'production.example',
}] }

it.each([
  { mainlandEnabled: true, rules: [] }, production,
  { ...production, rules: production.rules.map(rule => ({ ...rule, protection: 'audit' as const })) },
])('rejects debugger startup while target effects must be constrained: %j', async (preferences) => {
  const h = await harness()
  await h.configure(preferences)
  await expect(h.ctx.plugin(Protected, { port: 0, captureFetch: false }).await().then(() => undefined))
    .rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(startInspector).not.toHaveBeenCalled()
})

it('keeps raw Host debugging unavailable even when every target rule is disabled', async () => {
  const h = await harness()
  const activation = h.ctx.plugin(Protected, { port: 0, captureFetch: false }).await().then(() => undefined)
  await expect(activation).rejects.toMatchObject({ code: 'INSPECTOR_PROTECTED_EXECUTION_UNAVAILABLE' })
  await expect(activation).rejects.toThrowErrorMatchingInlineSnapshot('[HarnessError: Host debugging cannot constrain or revoke arbitrary Host effects. Use read-only Session Inspector in protected compositions.]')
  expect(startInspector).not.toHaveBeenCalled()
})

it('refuses startup with a persistent audit owner and no enabled target rules', async () => {
  const h = await harness(true)
  await expect(h.ctx.plugin(Protected, { port: 0, captureFetch: false }).await().then(() => undefined))
    .rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  expect(startInspector).not.toHaveBeenCalled()
})
