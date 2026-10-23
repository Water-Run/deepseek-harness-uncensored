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

describe('inline question ownership', () => {
  it('coalesces clicks during creation and creates a fresh child on the next invocation', async () => {
    const pending = Promise.withResolvers<SessionReference>()
    const first = reference('one')
    const second = reference('two')
    const create = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(second)
    const controller = new InlineAsideController(create)
    try {
      const opening = controller.open(parent)
      expect(controller.open(parent)).toBe(opening)
      expect(controller.state.getSnapshot().get(parent)).toEqual({ status: 'opening' })
      pending.resolve(first)
      await opening
      await controller.open(parent)
      expect(create).toHaveBeenCalledTimes(2)
      expect(first.release).toHaveBeenCalledOnce()
      expect(controller.state.getSnapshot().get(parent)).toEqual({ status: 'ready', reference: second })
      controller.hide(parent)
      expect(second.release).toHaveBeenCalledOnce()
      expect(controller.state.getSnapshot().size).toBe(0)
    } finally { pending.resolve(first); await controller.dispose() }
  })

  it('drains both a closed opening and its replacement without repopulating disposed UI', async () => {
    const one = Promise.withResolvers<SessionReference>()
    const two = Promise.withResolvers<SessionReference>()
    const first = reference('one')
    const second = reference('two')
    const controller = new InlineAsideController(vi.fn().mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise))
    void controller.open(parent)
    controller.hide(parent)
    void controller.open(parent)
    let disposed = false
    const closing = controller.dispose().then(() => { disposed = true })
    two.resolve(second)
    await Promise.resolve()
    expect(disposed).toBe(false)
    one.resolve(first)
    await closing
    expect(first.release).toHaveBeenCalledOnce()
    expect(second.release).toHaveBeenCalledOnce()
    expect(controller.state.getSnapshot().size).toBe(0)
  })

  it('shows failure until retry and never recreates after disposal', async () => {
    const child = reference('recovered')
    const create = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(child)
    const controller = new InlineAsideController(create)
    await controller.open(parent)
    expect(controller.state.getSnapshot().get(parent)).toEqual({ status: 'failed' })
    await controller.open(parent)
    expect(controller.state.getSnapshot().get(parent)?.status).toBe('ready')
    await controller.dispose()
    await controller.open(parent)
    expect(create).toHaveBeenCalledTimes(2)
  })
})
