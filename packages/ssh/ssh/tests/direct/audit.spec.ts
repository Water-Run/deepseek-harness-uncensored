/** File request audits and cleanup of helper streams whose results cannot be published. @module */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import TargetProtection, { TargetAuditError } from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { harness } from './fixture.ts'

it.each([
  { method: 'fs.stream', closeFails: false }, { method: 'fs.next', closeFails: false }, { method: 'fs.stream', closeFails: true },
])('settles $method resources after an unacknowledged result (cleanup fails: $closeFails)', async ({ method: failedMethod, closeFails }) => {
  const id = randomUUID(), active = new Set<string>()
  const h = await harness({ handle: async (method, params) => {
    if (method === 'fs.resolve') return { targetKey: '/fixture/workspace/file.txt', displayPath: '/fixture/workspace/file.txt' }
    if (method === 'fs.stream') { active.add(id); return id }
    if (method === 'fs.next') return { done: false, value: 'private chunk' }
    if (method === 'fs.streamClose') {
      expect(z.object({ id: z.string() }).parse(params).id).toBe(id)
      if (closeFails) throw new HarnessError('Owned stream close failure', 'SSH_FIXTURE_CLOSE_FAILURE')
      active.delete(id); return null
    }
    throw new Error(`Unexpected fixture method: ${method}`)
  }, close: async () => { active.clear() } })
  onTestFinished(() => { vi.restoreAllMocks() })
  await h.ctx.plugin(TargetProtection, { path: ':memory:', auditPath: join(h.root, 'audit.sqlite'), hostsFile: '' })
  await h.ctx.plugin(ProtectedSsh, h.config)
  const target = { targetKey: '/fixture/workspace/file.txt', displayPath: '/fixture/workspace/file.txt' }
  if (failedMethod === 'fs.next') await h.ctx.ssh.request('fs.stream', { target }, z.string())
  const primary = new HarnessError('Owned final file audit failure', 'TARGET_AUDIT_UNCONFIRMED')
  vi.spyOn(h.ctx.targetProtection, 'auditRemoteFile').mockImplementation(async (_identity, _effect, bounded, execute) => {
    await execute(bounded, () => {})
    throw primary
  })
  const request = failedMethod === 'fs.stream'
    ? h.ctx.ssh.request('fs.stream', { target }, z.string())
    : h.ctx.ssh.request('fs.next', { id }, z.object({ done: z.boolean(), value: z.string() }))
  await expect(request).rejects.toMatchObject({ code: 'TARGET_AUDIT_UNCONFIRMED' })
  if (closeFails) {
    const failure = await request.catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(TargetAuditError)
    if (!(failure instanceof TargetAuditError) || !(failure.cause instanceof AggregateError)) throw new Error('Missing combined audit failure')
    expect(failure.cause.errors[0]).toBe(primary)
    expect(failure.cause.errors[1]).toMatchObject({ code: 'SSH_FIXTURE_CLOSE_FAILURE' })
  }
  expect(active.size).toBe(closeFails ? 1 : 0)
  expect(h.requests.filter(method => method === 'fs.streamClose')).toHaveLength(1)
  await h.close()
  expect(active.size).toBe(0)
})
