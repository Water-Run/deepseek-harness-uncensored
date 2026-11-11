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
import type { Session } from '@deepseek-ai/dsh-session'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { createSessionTestController } from './test-remote.ts'
import { ApiSessionAgentController } from '../src/agent.ts'
import { SessionDeletionController } from '../src/deletion.ts'
import SessionController from '../src/index.ts'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { mountWorkingDirectoryFixture } from '../../../subagent/subagent/tests/working-directory-fixture.ts'

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function setup(script?: ConstructorParameters<typeof MockAdapter>[0], existingRoot?: string, withProjectionCache = true) {
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
  if (withProjectionCache) await ctx.plugin(ProjectionCache, { writeEveryEvents: 1000, writeIntervalMs: 60000 }).await()
  await ctx.plugin(SqliteQuery, { path: join(root, 'search.sqlite'), openAt: 'startup' }).await()
  const harness = await mountAgentLoopTestHarness(ctx)
  const adapter = new MockAdapter(script ?? Array.from({ length: 8 }, () => textResponse('fixture answer')))
  ctx.llm.registerAdapter(['mock'], adapter)
  ctx.provide('permissionPresets', {
    set(session: Session, preset: string) {
      if (preset !== 'read-only') throw new Error(`Unexpected deletion fixture preset: ${preset}`)
      setSandboxMode(session, 'read-only')
      setApprovalPolicy(session, 'never')
    },
  } as never)
  const api = await createSessionTestController(ctx, { cwd, defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }) })
  return { root, cwd, stored, cache, ctx, api, harness, adapter }
}

it.each(['side', 'btw'] as const)('checkpoints an empty parent before publishing its %s without adding messages', async (kind) => {
  const first = await setup(undefined, undefined, false)
  const parent = await first.api.create({ cwd: first.cwd })
  const agent = first.ctx.agents.get(parent.sessionId)!
  const before = agent.session.snapshotEvents()
  const aside = await first.api.aside({ sessionId: parent.sessionId, kind })
  expect(agent.session.snapshotEvents()).toEqual(before)
  expect((await first.ctx.sessionPersistence.stat(parent.sessionId))?.sizeBytes).toBeGreaterThan(0)
  expect(await first.ctx.sessionPersistence.stat(aside.sessionId)).toBeDefined()
  expect(first.adapter.requests).toHaveLength(0)
  await first.ctx.fiber.dispose()
  const restored = await setup(undefined, first.root, false)
  const reopened = await restored.api.aside({ sessionId: parent.sessionId, kind })
  if (kind === 'side') expect(reopened.sessionId).toBe(aside.sessionId)
  expect(restored.adapter.requests).toHaveLength(0)
})

it('deletes through a dependency-checked scope with optional persistence', async () => {
  const { ctx, cwd } = await setup()
  const id = SessionId('scoped-deletion')
  await ctx.plugin({
    name: 'scoped-deletion-test', inject: SessionController.inject,
    async apply(scoped: Context) {
      expect(() => scoped.sessionPersistence).toThrow('without inject')
      const agents = new ApiSessionAgentController(scoped, { sideContextBytes: 65536, btwContextBytes: 8192 })
      const deletion = new SessionDeletionController(scoped, agents, { drainTimeoutMs: 30000, pollMs: 50 }, () => {})
      try {
        const agent = await agents.createOwned({ sessionId: id, meta: { cwd }, agentOptions: { provider: 'mock', model: 'mock' } })
        agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'scoped-delete-marker' }] }))
        await agent.whenIdle()
        expect((await deletion.delete(id, () => true)).deletedSessionIds).toEqual([id])
      } finally { await deletion.close(); await agents.disposeOwned(id) }
    },
  }).await()
  expect(await ctx.sessionPersistence.stat(id)).toBeUndefined()
})

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

it('keeps cleared side generations historical across restart, routes to the new context, and deletes the entire family', async () => {
  const first = await setup()
  const { sessionId } = await first.api.create({ cwd: first.cwd })
  const original = await first.api.aside({ sessionId, kind: 'side' })
  const old = first.ctx.agents.get(original.sessionId)!
  old.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'HISTORICAL_SIDE_493' }] }))
  await old.whenIdle()
  const rawBefore = await first.ctx.sessionPersistence.open(original.sessionId, 'read')
  const oldEvents = await rawBefore.read()
  await rawBefore.close()
  const [one, two] = await Promise.all([
    first.api.resetAside({ sessionId: old.id, cause: 'manual' }),
    first.api.resetAside({ sessionId: old.id, cause: 'manual' }),
  ])
  expect(two.sessionId).toBe(one.sessionId)
  expect(one.sessionId).not.toBe(old.id)
  const historical = await first.ctx.sessionPersistence.open(old.id, 'read')
  try { expect((await historical.read()).events.slice(0, oldEvents.events.length)).toEqual(oldEvents.events) }
  finally { await historical.close() }
  await expect(first.api.selectModel({ sessionId: old.id, provider: 'mock', model: 'mock' }))
    .rejects.toMatchObject({ code: 'session/agent-busy', details: { reason: 'side-context-cleared' } })
  await first.ctx.fiber.dispose()
  const reopened = await setup(undefined, first.root)
  expect((await reopened.api.aside({ sessionId, kind: 'side' })).sessionId).toBe(one.sessionId)
  const child = reopened.ctx.agents.get(one.sessionId)!
  child.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'NEW_SIDE_720' }] }))
  await child.whenIdle()
  expect(JSON.stringify(reopened.adapter.requests.at(-1))).not.toContain('HISTORICAL_SIDE_493')
  expect((await reopened.api.resetAside({ sessionId: old.id, cause: 'manual' })).sessionId).toBe(one.sessionId)
  const deleted = await reopened.api.delete({ sessionId })
  expect(new Set(deleted.deletedSessionIds)).toEqual(new Set([sessionId, old.id, one.sessionId]))
  expect(await readFile(join(reopened.cwd, 'keep.txt'), 'utf8')).toBe('workspace file')
})

