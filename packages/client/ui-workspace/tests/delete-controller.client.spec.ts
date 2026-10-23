import { expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult, SessionDeleteValue } from '@deepseek-ai/dsh-api-remotes/client'
import { DeleteSessionController } from '../src/client/session-actions/delete-controller.ts'

const id = 'delete-target' as SessionId
const success: RemoteResult<SessionDeleteValue> = { ok: true, value: { deletedSessionIds: [id] } }

it('requires confirmation and keeps its original target during an in-flight request', async () => {
  const result = Promise.withResolvers<RemoteResult<SessionDeleteValue>>()
  const remove = vi.fn(() => result.promise), refresh = vi.fn(async () => {})
  const controller = new DeleteSessionController(remove, refresh)
  controller.request(id, 'Original')
  controller.cancel()
  expect(remove).not.toHaveBeenCalled()
  controller.request(id, 'Original')
  const pending = controller.confirm()
  expect(controller.confirm()).toBe(pending)
  controller.request('other' as SessionId, 'Other')
  controller.cancel()
  expect(controller.state.getSnapshot().target?.title).toBe('Original')
  result.resolve(success)
  await pending
  expect(remove).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledWith(id)
  expect(refresh).toHaveBeenCalledWith([id])
  expect(controller.state.getSnapshot()).toMatchObject({ target: null, busy: false, notice: { retry: null } })
  await controller.dispose()
})

it('retries a failed view refresh without repeating the destructive request', async () => {
  const remove = vi.fn(async () => success)
  const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
  const controller = new DeleteSessionController(remove, refresh)
  controller.request(id, 'Target')
  await controller.confirm()
  expect(controller.state.getSnapshot().error).toBe('refresh')
  controller.cancel()
  expect(controller.state.getSnapshot().notice?.retry?.deletedIds).toEqual([id])
  controller.retry()
  await controller.confirm()
  expect(remove).toHaveBeenCalledOnce()
  expect(refresh).toHaveBeenCalledTimes(2)
  await controller.dispose()
})

it('drains an admitted request on disposal and suppresses late UI changes', async () => {
  const result = Promise.withResolvers<RemoteResult<SessionDeleteValue>>()
  const refresh = vi.fn(async () => {})
  const controller = new DeleteSessionController(() => result.promise, refresh)
  controller.request(id, 'Target')
  const request = controller.confirm()
  const state = controller.state.getSnapshot()
  let closed = false
  const closing = controller.dispose().then(() => { closed = true })
  await Promise.resolve()
  expect(closed).toBe(false)
  result.resolve(success)
  await request; await closing
  expect(refresh).not.toHaveBeenCalled()
  expect(controller.state.getSnapshot()).toBe(state)
})
