/** Native aside behavior through real AgentLoop sessions and persisted event records. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ReasoningEffortId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { ApiSessionAgentController } from '../src/agent.ts'
import { SessionAsideController } from '../src/asides.ts'
import { createSessionTestRemote } from './test-remote.ts'

const prompt = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })

async function fixture(ctx: Context) {
  await mountAgentLoopTestDependencies(ctx)
  const harness = await mountAgentLoopTestHarness(ctx)
  const adapter = new MockAdapter(Array.from({ length: 8 }, () => textResponse('fixture reply')), {
    efforts: ['off', 'low', 'high', 'max'].map(id => ({ id: ReasoningEffortId(id), name: id })),
    defaultEffort: ReasoningEffortId('high'),
  })
  ctx.llm.registerAdapter(['mock'], adapter)
  ctx.provide('workspaceRegistry', { list: () => [], archivedSessionIds: [] } as never)
  const pinnedPresets: Array<{ sessionId: string; preset: string }> = []
  ctx.provide('permissionPresets', {
    set: (session: { header: { id: string } }, preset: string) => { pinnedPresets.push({ sessionId: session.header.id, preset }) },
  } as never)
  createSessionTestRemote(ctx, { defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/tmp' })
  let btwEffort = 'low'
  const controller = new SessionAsideController(
    ctx,
    new ApiSessionAgentController(ctx, { sideContextBytes: 65536, btwContextBytes: 8192 }),
    () => btwEffort,
    512,
  )
  ctx.effect(() => () => controller.close())
  const parent = await harness.create(SessionId('parent'), { provider: 'mock', model: 'mock' })
  return { parent, adapter, controller, pinnedPresets, setBtwEffort: (effort: string) => { btwEffort = effort } }
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
      const reopened = new SessionAsideController(
        ctx,
        new ApiSessionAgentController(ctx, { sideContextBytes: 65536, btwContextBytes: 8192 }),
        () => 'low',
        512,
      )
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
      // The context note arrives as a runtime-context message; the child owns one real user turn.
      expect(child.session.deriveMessages()
        .filter(message => message.role === 'user' && 'source' in message && message.source?.kind === 'user'))
        .toHaveLength(1)
    } finally { await ctx.fiber.dispose() }
  })

  it('creates a fresh btw every time with only the bounded parent progress snapshot', async () => {
    const ctx = new Context()
    try {
      const { parent, adapter, controller } = await fixture(ctx)
      parent.followup(prompt('parent secret marker'))
      await parent.whenIdle()
      const first = await controller.open({ sessionId: parent.id, kind: 'btw' })
      const child = ctx.agents.get(first.sessionId)!
      child.followup(prompt('first btw marker'))
      await child.whenIdle()
      // The parent's work arrives as a labeled, bounded snapshot — not as
      // conversation turns the quick question could continue.
      const firstRequest = JSON.stringify(adapter.requests.at(-1))
      expect(firstRequest).toContain('progress snapshot')
      expect(firstRequest).toContain('parent secret marker')
      expect(firstRequest).toContain('at most three short sentences')
      expect(firstRequest).toContain('no follow-up questions')
      // The snapshot arrives as a runtime-context message; the child owns one real user turn.
      expect(child.session.deriveMessages()
        .filter(message => message.role === 'user' && 'source' in message && message.source?.kind === 'user'))
        .toHaveLength(1)
      const second = await controller.open({ sessionId: parent.id, kind: 'btw' })
      expect(second.sessionId).not.toBe(first.sessionId)
      const fresh = ctx.agents.get(second.sessionId)!
      fresh.followup(prompt('second btw marker'))
      await fresh.whenIdle()
      const messages = JSON.stringify(adapter.requests.at(-1)?.messages)
      expect(messages).not.toContain('first btw marker')
      expect(messages).toContain('second btw marker')
      await controller.close()
      await expect(controller.open({ sessionId: parent.id, kind: 'btw' })).rejects.toMatchObject({ code: 'gateway/internal' })
    } finally { await ctx.fiber.dispose() }
  })

  it('pins a quick question to the read-only preset and leaves a side question alone', async () => {
    const ctx = new Context()
    try {
      const { parent, controller, pinnedPresets } = await fixture(ctx)
      const btw = await controller.open({ sessionId: parent.id, kind: 'btw' })
      expect(pinnedPresets).toEqual([{ sessionId: String(btw.sessionId), preset: 'read-only' }])
      const side = await controller.open({ sessionId: parent.id, kind: 'side' })
      expect(pinnedPresets).toHaveLength(1)
      expect(pinnedPresets.some(entry => entry.sessionId === String(side.sessionId))).toBe(false)
    } finally { await ctx.fiber.dispose() }
  })

  it('answers a progress question from the in-flight parent turn', async () => {
    const ctx = new Context()
    try {
      const { parent, adapter, controller } = await fixture(ctx)
      parent.followup(prompt('把索引重建完'))
      await parent.whenIdle()
      const opened = await controller.open({ sessionId: parent.id, kind: 'btw' })
      const child = ctx.agents.get(opened.sessionId)!
      child.followup(prompt('进度如何'))
      await child.whenIdle()
      const request = JSON.stringify(adapter.requests.at(-1))
      expect(request).toContain('progress snapshot')
      expect(request).toContain('Status: idle')
      expect(request).toContain('Latest user request: 把索引重建完')
      expect(request).toContain('fixture reply')
    } finally { await ctx.fiber.dispose() }
  })

  it('uses the configured quick-question level while a side question follows the main conversation', async () => {
    const ctx = new Context()
    try {
      const { parent, adapter, controller, setBtwEffort } = await fixture(ctx)
      parent.followup(prompt('main work'))
      await parent.whenIdle()
      const mainEffort = String(adapter.requests.at(-1)?.reasoningEffort)
      const btw = await controller.open({ sessionId: parent.id, kind: 'btw' })
      ctx.agents.get(btw.sessionId)!.followup(prompt('进度如何'))
      await ctx.agents.get(btw.sessionId)!.whenIdle()
      expect(String(adapter.requests.at(-1)?.reasoningEffort)).toBe('low')
      expect(adapter.requests.at(-1)?.maxTokens).toBe(512)
      const side = await controller.open({ sessionId: parent.id, kind: 'side' })
      ctx.agents.get(side.sessionId)!.followup(prompt('side question'))
      await ctx.agents.get(side.sessionId)!.whenIdle()
      // The side question keeps the main conversation's own effective level
      // (the model default here), never the quick question's override.
      expect(String(adapter.requests.at(-1)?.reasoningEffort)).toBe(mainEffort)
      expect(adapter.requests.at(-1)?.maxTokens).toBeUndefined()
      setBtwEffort('max')
      const second = await controller.open({ sessionId: parent.id, kind: 'btw' })
      ctx.agents.get(second.sessionId)!.followup(prompt('再来一次'))
      await ctx.agents.get(second.sessionId)!.whenIdle()
      expect(String(adapter.requests.at(-1)?.reasoningEffort)).toBe('max')
    } finally { await ctx.fiber.dispose() }
  })
})
