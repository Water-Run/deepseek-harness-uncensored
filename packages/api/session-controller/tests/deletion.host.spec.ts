/** End-to-end deletion across real AgentLoop, JSONL, SQLite, projection cache and Workspace storage. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import SqliteQuery from '@deepseek-ai/dsh-session-query-sqlite'
import ProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { createSessionTestController } from './test-remote.ts'
import { ApiSessionAgentController } from '../src/agent.ts'

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function setup(script?: ConstructorParameters<typeof MockAdapter>[0], existingRoot?: string) {
  const root = existingRoot ?? await mkdtemp(join(tmpdir(), 'dshu-delete-api-'))
  if (existingRoot === undefined) roots.push(root)
  const cwd = join(root, 'workspace'), stored = join(root, 'sessions'), cache = join(root, 'storage')
  await mkdir(cwd, { recursive: true }); await writeFile(join(cwd, 'keep.txt'), 'workspace file')
  const ctx = new Context(); contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Jsonl, { root: stored, compression: 'none' }).await()
  await ctx.plugin(Storage).await()
  await ctx.plugin(JsonStorage, { root: cache }).await()
  await ctx.plugin(StorageDomain, { backend: 'json' }).await()
  await ctx.plugin(WorkspaceRegistry).await()
  await ctx.plugin(ProjectionCache, { writeEveryEvents: 1000, writeIntervalMs: 60000 }).await()
  await ctx.plugin(SqliteQuery, { path: join(root, 'search.sqlite'), openAt: 'startup' }).await()
  const harness = await mountAgentLoopTestHarness(ctx)
  const adapter = new MockAdapter(script ?? Array.from({ length: 8 }, () => textResponse('fixture answer')))
  ctx.llm.registerAdapter(['mock'], adapter)
  const api = createSessionTestController(ctx, { cwd, defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }) })
  return { root, cwd, stored, cache, ctx, api, harness, adapter }
}

it('deletes native asides and derived data while preserving independent forks and workspace files', async () => {
  const { ctx, api, cwd, cache } = await setup()
  const workspace = await ctx.workspaceRegistry.create(cwd)
  const { sessionId } = await api.create({ cwd })
  const parent = ctx.agents.get(sessionId)!
  parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'deletion_marker' }] }))
  await parent.whenIdle()
  await workspace.attachSession(sessionId)
  await ctx.workspaceRegistry.pinSession(sessionId)
  const side = await api.aside({ sessionId, kind: 'side' })
  const btw = await api.aside({ sessionId, kind: 'btw' })
  const fork = await api.fork({ sessionId })
  const before = await ctx.sessionQuery.searchSessions({ query: 'deletion_marker' })
  expect(before.items.some(item => item.header.id === sessionId)).toBe(true)
  const result = await api.delete({ sessionId })
  expect(new Set(result.deletedSessionIds)).toEqual(new Set([sessionId, side.sessionId, btw.sessionId]))
  expect(ctx.agents.get(sessionId)).toBeUndefined()
  const remaining = await ctx.sessionPersistence.list()
  expect(remaining.map(item => item.header.id)).toEqual([fork.sessionId])
  expect((await ctx.sessionQuery.searchSessions({ query: 'deletion_marker' })).items.map(item => item.header.id)).toEqual([fork.sessionId])
  expect(workspace.sessionIds).not.toContain(sessionId)
  expect(ctx.workspaceRegistry.pinnedSessionIds).not.toContain(sessionId)
  expect(await readFile(join(cwd, 'keep.txt'), 'utf8')).toBe('workspace file')
  const cacheFiles = await readdir(join(cache, 'session_projcache', 'sessions'))
  expect(cacheFiles).not.toContain(sessionId + '.json')
  expect((await api.delete({ sessionId })).deletedSessionIds).toEqual([sessionId])
  await expect(api.aside({ sessionId, kind: 'side' })).rejects.toThrow()
})

it('stops a running API-owned conversation before removing its writer and log', async () => {
  const { ctx, api, cwd, adapter } = await setup(['hang'])
  const { sessionId } = await api.create({ cwd })
  const parent = ctx.agents.get(sessionId)!
  parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'running_marker' }] }))
  await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
  expect(parent.status).toBe('running')
  await api.delete({ sessionId })
  expect(adapter.requests[0]?.signal?.aborted).toBe(true)
  expect(ctx.agents.get(sessionId)).toBeUndefined()
  expect(await ctx.sessionPersistence.stat(sessionId)).toBeUndefined()
})

it('purges an already-indexed cold Session before another search and blocks delayed checkpoint writes', async () => {
  const { root, ctx, api, cwd, cache } = await setup()
  const lifecycle = new ApiSessionAgentController(ctx, 65536)
  const id = SessionId('cold-indexed')
  const agent = await lifecycle.createOwned({ sessionId: id, meta: { cwd }, agentOptions: { provider: 'mock', model: 'mock' } })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'cold_deletion_marker' }] }))
  await agent.whenIdle()
  await lifecycle.disposeOwned(id)
  expect((await ctx.sessionQuery.searchSessions({ query: 'cold_deletion_marker' })).items).toHaveLength(1)
  const db = new DatabaseSync(join(root, 'search.sqlite'))
  try {
    const count = () => Number(db.prepare('SELECT count(*) AS count FROM persisted_docs WHERE session_id = ?').get(id)?.count)
    expect(count()).toBeGreaterThan(0)
    await api.delete({ sessionId: id })
    expect(count()).toBe(0)
    await ctx.sessionProjectionCache.write(agent.session)
    await expect(readFile(join(cache, 'session_projcache', 'sessions', id + '.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { db.close() }
})

it('rejects deletion without authorization before stopping or altering the conversation', async () => {
  const { ctx, api, cwd } = await setup()
  const { sessionId } = await api.create({ cwd })
  const denied = vi.spyOn(ctx.remoteAccess, 'allows').mockReturnValue(false)
  try { await expect(api.delete({ sessionId })).rejects.toMatchObject({ code: 'remote-access/denied' }) }
  finally { denied.mockRestore() }
  expect(ctx.agents.get(sessionId)).toBeDefined()
  expect(await ctx.sessionPersistence.stat(sessionId)).toBeDefined()
})

it('preserves a live writer owned outside this API controller', async () => {
  const { ctx, api, cwd, harness, adapter } = await setup(['hang'])
  const foreign = await harness.create(SessionId('foreign-owner'), { provider: 'mock', model: 'mock' }, { cwd })
  foreign.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'foreign marker' }] }))
  await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
  await expect(api.delete({ sessionId: foreign.id })).rejects.toMatchObject({ code: 'session/writer-held' })
  expect(foreign.status).toBe('running')
  expect(adapter.requests[0]?.signal?.aborted).toBe(false)
  expect(await ctx.sessionPersistence.stat(foreign.id)).toBeDefined()
})

it('recovers derived cleanup after restart without restoring deleted conversation files', async () => {
  const { root, ctx, api, cwd } = await setup()
  const { sessionId } = await api.create({ cwd })
  const workspace = await ctx.workspaceRegistry.create(cwd)
  await workspace.attachSession(sessionId)
  await ctx.workspaceRegistry.pinSession(sessionId)
  const cleanup = vi.spyOn(ctx.sessionQuery, 'forgetSessions').mockRejectedValueOnce(new Error('cleanup interrupted'))
  await expect(api.delete({ sessionId })).rejects.toMatchObject({ code: 'session/delete-incomplete' })
  expect(cleanup).toHaveBeenCalledTimes(1)
  cleanup.mockRestore()
  expect(ctx.workspaceRegistry.pinnedSessionIds).toContain(sessionId)
  await ctx.fiber.dispose()
  const restored = await setup(undefined, root)
  await restored.api.list({}, new AbortController().signal)
  expect(restored.ctx.workspaceRegistry.pinnedSessionIds).not.toContain(sessionId)
  expect(await restored.ctx.sessionPersistence.stat(sessionId)).toBeUndefined()
  expect(await restored.ctx.sessionPersistence.deletedSessionIds()).toContain(sessionId)
})

it('excludes native child publication while another Host attempts to delete its parent', async () => {
  const { root, ctx, api, cwd } = await setup()
  const lifecycle = new ApiSessionAgentController(ctx, 65536)
  const id = SessionId('concurrent-parent')
  await lifecycle.createOwned({ sessionId: id, meta: { cwd }, agentOptions: { provider: 'mock', model: 'mock' } })
  await lifecycle.disposeOwned(id)
  const other = await setup(undefined, root)
  const entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  const observe = ctx.sessionQuery.observeSession.bind(ctx.sessionQuery)
  const suspended = vi.spyOn(ctx.sessionQuery, 'observeSession').mockImplementationOnce(async (...args) => {
    const observation = await observe(...args)
    entered.resolve(undefined)
    await release.promise
    return observation
  })
  const child = api.aside({ sessionId: id, kind: 'side' })
  try {
    await entered.promise
    await expect(other.api.delete({ sessionId: id })).rejects.toMatchObject({ code: 'session/writer-held' })
    expect(await other.ctx.sessionPersistence.stat(id)).toBeDefined()
  } finally {
    release.resolve(undefined)
    await child
    suspended.mockRestore()
  }
})
