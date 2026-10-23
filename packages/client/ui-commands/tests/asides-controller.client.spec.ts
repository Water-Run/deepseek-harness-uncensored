import { describe, expect, it, vi } from 'vitest'
import type { SessionReference, SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { InlineAsideController } from '../src/client/asides/controller.ts'

const parent = 'parent' as SessionId
function reference(id: string): SessionReference {
  const release = vi.fn()
  return { sessionId: id as SessionId, get binding(): SessionBinding { throw new Error('binding is unused by this controller') },
    ready: new Promise(() => {}), release, [Symbol.dispose]: release }
}

describe('one-shot inline questions', () => {
  it('requires content and never creates an empty question', async () => {
    const create = vi.fn(), submit = vi.fn()
    const controller = new InlineAsideController(create, submit)
    try {
      expect(await controller.ask(parent, '  ')).toBe(false)
      expect(create).not.toHaveBeenCalled()
      expect(submit).not.toHaveBeenCalled()
      expect(controller.state.getSnapshot().size).toBe(0)
    } finally { await controller.dispose() }
  })

  it('coalesces identical in-flight questions and creates a fresh child for the next question', async () => {
    const pending = Promise.withResolvers<SessionReference>()
    const first = reference('one'), second = reference('two')
    const create = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(second)
    const submit = vi.fn(async (_reference: SessionReference, _question: string) => {})
    const controller = new InlineAsideController(create, submit)
    try {
      const opening = controller.ask(parent, ' question one ')
      expect(controller.ask(parent, 'question one')).toBe(opening)
      expect(await controller.ask(parent, 'different question')).toBe(false)
      expect(controller.state.getSnapshot().get(parent)).toEqual({ status: 'opening' })
      pending.resolve(first)
      expect(await opening).toBe(true)
      expect(submit.mock.calls[0]?.[0]).toBe(first)
      expect(submit.mock.calls[0]?.[1]).toBe('question one')
      expect(await controller.ask(parent, 'question two')).toBe(true)
      expect(create).toHaveBeenCalledTimes(2)
      expect(first.release).toHaveBeenCalledOnce()
      const current = controller.state.getSnapshot().get(parent)
      expect(current?.status).toBe('ready')
      if (current?.status !== 'ready') throw new Error('question is not ready')
      expect(current.reference.sessionId).toBe('two')
      expect(current.submitFailed).toBe(false)
    } finally { pending.resolve(first); await controller.dispose() }
    expect(second.release).toHaveBeenCalledOnce()
  })

  it('does not send after hiding during creation and drains hidden creations on dispose', async () => {
    const one = Promise.withResolvers<SessionReference>(), two = Promise.withResolvers<SessionReference>()
    const first = reference('one'), second = reference('two')
    const submit = vi.fn(async () => {})
    const controller = new InlineAsideController(vi.fn().mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise), submit)
    const firstAsk = controller.ask(parent, 'one')
    controller.hide(parent)
    const secondAsk = controller.ask(parent, 'two')
    let disposed = false
    const closing = controller.dispose().then(() => { disposed = true })
    two.resolve(second)
    await secondAsk
    expect(disposed).toBe(false)
    one.resolve(first)
    await firstAsk
    await closing
    expect(submit).not.toHaveBeenCalled()
    expect(first.release).toHaveBeenCalledOnce()
    expect(second.release).toHaveBeenCalledOnce()
    expect(controller.state.getSnapshot().size).toBe(0)
  })

  it('retains the child until an already-sent prompt settles after the panel closes', async () => {
    const sent = Promise.withResolvers<undefined>(), finish = Promise.withResolvers<undefined>()
    const child = reference('one')
    const controller = new InlineAsideController(async () => child, async () => { sent.resolve(undefined); await finish.promise })
    const asking = controller.ask(parent, 'question')
    await sent.promise
    controller.hide(parent)
    expect(child.release).not.toHaveBeenCalled()
    expect(controller.state.getSnapshot().size).toBe(0)
    const closing = controller.dispose()
    finish.resolve(undefined)
    expect(await asking).toBe(true)
    await closing
    expect(child.release).toHaveBeenCalledOnce()
  })

  it('preserves a failed admission transcript and never retries automatically', async () => {
    const child = reference('unconfirmed')
    const create = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(child)
    const submit = vi.fn(async () => { throw new Error('unknown admission outcome') })
    const controller = new InlineAsideController(create, submit)
    try {
      expect(await controller.ask(parent, 'question')).toBe(false)
      expect(controller.state.getSnapshot().get(parent)).toEqual({ status: 'failed' })
      expect(await controller.ask(parent, 'question')).toBe(false)
      expect(controller.state.getSnapshot().get(parent)).toEqual({ status: 'ready', reference: child, submitFailed: true })
      expect(submit).toHaveBeenCalledOnce()
      expect(child.release).not.toHaveBeenCalled()
    } finally { await controller.dispose() }
    expect(child.release).toHaveBeenCalledOnce()
    expect(await controller.ask(parent, 'question')).toBe(false)
    expect(create).toHaveBeenCalledTimes(2)
  })
})
