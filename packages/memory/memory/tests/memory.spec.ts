import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import MemoryService, {
  MemoryConflictError, MemoryError, MEMORY_TYPES, scopeCovers, tokenize,
} from '../src/index.ts'
import type { Config as MemoryConfig, MemoryId, MemoryScope, SessionMemoryScope } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
  roots.push(root)
  return root
}

interface Harness {
  readonly ctx: Context
  readonly root: string
  readonly memory: MemoryService
}

async function setup(config: MemoryConfig = {}, root?: string): Promise<Harness> {
  const facts = root ?? await freshRoot()
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: facts })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(MemoryService, config)
  return { ctx, root: facts, memory: ctx.memory }
}

/** Scope one conversation in `workspace-a` running the `standard` preset. */
function sessionScope(mode: string | undefined = 'standard', workspace = 'workspace:aaaaaaaa'): SessionMemoryScope {
  return {
    workspaceKeys: [workspace],
    workspaceKey: workspace,
    ...mode === undefined ? {} : { mode },
    sessionId: SessionId('session-1'),
    freshChild: false,
  }
}

/** Save one scoped record through the service. */
async function save(memory: MemoryService, content: string, scope: MemoryScope = { global: false, workspace: 'workspace:aaaaaaaa', mode: 'standard' }): Promise<MemoryId> {
  const { record } = await memory.create({
    type: 'project-fact',
    content,
    scope,
    source: { kind: 'user', confirmed: true },
  })
  return record.id
}

