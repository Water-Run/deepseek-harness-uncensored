/** Management refusal through the shipped headless profile. @module */
import { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as ManagerTools from '@deepseek-ai/dsh-plugin-manager/tools'
import assert from 'node:assert/strict'
import Protection from '../src/index.ts'
import TargetDynamicCordis from '../src/cordis.ts'
import TargetPluginManager from '../src/plugin-manager.ts'

/** Cordis fixture name. */
export const name = 'management-protection-snapshot'
/** The real profile and model-tool pipeline remain in use. */
export const inject = ['tools', 'profileContext', 'loader']

/** @param ctx - Dedicated snapshot owner. */
export async function apply(ctx: Context): Promise<void> {
  const local = ctx.isolate('pluginManager').isolate('dynamicCordisRunner').isolate('cordisInspect')
  await local.plugin(Protection, { path: ':memory:', hostsFile: '' })
  await local.plugin(TargetDynamicCordis, {})
  await local.plugin(TargetPluginManager, {})
  await local.plugin(ManagerTools)
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_protected_management',
    description: 'Verify real dynamic execution and plugin management refusal without changing any profile or rule.',
    parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      assert.ok(exec.agent)
      const before = await local.targetProtection.snapshot()
      const runner = local.dynamicCordisRunner
      const { pluginId, packageId } = runner.define({ sessionId: exec.agent.id, plugin: { kind: 'new', idPrefix: 'gate' },
        name: 'protected proof', purpose: 'owned execution refusal',
        code: { host: "return { apply(ctx) { ctx.provide('unexpectedTargetEscape', true) } }" } })
      await assert.rejects(runner.run(exec.agent, pluginId, packageId, 'run'), { code: 'TARGET_DYNAMIC_UNCONFINED' })
      assert.throws(() => local.pluginManager.setBundleEnabled('snapshot-must-not-change', false), { code: 'TARGET_MANAGEMENT_OWNER_REQUIRED' })
      assert.equal(runner.inventory()[0]?.activeRun, undefined)
      assert.equal(local.get('unexpectedTargetEscape'), undefined)
      assert.deepEqual(await local.targetProtection.snapshot(), before)
      await runner.undefine(exec.agent, pluginId)
      return 'Protected dynamic execution and profile management refused; no activation or rule changes.'
    },
  })))
}
