/** Native aside behavior through real AgentLoop sessions and persisted event records. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { ApiSessionAgentController } from '../src/agent.ts'
import { SessionAsideController } from '../src/asides.ts'
import { createSessionTestRemote } from './test-remote.ts'

const prompt = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })

async function fixture(ctx: Context) {
  await mountAgentLoopTestDependencies(ctx)
  const harness = await mountAgentLoopTestHarness(ctx)
  const adapter = new MockAdapter(Array.from({ length: 8 }, () => textResponse('fixture reply')))
  ctx.llm.registerAdapter(['mock'], adapter)
  ctx.provide('workspaceRegistry', { list: () => [], archivedSessionIds: [] } as never)
  createSessionTestRemote(ctx, { defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/tmp' })
  const controller = new SessionAsideController(ctx, new ApiSessionAgentController(ctx, 65536))
  ctx.effect(() => () => controller.close())
  const parent = await harness.create(SessionId('parent'), { provider: 'mock', model: 'mock' })
  return { parent, adapter, controller }
}

describe('native side conversations', () => {
  it('refreshes completed main progress before every side request while retaining side history', async () => {
    const ctx = new Context()
    try {
      const { parent, adapter, controller } = await fixture(ctx)
      parent.followup(prompt('initial main background'))
      await parent.whenIdle()
      const opened = await controller.open({ sessionId: parent.id, kind: 'side' })
      const child = ctx.agents.get(opened.sessionId)!
      child.followup(prompt('first side question'))
      await child.whenIdle()
      parent.followup(prompt('main update after side opened'))
      await parent.whenIdle()
      parent.inbox.append('next-turn', prompt('unfinished main instruction'))
      const mainBeforeSide = parent.session.snapshotEvents()
      expect(await controller.open({ sessionId: parent.id, kind: 'side' })).toEqual(opened)
      child.followup(prompt('what changed on the main task?'))
      await child.whenIdle()
      const current = JSON.stringify(adapter.requests.at(-1))
      expect(current).toContain('initial main background')
      expect(current).toContain('first side question')
      expect(current).toContain('main update after side opened')
      expect(current).toContain('completed updates since this side conversation opened')
      expect(current).not.toContain('unfinished main instruction')
      expect(JSON.stringify(child.session.snapshotEvents())).toContain('main update after side opened')
      expect(parent.session.snapshotEvents()).toEqual(mainBeforeSide)
    } finally { await ctx.fiber.dispose() }
  })

  it('inherits completed context, excludes queued work, and resumes the same side with one context note', async () => {
    const ctx = new Context()
    try {
      const { parent, adapter, controller } = await fixture(ctx)
      parent.followup(prompt('parent background'))
      await parent.whenIdle()
      parent.inbox.append('next-turn', prompt('parent queued work'))
      const original = parent.session.snapshotEvents()
      const [one, concurrent] = await Promise.all([controller.open({ sessionId: parent.id, kind: 'side' }), controller.open({ sessionId: parent.id, kind: 'side' })])
      expect(concurrent).toEqual(one)
      const child = ctx.agents.get(one.sessionId)!
      expect(adapter.requests).toHaveLength(1)
      expect(child.inbox.nextStep).toHaveLength(0)
      child.followup(prompt('side question one'))
      await child.whenIdle()
      const first = JSON.stringify(adapter.requests.at(-1))
      expect(first).toContain('parent background')
      expect(first).toContain('This is a side question')
      expect(first).not.toContain('parent queued work')
      // A new owner simulates reopening after the UI controller was replaced.
      const reopened = new SessionAsideController(ctx, new ApiSessionAgentController(ctx, 65536))
      try {
        expect(await reopened.open({ sessionId: parent.id, kind: 'side' })).toEqual(one)
        expect(child.inbox.nextStep).toHaveLength(0)
        child.followup(prompt('side question two'))
        await child.whenIdle()
        expect(JSON.stringify(adapter.requests.at(-1)?.messages)).toContain('side question one')
        expect(child.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(3)
        expect(JSON.stringify(child.session.deriveMessages()).match(/This is a side question/gu)).toHaveLength(1)
        expect(parent.session.snapshotEvents()).toEqual(original)
      } finally { await reopened.close() }
    } finally { await ctx.fiber.dispose() }
  })

  it('opens before a completed turn and keeps its system context after inbox cancellation', async () => {
    const ctx = new Context()
    try {
      const { parent, adapter, controller } = await fixture(ctx)
      const created = await controller.open({ sessionId: parent.id, kind: 'side' })
      const child = ctx.agents.get(created.sessionId)!
      child.inbox.clear()
      expect(child.inbox.nextStep).toHaveLength(0)
      expect(await controller.open({ sessionId: parent.id, kind: 'side' })).toEqual(created)
      expect(child.inbox.nextStep).toHaveLength(0)
      expect(adapter.requests).toHaveLength(0)
      child.followup(prompt('question after cancellation'))
      await child.whenIdle()
      expect(JSON.stringify(adapter.requests.at(-1))).toContain('This is a side question')
      expect(child.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(1)
    } finally { await ctx.fiber.dispose() }
  })

  it('creates a fresh btw every time without parent or earlier btw messages', async () => {
    const ctx = new Context()
    try {
      const { parent, adapter, controller } = await fixture(ctx)
      parent.followup(prompt('parent secret marker'))
      await parent.whenIdle()
      const first = await controller.open({ sessionId: parent.id, kind: 'btw' })
      const child = ctx.agents.get(first.sessionId)!
      child.followup(prompt('first btw marker'))
      await child.whenIdle()
      expect(JSON.stringify(adapter.requests.at(-1)?.messages)).not.toContain('parent secret marker')
      const second = await controller.open({ sessionId: parent.id, kind: 'btw' })
      expect(second.sessionId).not.toBe(first.sessionId)
      const fresh = ctx.agents.get(second.sessionId)!
      fresh.followup(prompt('second btw marker'))
      await fresh.whenIdle()
      const messages = JSON.stringify(adapter.requests.at(-1)?.messages)
      expect(messages).not.toContain('parent secret marker')
      expect(messages).not.toContain('first btw marker')
      expect(messages).toContain('second btw marker')
      await controller.close()
      await expect(controller.open({ sessionId: parent.id, kind: 'btw' })).rejects.toMatchObject({ code: 'gateway/internal' })
    } finally { await ctx.fiber.dispose() }
  })
})
