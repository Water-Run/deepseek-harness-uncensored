/** Invalid helper receipts stop file admission without inventing resource attribution. @module */
import { join } from 'node:path'
import TargetProtection from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { harness } from './fixture.ts'

it('closes the connection when a receipt names a rule that was not installed', async () => {
  let closed = 0
  const target = { targetKey: '/fixture/workspace/file.txt', displayPath: '/fixture/workspace/file.txt' }
  const h = await harness({ close: async () => { closed++ }, handle: async (method, _params, _signal, _root, report) => {
    if (method === 'fs.protection') return null
    if (method === 'fs.resolve') return target
    if (method === 'fs.readText') { report([1]); return 'private contents' }
    throw new Error(`Unexpected fixture method: ${method}`)
  } })
  await h.ctx.plugin(TargetProtection, { path: ':memory:', auditPath: join(h.root, 'audit.sqlite'), hostsFile: '' })
  await h.ctx.plugin(ProtectedSsh, { ...h.config, protectedPaths: [{ path: '/fixture/workspace/production', protection: 'audit' }] })
  await expect(h.ctx.ssh.request('fs.readText', { target }, z.string())).rejects.toMatchObject({ code: 'TARGET_AUDIT_UNCONFIRMED' })
  await h.ctx.ssh.dispose()
  expect(closed).toBe(1)
  await expect(h.ctx.ssh.request('fs.readText', { target }, z.string())).rejects.toMatchObject({ code: 'SSH_UNAVAILABLE' })
  const audit = h.ctx.targetProtection.auditHistory().entries.filter(entry => entry.operation === 'file')
  expect(audit).toHaveLength(1)
  expect(audit[0]).toMatchObject({ decision: 'error', ruleIds: [], matchedRules: 0 })
  expect(JSON.stringify(audit)).not.toContain('private contents')
})