it('recovers a clear after successor initialization fails without restoring old messages', async () => {
  const { ctx, api, cwd, adapter } = await setup()
  const { sessionId } = await api.create({ cwd })
  const old = await api.aside({ sessionId, kind: 'side' })
  const side = ctx.agents.get(old.sessionId)!
  side.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'FAILED_CLEAR_OLD_492' }] }))
  await side.whenIdle()
  const off = ctx.on('agent/created', ({ agent }) => {
    if (agent.id === `${old.sessionId}-1`) throw new Error('fixture successor setup failed')
  })
  try { await expect(api.resetAside({ sessionId: side.id, cause: 'manual' })).rejects.toThrow('fixture successor setup failed') }
  finally { off() }
  const current = await api.aside({ sessionId, kind: 'side' })
  expect(current.sessionId).not.toBe(side.id)
  const fresh = ctx.agents.get(current.sessionId)!
  fresh.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'RETRY_NEW_273' }] }))
  await fresh.whenIdle()
  expect(JSON.stringify(adapter.requests.at(-1))).not.toContain('FAILED_CLEAR_OLD_492')
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

it('deletes legacy children with unknown descriptors and uncatalogued owned descendants', async () => {
  const { ctx, api, cwd } = await setup()
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime).await()
  const { sessionId } = await api.create({ cwd })
  const parent = ctx.agents.get(sessionId)!
  parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'legacy parent' }] }))
  await parent.whenIdle()
  const childId = SessionId('legacy-owned-child')
  const child = await ctx.agents.create({ sessionId: childId, agentOptions: { provider: 'mock', model: 'mock' }, meta: {
    cwd, origin: 'subagent', parentSession: sessionId,
  },
  })
  parent.session.append('subagent/catalog', {
    version: 1, mode: 'unknown', childId, childCreatedAt: child.agent.session.header.createdAt,
  })
  const grandchildId = SessionId('uncatalogued-owned-grandchild')
  const grandchild = await ctx.agents.create({ sessionId: grandchildId, agentOptions: { provider: 'mock', model: 'mock' }, meta: {
    cwd, origin: 'subagent', parentSession: childId,
  },
  })
  for (const handle of [child, grandchild]) {
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'owned child' }] }))
    await handle.agent.whenIdle()
  }
  await grandchild.dispose()
  await child.dispose()
  expect(await ctx.subagents.listDescendants(sessionId)).toEqual([
    { kind: 'diagnostic', id: childId, parentId: sessionId, depth: 1, reason: 'unsupported' },
  ])
  const fork = await api.fork({ sessionId })
  const result = await api.delete({ sessionId })
  expect(new Set(result.deletedSessionIds)).toEqual(new Set([sessionId, childId, grandchildId]))
  expect((await ctx.sessionPersistence.list()).map(item => item.header.id)).toEqual([fork.sessionId])
})

it('preserves an independent fork incorrectly referenced by a child catalog', async () => {
  const { ctx, api, cwd } = await setup()
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime).await()
  const { sessionId } = await api.create({ cwd })
  const parent = ctx.agents.get(sessionId)!
  parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'independent fork' }] }))
  await parent.whenIdle()
  const fork = await api.fork({ sessionId })
  parent.session.append('subagent/catalog', {
    version: 1, mode: 'unknown', childId: fork.sessionId, childCreatedAt: ctx.agents.get(fork.sessionId)!.session.header.createdAt,
  })
  await expect(api.delete({ sessionId })).rejects.toThrow('ownership does not match')
  expect(await ctx.sessionPersistence.stat(sessionId)).toBeDefined()
  expect(await ctx.sessionPersistence.stat(fork.sessionId)).toBeDefined()
})

it('purges an already-indexed cold Session before another search and blocks delayed checkpoint writes', async () => {
  const { root, ctx, api, cwd, cache } = await setup()
  const lifecycle = new ApiSessionAgentController(ctx, { sideContextBytes: 65536, btwContextBytes: 8192 })
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
  const lifecycle = new ApiSessionAgentController(ctx, { sideContextBytes: 65536, btwContextBytes: 8192 })
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
