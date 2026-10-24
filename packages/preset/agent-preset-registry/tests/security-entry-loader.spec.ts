import { afterEach, describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import AgentPresets from '../src/index.ts'
import type { SecurityProtectionStatus } from '../src/types.ts'

let context: Context | undefined
let root: string | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('Security first-entry policy through the real Loader', () => {
  it('boots the shipped registry, reads the composed provider, and removes the service on unload', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-security-entry-'))
    const configPath = join(root, 'cordis.yml')
    await copyFile(new URL('./fixtures/security-entry/cordis.yml', import.meta.url), configPath)
    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.builtins.llm = LlmRuntime
    context.loader.builtins.session = SessionStore
    context.loader.builtins['session-projection'] = SessionProjectionRegistry
    context.loader.builtins['system-prompt'] = SystemPrompt
    context.loader.builtins.tools = ToolRuntime
    context.loader.builtins.agent = AgentRegistry
    context.loader.builtins['agent-loop'] = AgentLoop
    context.loader.builtins['agent-presets'] = AgentPresets
    context.loader.builtins['agent-preset'] = AgentPreset
    let protection: SecurityProtectionStatus = { state: 'disabled', revision: 4, capabilities: [] }
    context.loader.builtins['security-protection'] = {
      name: 'security-protection-fixture',
      apply(scope: Context) {
        scope.effect(() => scope.provide('securityProtection', { read: () => protection }), 'security-protection-fixture')
      },
    }
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    const ctx = context
    expect(ctx.get('agentPresets')).toBeInstanceOf(AgentPresets)
    const agent = await ctx.agents.create({
      sessionId: SessionId('loader-security-entry'),
      setup: async (scope) => { await ctx.agentPresets.mount(scope) },
    })
    await expect(ctx.agentPresets.select(agent.agent, 'security')).rejects.toMatchObject({
      code: 'security-entry/required',
      details: { protection },
    })
    const challenge = ctx.agentPresets.beginSecurityEntry(agent.agent.id, 'zh')
    expect(challenge.declaration).toContain('我确认')
    expect(challenge.protection).toEqual(protection)

    const clock = vi.spyOn(performance, 'now')
    const base = performance.now()
    clock.mockReturnValue(base + challenge.waitMs)
    try {
      expect(ctx.agentPresets.confirmSecurityEntry(challenge.id, agent.agent.id, challenge.declaration))
        .toMatchObject({ acknowledged: true })
      protection = { state: 'enabled', revision: 5, capabilities: ['mainland-domains'] }
      ctx.emit('security-protection/changed')
    } finally { clock.mockRestore() }
    expect(ctx.agentPresets.securityEntryState().protection).toEqual(protection)
    expect(await ctx.agentPresets.select(agent.agent, 'security')).toBe('security')

    const entry = [...ctx.loader.entries()].find(row => row.options.name === 'cordis:agent-presets')
    expect(entry?.fiber).toBeDefined()
    await entry!.fiber!.dispose()
    expect(ctx.get('agentPresets')).toBeUndefined()
  })
})
