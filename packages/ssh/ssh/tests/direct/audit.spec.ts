/** File request audits and cleanup of helper streams whose results cannot be published. @module */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import TargetProtection from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { harness } from './fixture.ts'

it.each(['fs.stream', 'fs.next'])('closes an allocated stream after %s loses its audit acknowledgement', async (failedMethod) => {
  const id = randomUUID(), active = new Set<string>()
  const h = await harness({ handle: async (method, params) => {
    if (method === 'fs.resolve') return { targetKey: '/fixture/workspace/file.txt', displayPath: '/fixture/workspace/file.txt' }
    if (method === 'fs.stream') { active.add(id); return id }
    if (method === 'fs.next') return { done: false, value: 'private chunk' }
    if (method === 'fs.streamClose') {
      expect(z.object({ id: z.string() }).parse(params).id).toBe(id)
      active.delete(id); return null
    }
    throw new Error(`Unexpected fixture method: ${method}`)
  } })
  onTestFinished(() => { vi.restoreAllMocks() })
  await h.ctx.plugin(TargetProtection, { path: ':memory:', auditPath: join(h.root, 'audit.sqlite'), hostsFile: '' })
  await h.ctx.plugin(ProtectedSsh, h.config)
  const target = { targetKey: '/fixture/workspace/file.txt', displayPath: '/fixture/workspace/file.txt' }
  if (failedMethod === 'fs.next') await h.ctx.ssh.request('fs.stream', { target }, z.string())
  vi.spyOn(h.ctx.targetProtection, 'auditRemoteFile').mockImplementation(async (_identity, _effect, bounded, execute) => {
    await execute(bounded)
    throw new HarnessError('Owned final file audit failure', 'TARGET_AUDIT_UNCONFIRMED')
  })
  await expect(failedMethod === 'fs.stream'
    ? h.ctx.ssh.request('fs.stream', { target }, z.string())
    : h.ctx.ssh.request('fs.next', { id }, z.object({ done: z.boolean(), value: z.string() })))
    .rejects.toMatchObject({ code: 'TARGET_AUDIT_UNCONFIRMED' })
  expect(active.size).toBe(0)
  expect(h.requests.filter(method => method === 'fs.streamClose')).toHaveLength(1)
})
