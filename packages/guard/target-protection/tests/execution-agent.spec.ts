/** Host callback identity follows exact live Agents independently of audit recording. @module */
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, onTestFinished } from 'vitest'
import Protection from '../src/index.ts'

async function fixture(audit: boolean) {
  const ctx = new Context(), root = await mkdtemp(join(tmpdir(), 'target-execution-agent-'))
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally { await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }) }
  })
  await mountAgentLoopTestDependencies(ctx); await mountAgentLoopTestHarness(ctx)
  await ctx.plugin(Protection, { path: ':memory:', hostsFile: '', ...audit ? { auditPath: join(root, 'audit.sqlite') } : {} })
  const first = await ctx.agents.create({ sessionId: SessionId('first') })
  const second = await ctx.agents.create({ sessionId: SessionId('second') })
  return { ctx, first, second, protection: ctx.targetProtection }
}

it.each([false, true])('reads only the live initiating Agent with audit recording %s', async (audit) => {
  const h = await fixture(audit)
  expect(h.protection.currentExecutionAgent()).toBeUndefined()
  expect(await h.ctx.agents.withInitiator(h.first.agent, async () => {
    await Promise.resolve()
    return h.protection.currentExecutionAgent()
  })).toBe(h.first.agent)
  await h.ctx.agents.withInitiator(h.first.agent, async () => {
    await h.protection.bindAuditSession(h.second.agent.id)(async () => {
      expect(h.protection.currentExecutionAgent()).toBeUndefined()
    })
    await h.protection.bindAuditSession(undefined)(async () => {
      expect(h.protection.currentExecutionAgent()).toBeUndefined()
    })
    await h.ctx.agents.withoutInitiator(async () => {
      expect(h.protection.currentExecutionAgent()).toBeUndefined()
    })
    expect(h.protection.currentExecutionAgent()).toBe(h.first.agent)
  })
})

it.each([false, true])('uses the explicit tool caller and clears agentless dispatch with audit recording %s', async (audit) => {
  const h = await fixture(audit)
  h.ctx.effect(() => h.ctx.tools.register(defineTool({
    name: 'caller', description: 'Read the exact Host callback initiator.', parameters: {},
    output: { schema: { type: 'string' }, render: () => [] },
    async execute(_args, execution) {
      await Promise.resolve()
      const agent = h.protection.currentExecutionAgent()
      expect(agent).toBe(execution.agent)
      return agent?.id ?? 'host'
    },
  })))
  const request = { name: 'caller', arguments: {}, callId: ToolCallId('caller'), signal: new AbortController().signal }
  expect(await h.ctx.agents.withInitiator(h.first.agent, () => executeToolFixture(h.ctx, { ...request, agent: h.second.agent })))
    .toMatchObject({ isError: false, value: 'second' })
  expect(await h.ctx.agents.withInitiator(h.first.agent, () => executeToolFixture(h.ctx, request)))
    .toMatchObject({ isError: false, value: 'host' })
})

it('rejects a withdrawn initiator even when a new Agent reuses its Session ID', async () => {
  const h = await fixture(false)
  const release: PromiseWithResolvers<void> = Promise.withResolvers()
  onTestFinished(() => { release.resolve() })
  const pending = h.ctx.agents.withInitiator(h.first.agent, async () => {
    await release.promise
    return h.protection.currentExecutionAgent()
  })
  const rejected = expect(pending).rejects.toMatchObject({ code: 'unavailable' })
  await h.first.dispose()
  await h.ctx.agents.create({ sessionId: h.first.agent.id })
  release.resolve()
  await rejected
})
