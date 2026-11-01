/** Side-composer predictions retain the observed main transcript until the model request settles. */
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { createSessionTestController } from './test-remote.ts'

it('releases the main observation after a side prediction finishes, including its stream cleanup', async () => {
  const ctx = new Context()
  const release: PromiseWithResolvers<void> = Promise.withResolvers()
  const entered: PromiseWithResolvers<void> = Promise.withResolvers()
  const disposed = vi.fn()
  let settled: Promise<unknown> | undefined
  try {
    await mountAgentLoopTestDependencies(ctx)
    const harness = await mountAgentLoopTestHarness(ctx)
    ctx.llm.registerAdapter(['mock'], new MockAdapter([textResponse('Main answer')]))
    ctx.provide('workspaceRegistry', { list: () => [], archivedSessionIds: [] } as never)
    const controller = await createSessionTestController(ctx, {
      defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/prediction-fixture',
    })
    const parent = await harness.create(SessionId('prediction-parent'), { provider: 'mock', model: 'mock' })
    parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Main request' }] }))
    await parent.whenIdle()
    const side = await controller.aside({ sessionId: parent.id, kind: 'side' })
    const observe = ctx.sessionQuery.observeSession.bind(ctx.sessionQuery)
    vi.spyOn(ctx.sessionQuery, 'observeSession').mockImplementation(async (id, options) => {
      const observation = await observe(id, options)
      if (id !== parent.id) return observation
      return {
        source: observation.source, header: observation.header, events: observation.events,
        cursor: observation.cursor, inheritedEventCount: observation.inheritedEventCount,
        ...observation.projections === undefined ? {} : { projections: observation.projections },
        retain: () => observation.retain(),
        [Symbol.dispose]: () => { disposed(); observation[Symbol.dispose]() },
      }
    })
    let cleaned = false
    vi.spyOn(ctx.llm, 'stream').mockImplementation(async function* () {
      try {
        entered.resolve()
        await release.promise
        expect(disposed).not.toHaveBeenCalled()
        yield { type: 'text-delta', index: 0, text: ' next' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } finally { cleaned = true }
    })
    const prediction = controller.predict({ sessionId: side.sessionId, draft: 'Explain', revision: 1, locale: 'en' }, new AbortController().signal)
    settled = prediction.then(value => ({ value }), (error: unknown) => ({ error }))
    await Promise.race([entered.promise, settled.then((outcome) => { throw new Error('Prediction ended before model entry: ' + JSON.stringify(outcome)) })])
    expect(disposed).not.toHaveBeenCalled()
    release.resolve()
    await expect(prediction).resolves.toEqual({ revision: 1, suggestion: ' next' })
    expect(cleaned).toBe(true)
    expect(disposed).toHaveBeenCalledOnce()
  } finally {
    release.resolve()
    await settled
    vi.restoreAllMocks()
    await ctx.fiber.dispose()
  }
})