describe('memory records', () => {
  it('stores identity, classification, scope, provenance, revision, and timestamps', async () => {
    const { memory, ctx } = await setup()
    const created = await memory.create({
      type: 'preference',
      content: '  回答用简体中文。 ',
      title: '语言偏好',
      scope: { global: false, workspace: 'workspace:aaaaaaaa', mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })
    expect(created.deduplicated).toBe(false)
    expect(created.record).toMatchObject({
      type: 'preference',
      content: '回答用简体中文。',
      title: '语言偏好',
      scope: { global: false, workspace: 'workspace:aaaaaaaa', mode: 'standard' },
      status: 'enabled',
      version: 1,
      source: { kind: 'user', confirmed: true },
    })
    expect(created.record.createdAt).toBe(created.record.updatedAt)
    expect(memory.get(created.record.id)).toEqual(created.record)
    expect(memory.list()).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('rejects invalid text and scopes before writing anything', async () => {
    const { memory, ctx } = await setup({ maxContentChars: 10 })
    await expect(memory.create({
      type: 'project-fact',
      content: '   ',
      scope: { global: true },
      source: { kind: 'user', confirmed: true },
    })).rejects.toMatchObject({ code: 'invalid' })
    await expect(memory.create({
      type: 'project-fact',
      content: '这是一条超过十个字符的记忆内容',
      scope: { global: true },
      source: { kind: 'user', confirmed: true },
    })).rejects.toMatchObject({ code: 'invalid' })
    await expect(memory.create({
      type: 'project-fact',
      content: 'global with an axis',
      scope: { global: true, mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })).rejects.toMatchObject({ code: 'invalid' })
    await expect(memory.create({
      type: 'project-fact',
      content: 'scoped to nothing',
      scope: { global: false },
      source: { kind: 'user', confirmed: true },
    })).rejects.toMatchObject({ code: 'invalid' })
    expect(memory.list()).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('returns the existing record instead of duplicating normalized content', async () => {
    const { memory, ctx } = await setup()
    const first = await memory.create({
      type: 'project-fact',
      content: '构建命令是 pnpm run build',
      scope: { global: false, mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })
    const second = await memory.create({
      type: 'project-fact',
      content: '  构建命令是   pnpm run build ',
      scope: { global: false, mode: 'standard' },
      source: { kind: 'assistant', confirmed: false },
    })
    expect(second.deduplicated).toBe(true)
    expect(second.record.id).toBe(first.record.id)
    expect(memory.list()).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('detects a concurrent edit instead of overwriting it', async () => {
    const { memory, ctx } = await setup()
    const id = await save(memory, '原内容')
    const read = memory.get(id)
    if (read === undefined) throw new Error('missing record')
    const first = await memory.update(read.id, { content: '窗口 A 的修改' }, read.version)
    expect(first.version).toBe(2)
    await expect(memory.update(read.id, { content: '窗口 B 的修改' }, read.version))
      .rejects.toBeInstanceOf(MemoryConflictError)
    expect(memory.get(read.id)?.content).toBe('窗口 A 的修改')
    expect(memory.get(read.id)?.version).toBe(2)
    await ctx.fiber.dispose()
  })

  it('clears an optional title and topic with an empty string', async () => {
    const { memory, ctx } = await setup()
    const created = await memory.create({
      type: 'writing-setting',
      content: '主角名字是沈迟',
      title: '主角',
      topic: 'protagonist',
      scope: { global: false, mode: 'writing' },
      source: { kind: 'user', confirmed: true },
    })
    const cleared = await memory.update(created.record.id, { title: '', topic: '' }, created.record.version)
    expect(cleared.title).toBeUndefined()
    expect(cleared.topic).toBeUndefined()
    expect(cleared.version).toBe(2)
    await ctx.fiber.dispose()
  })

  it('disables, re-enables, and deletes without leaving a retrieval hit', async () => {
    const { memory, ctx } = await setup()
    const id = await save(memory, '项目使用 pnpm 工作区')
    const scope = sessionScope()
    const request = { query: 'pnpm 工作区', scope }

    const before = memory.retrieve(request)
    expect(before.selection.entries).toHaveLength(1)

    const read = memory.get(id)
    if (read === undefined) throw new Error('missing record')
    const disabled = await memory.setStatus(read.id, 'disabled', read.version)
    expect(memory.retrieve(request).selection.entries).toHaveLength(0)

    const enabled = await memory.setStatus(disabled.id, 'enabled', disabled.version)
    expect(memory.retrieve(request).selection.entries).toHaveLength(1)

    await expect(memory.remove(enabled.id)).resolves.toBe(true)
    expect(memory.retrieve(request).selection.entries).toHaveLength(0)
    expect(memory.get(enabled.id)).toBeUndefined()
    await expect(memory.remove(enabled.id)).resolves.toBe(false)
    expect(memory.list()).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('keeps records across a reopen with the same storage root', async () => {
    const root = await freshRoot()
    const first = await setup({}, root)
    const { record } = await first.memory.create({
      type: 'operation-result',
      content: '迁移脚本已在 Windows 上验证通过',
      scope: { global: true },
      source: { kind: 'user', confirmed: true },
    })
    await first.ctx.fiber.dispose()

    const second = await setup({}, root)
    expect(second.memory.get(record.id)).toEqual(record)
    expect(second.memory.retrieve({
      query: '迁移脚本 Windows', scope: sessionScope(),
    }).selection.entries[0]?.record.id).toBe(record.id)
    await second.ctx.fiber.dispose()
  })

  it('reports an unreadable medium without clearing stored data', async () => {
    const root = await freshRoot()
    const first = await setup({}, root)
    const created = await first.memory.create({
      type: 'project-fact',
      content: '这是一条必须保留的记忆',
      scope: { global: true },
      source: { kind: 'user', confirmed: true },
    })
    expect(created.record.content).toBe('这是一条必须保留的记忆')
    await first.ctx.fiber.dispose()

    const file = join(root, 'memory.json')
    await writeFile(file, 'not json at all', 'utf8')

    const ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    // A failed open must leave the service unavailable instead of mounting an
    // empty store; the loader reports the thrown `storage-unavailable` cause.
    try {
      await ctx.plugin(MemoryService)
    } catch {
      // The fiber may surface the failure as a rejection or as a failed load.
    }
    expect(ctx.get('memory')).toBeUndefined()
    expect((await readFile(file, 'utf8'))).toBe('not json at all')
    await ctx.fiber.dispose()
  })
})

describe('retrieval', () => {
  it('matches Chinese queries by characters and pairs', async () => {
    const { memory, ctx } = await setup()
    await save(memory, '本项目的发布流程先跑完整构建再推送 main。')
    await save(memory, '部署脚本使用 Docker Compose。')
    const result = memory.retrieve({ query: '发布流程怎么样？', scope: sessionScope() })
    expect(result.selection.entries).toHaveLength(1)
    expect(result.text).toContain('发布流程')
    expect(result.text).not.toContain('Docker')
    await ctx.fiber.dispose()
  })

  it('scopes by workspace and mode and never crosses them by default', async () => {
    const { memory, ctx } = await setup()
    await save(memory, '网安场景默认先做被动侦察', { global: false, workspace: 'workspace:aaaaaaaa', mode: 'security' })
    const security = memory.retrieve({ query: '被动侦察', scope: sessionScope('security') })
    const writing = memory.retrieve({ query: '被动侦察', scope: sessionScope('writing') })
    const otherWorkspace = memory.retrieve({
      query: '被动侦察',
      scope: sessionScope('security', 'workspace:bbbbbbbb'),
    })
    expect(security.selection.entries).toHaveLength(1)
    expect(writing.selection.entries).toHaveLength(0)
    expect(otherWorkspace.selection.entries).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('uses a global record across workspaces and modes only when explicitly shared', async () => {
    const { memory, ctx } = await setup()
    await memory.create({
      type: 'preference',
      content: '回答一律使用简体中文',
      scope: { global: true },
      source: { kind: 'user', confirmed: true },
    })
    const anywhere = memory.retrieve({
      query: '简体中文',
      scope: sessionScope('writing', 'workspace:cccccccc'),
    })
    expect(anywhere.selection.entries).toHaveLength(1)
    expect(scopeCovers({ global: true }, sessionScope())).toBe(true)
    await ctx.fiber.dispose()
  })

  it('drops low-relevance records and reports records excluded by the budget', async () => {
    const { memory, ctx } = await setup({ maxEntries: 1, minRelevance: 0.5 })
    await save(memory, '发布前必须运行 pnpm run build')
    await save(memory, '发布前必须运行 pnpm run test')
    const result = memory.retrieve({ query: '发布前必须运行 pnpm run build', scope: sessionScope() })
    expect(result.selection.entries).toHaveLength(1)
    expect(result.selection.omitted).toBeGreaterThan(0)
    expect(result.text).toContain('did not fit the context budget')
    const unrelated = memory.retrieve({ query: '量子色动力学', scope: sessionScope() })
    expect(unrelated.text).toBe('')
    await ctx.fiber.dispose()
  })

  it('deduplicates identical content and supersedes conflicting topics with the newer record', async () => {
    const { memory, ctx } = await setup()
    const older = await memory.create({
      type: 'project-fact',
      content: '部署目标是腾讯云',
      topic: '部署目标',
      scope: { global: false, workspace: 'workspace:aaaaaaaa', mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })
    const newer = await memory.create({
      type: 'project-fact',
      content: '部署目标是阿里云',
      topic: '部署目标',
      scope: { global: false, workspace: 'workspace:aaaaaaaa', mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })
    // The same fact stored again under a second scope is a duplicate at
    // retrieval time, not a conflict: only one copy reaches the model.
    const duplicate = await memory.create({
      type: 'project-fact',
      content: '部署目标是阿里云',
      topic: '部署目标',
      scope: { global: true },
      source: { kind: 'user', confirmed: true },
    })
    expect(duplicate.record.id).not.toBe(newer.record.id)
    const result = memory.retrieve({ query: '部署目标是什么', scope: sessionScope() })
    expect(result.selection.entries).toHaveLength(1)
    expect(result.selection.entries[0]?.record.id).toBe(newer.record.id)
    expect(result.selection.conflicts).toEqual([{
      kept: newer.record.id,
      superseded: older.record.id,
      topic: '部署目标',
    }])
    expect(result.text).toContain('Conflicting records were superseded')
    await ctx.fiber.dispose()
  })

  it('truncates long content per entry and respects the byte budget', async () => {
    const { memory, ctx } = await setup({ maxEntryChars: 12, maxContextBytes: 800 })
    await save(memory, '这是一条非常长的项目说明'.repeat(20))
    const result = memory.retrieve({ query: '项目说明', scope: sessionScope() })
    expect(result.selection.entries).toHaveLength(1)
    expect(result.text).toContain('…')
    expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(800)
    await ctx.fiber.dispose()
  })

  it('searches management records by Chinese and English text with scope filters', async () => {
    const { memory, ctx } = await setup()
    await save(memory, '本地构建使用 esbuild')
    await save(memory, '写作资料放在 story 目录', { global: true })
    const text = memory.search({ query: '构建' })
    expect(text.records).toHaveLength(1)
    expect(text.ranked).toBe(true)
    const all = memory.search({ query: '' })
    expect(all.ranked).toBe(false)
    expect(all.records).toHaveLength(2)
    expect(memory.list({ scope: { global: true } })).toHaveLength(1)
    expect(memory.list({ text: 'STORY' })).toHaveLength(1)
    await ctx.fiber.dispose()
  })
})

describe('tokens', () => {
  it('splits Latin words and pairs CJK characters', () => {
    const tokens = tokenize('Build 构建 v2')
    expect([...tokens.keys()]).toEqual(expect.arrayContaining(['build', '构', '建', '构建', 'v2']))
    expect(tokens.has('a')).toBe(false)
  })

  it('is empty for punctuation and whitespace', () => {
    expect(tokenize('，。！  ').size).toBe(0)
  })
})

describe('memory type catalog', () => {
  it('names the four durable classes', () => {
    expect(MEMORY_TYPES).toEqual(['preference', 'project-fact', 'operation-result', 'writing-setting'])
  })

  it('fails a missing record with a typed error', async () => {
    const { memory, ctx } = await setup()
    await expect(memory.update(brandString<MemoryId>('missing'), { content: 'x' }, 1))
      .rejects.toBeInstanceOf(MemoryError)
    await ctx.fiber.dispose()
  })
})
