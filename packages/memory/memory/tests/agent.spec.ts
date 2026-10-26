import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MemoryExtractionId } from '../src/extraction-types.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import MemoryService from '../src/index.ts'
import type { Config as MemoryConfig } from '../src/index.ts'
import * as MemoryAgent from '../src/agent.ts'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { SpendGate } from '@deepseek-ai/dsh-spend-limit/src/gate.ts'
import { SpendLedger, DEFAULT_PREFERENCES } from '@deepseek-ai/dsh-spend-limit/src/ledger.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  onRequest?: (options: GenerateOptions) => Promise<void>

  constructor(private readonly script: StreamChunk[][]) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    await this.onRequest?.(options)
    const chunks = this.script.shift()
    if (chunks === undefined) throw new Error('ScriptedAdapter: script exhausted')
    for (const chunk of chunks) yield chunk
  }
}

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function toolCallResponse(name: string, argumentsJson: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: ToolCallId('call-1'), name, arguments: argumentsJson },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

interface Harness {
  readonly ctx: Context
  readonly adapter: ScriptedAdapter
  readonly cwd: string
  agent(id: string): Promise<Agent>
}

async function harness(script: StreamChunk[][], mode = 'standard', memoryConfig: MemoryConfig = {}): Promise<Harness> {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-memory-cwd-'))
  roots.push(cwd)
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(cwd, 'storages') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(MemoryService, memoryConfig)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(MemoryAgent, { mode })
  const adapter = new ScriptedAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return {
    ctx,
    adapter,
    cwd,
    agent: id => ctx.agentLoop.create(SessionId(id), { provider: 'mock', model: 'mock' }, { cwd }),
  }
}

/** Wait for the agent's next transition to idle after a waking send. */
function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

function send(agent: Agent, text: string): void {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
}

/** Every text block the request carried. */
function requestText(request: GenerateOptions | undefined): string {
  return (request?.messages ?? [])
    .flatMap(message => message.content)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/** The memory snapshot a session logged, if any. */
function memoryMessages(agent: Agent): { text: string; entries: readonly { id: string; version: number }[] }[] {
  return agent.session.snapshotEvents().flatMap((event) => {
    if (event.type !== 'user/message' || event.data.source.kind !== 'memory-context') return []
    const source = event.data.source
    return [{
      text: event.data.content.flatMap(block => block.type === 'text' ? [block.text] : []).join(''),
      entries: source.entries.map(entry => ({ id: String(entry.id), version: entry.version })),
    }]
  })
}

describe('memory through the real loop', () => {
  it('offers a retry for an interrupted extraction without claiming a live request is running', async () => {
    const h = await harness([textResponse('了解。'), textResponse('{"memories":[]}')])
    const agent = await h.agent('automatic-interrupted')
    send(agent, '这个项目使用 pnpm')
    await agent.whenIdle()
    const state = h.ctx.sessionProjections.stateOf(agent.session, 'memoryExtraction')
    if (state === undefined) throw new Error('Missing extraction projection')
    agent.session.append('memory/extraction', { phase: 'request', requestId: brandString<MemoryExtractionId>('interrupted'),
      turn: state.turn, throughSeq: state.throughSeq, provider: 'mock', model: 'mock', maxTokens: 2048,
      scope: { global: false, mode: 'standard' }, message: createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: state.text }] }) })
    expect(h.ctx.memory.extractionStatuses()[0]?.phase).toBe('failed')
    await h.ctx.memory.retryExtraction(agent.id)
    expect(h.ctx.memory.extractionStatuses()[0]?.phase).toBe('completed')
  })

  it('aborts and drains extraction before the owning context closes', async () => {
    const h = await harness([textResponse('了解。')], 'standard', { autoExtract: true })
    const started = Promise.withResolvers<boolean>()
    const aborted = Promise.withResolvers<boolean>()
    const release = Promise.withResolvers<boolean>()
    h.adapter.onRequest = async (options) => {
      if (options.messages[0]?.source?.kind !== 'memory-extraction') return
      started.resolve(true)
      const signal = options.signal
      if (signal === undefined) throw new Error('Missing cancellation signal')
      const cancelled = () => { aborted.resolve(true) }
      signal.addEventListener('abort', cancelled, { once: true })
      try { await Promise.race([aborted.promise, release.promise]); signal.throwIfAborted() }
      finally { signal.removeEventListener('abort', cancelled) }
    }
    const agent = await h.agent('automatic-unload')
    send(agent, '这个项目使用 pnpm')
    await started.promise
    try {
      const closed = h.ctx.fiber.dispose()
      expect(await Promise.race([aborted.promise, closed.then(() => false)])).toBe(true)
      await closed
      expect(agent.session.snapshotEvents().findLast(event => event.type === 'memory/extraction')).toMatchObject({
        data: { phase: 'result', outcome: 'cancelled' },
      })
    } finally { release.resolve(true); await h.ctx.fiber.dispose() }
  })

  it('keeps raw tool results and reasoning out of the extraction transcript', async () => {
    const h = await harness([toolCallResponse('fixture_data', '{}'), [
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'REASONING_ONLY_942' } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'block-end', index: 1, block: { type: 'text', text: '已检查。' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ], textResponse('{"memories":[]}')], 'standard', { autoExtract: true })
    h.ctx.effect(() => h.ctx.tools.register(defineContentToolFixture({ name: 'fixture_data', description: '', parameters: {},
      async execute() { return [{ type: 'text', text: 'TOOL_ONLY_583' }] } })), 'extraction-test.fixture')
    const agent = await h.agent('automatic-context')
    send(agent, '这个项目使用 pnpm。请检查一下。')
    await agent.whenIdle()
    expect(h.adapter.requests).toHaveLength(3)
    const input = requestText(h.adapter.requests[2])
    expect(input).toContain('这个项目使用 pnpm。请检查一下。')
    expect(input).toContain('已检查。')
    expect(input).not.toContain('TOOL_ONLY_583')
    expect(input).not.toContain('REASONING_ONLY_942')
  })

  it('does not dispatch extraction when its request log cannot be checkpointed', async () => {
    const h = await harness([textResponse('了解。')], 'standard', { autoExtract: true })
    vi.spyOn(h.ctx.sessions, 'flush').mockImplementation(async (session) => {
      const event = session.snapshotEvents().at(-1)
      if (event?.type === 'memory/extraction' && event.data.phase === 'request') throw new Error('Storage unavailable')
      return false
    })
    const agent = await h.agent('automatic-checkpoint')
    send(agent, '这个项目使用 pnpm')
    await agent.whenIdle()
    expect(h.adapter.requests).toHaveLength(1)
    expect(h.ctx.memory.list()).toHaveLength(0)
    expect(h.ctx.memory.extractionStatuses()[0]).toMatchObject({ phase: 'failed', failure: 'storage' })
  })

  it('applies spending admission to extraction before sending an auxiliary request', async () => {
    const h = await harness([textResponse('了解。')], 'standard', { autoExtract: true })
    const ledger = await SpendLedger.open(':memory:')
    const gate = new SpendGate(ledger, [{ providers: ['mock'], models: ['mock'], input: 1, cachedInput: 1, cacheWrite: 1,
      output: 1, contextTokens: 100, maxOutputTokens: 2048, searchRequest: 0 }], 50, () => false)
    h.ctx.effect(() => () => gate.close(), 'extraction-test.spending')
    h.ctx.on('llm/stream', (request, next) => gate.stream(request, next))
    h.adapter.onRequest = async () => {
      ledger.configure({ ...DEFAULT_PREFERENCES, enabledPeriods: ['5h'], limits: { ...DEFAULT_PREFERENCES.limits, '5h': 0.000001 } })
    }
    const agent = await h.agent('automatic-quota')
    send(agent, '这个项目使用 pnpm')
    await agent.whenIdle()
    expect(h.adapter.requests).toHaveLength(1)
    expect(h.ctx.memory.list()).toHaveLength(0)
    expect(h.ctx.memory.extractionStatuses()[0]).toMatchObject({ phase: 'failed', failure: 'budget' })
    expect(ledger.snapshot().pausedSessions).toEqual([])
  })

  it('does not make auxiliary requests until automatic extraction is enabled', async () => {
    const h = await harness([textResponse('了解。')])
    const agent = await h.agent('automatic-default-off')
    send(agent, '这个项目使用 pnpm')
    await agent.whenIdle()
    expect(h.adapter.requests).toHaveLength(1)
    expect(agent.session.snapshotEvents().some(event => event.type === 'memory/extraction')).toBe(false)
  })

  it('cancels extraction with the turn and commits no late memory', async () => {
    const h = await harness([textResponse('了解。')], 'standard', { autoExtract: true })
    const started = Promise.withResolvers<boolean>()
    h.adapter.onRequest = async (options) => {
      if (options.messages[0]?.source?.kind !== 'memory-extraction') return
      const signal = options.signal
      if (signal === undefined) throw new Error('Extraction signal required')
      started.resolve(true)
      await new Promise<void>((_resolve, reject) => {
        if (signal.aborted) reject(new DOMException('Extraction cancelled', 'AbortError'))
        else signal.addEventListener('abort', () => { reject(new DOMException('Extraction cancelled', 'AbortError')) }, { once: true })
      })
    }
    const agent = await h.agent('automatic-cancel')
    send(agent, '这个项目使用 pnpm')
    await started.promise
    agent.cancel({ kind: 'user' })
    await agent.whenIdle()
    expect(h.ctx.memory.list()).toHaveLength(0)
    expect(h.ctx.memory.extractionStatuses()[0]?.phase).toBe('cancelled')
  })

  it('extracts scoped facts at turn completion and logs the exact auxiliary input', async () => {
    const result = JSON.stringify({ memories: [{ type: 'project-fact', content: '发布分支是 main', topic: '发布分支' }] })
    const h = await harness([textResponse('了解。'), textResponse(result), textResponse('main'), textResponse('{"memories":[]}')],
      'standard', { autoExtract: true })
    const first = await h.agent('automatic-a')
    send(first, '项目的发布分支是 main，请长期保留这一事实')
    await first.whenIdle()
    expect(h.ctx.memory.list()).toHaveLength(1)
    expect(h.ctx.memory.list()[0]?.scope).toEqual({ global: false, workspace: `path:${h.cwd}`, mode: 'standard' })
    const request = first.session.snapshotEvents().find(event => event.type === 'memory/extraction' && event.data.phase === 'request')
    if (request?.type !== 'memory/extraction' || request.data.phase !== 'request') throw new Error('Missing extraction request')
    expect(request.data.message).toEqual(h.adapter.requests[1]?.messages[0])
    expect(request.data.scope).toEqual(h.ctx.memory.list()[0]?.scope)
    expect(h.ctx.memory.extractionStatuses()).toEqual([{ sessionId: first.id, label: '项目的发布分支是 main，请长期保留这一事实',
      turn: 1, phase: 'completed', saved: 1 }])
    const replayed = Session.create(first.id, JSON.parse(JSON.stringify(first.session.snapshotEvents())) as SessionEvent[],
      first.session.header, first.session.inheritedEventCount)
    expect(h.ctx.sessionProjections.stateOf(replayed, 'memoryExtraction')).toMatchObject({ phase: 'completed', saved: 1 })
    const auditEvents = first.session.snapshotEvents().filter(event => event.type === 'memory/extraction').map((event, index) => ({
      type: event.type, seq: index + 3, time: 0,
      data: event.data.phase === 'request' ? { ...event.data, requestId: 'extraction-1', throughSeq: 2,
        scope: { ...event.data.scope, workspace: 'path:/workspace' },
        message: { ...event.data.message, id: 'extraction-message-1' } }
        : { ...event.data, requestId: 'extraction-1', throughSeq: 2,
          saved: event.data.saved.map((record, savedIndex) => ({ ...record, id: `memory-${savedIndex + 1}` })) },
    }))
    const expected = { finalResponse: 'Main response unchanged.', auditEvents,
      auditNotifications: auditEvents.map(event => ({ method: 'session.event', event })), assistantTexts: ['Main response unchanged.'] }
    await expect(`${JSON.stringify(expected, null, 2)}\n`).toMatchFileSnapshot(fileURLToPath(
      new URL('../../../sdk/client/tests/expected/memory-extraction-projection.json', import.meta.url)))
    const second = await h.agent('automatic-b')
    send(second, '项目发布分支是什么？')
    await second.whenIdle()
    expect(memoryMessages(second)[0]?.text).toContain('发布分支是 main')
    const requests = h.adapter.requests.length
    await h.ctx.memory.retryExtraction(second.id)
    expect(h.adapter.requests).toHaveLength(requests)
  })

  it('keeps the completed answer and existing memories after invalid extraction, then permits a retry', async () => {
    const h = await harness([textResponse('已完成。'), textResponse('not json'), textResponse('{"memories":[]}')],
      'standard', { autoExtract: true })
    await h.ctx.memory.create({ type: 'preference', content: '回答使用中文', scope: { global: false, mode: 'standard' },
      source: { kind: 'user', confirmed: true } })
    const agent = await h.agent('automatic-retry')
    send(agent, '检查项目状态')
    await agent.whenIdle()
    expect(h.ctx.memory.list()).toHaveLength(1)
    expect(h.ctx.memory.extractionStatuses()[0]).toMatchObject({ phase: 'failed', failure: 'invalid-result' })
    expect(agent.session.snapshotEvents().at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
    await h.ctx.memory.retryExtraction(agent.id)
    expect(h.ctx.memory.extractionStatuses()[0]?.phase).toBe('completed')
    expect(h.ctx.memory.list()).toHaveLength(1)
  })

  it('does not reactivate an identical disabled fact during automatic extraction', async () => {
    const fact = { type: 'project-fact' as const, content: '发布分支是 main' }
    const h = await harness([textResponse('了解。'), textResponse(JSON.stringify({ memories: [fact] }))],
      'standard', { autoExtract: true })
    const saved = await h.ctx.memory.create({ ...fact, scope: { global: false, workspace: `path:${h.cwd}`, mode: 'standard' },
      source: { kind: 'user', confirmed: true } })
    await h.ctx.memory.setStatus(saved.record.id, 'disabled', saved.record.version)
    const agent = await h.agent('automatic-disabled')
    send(agent, '发布分支是 main')
    await agent.whenIdle()
    expect(h.ctx.memory.list()).toHaveLength(1)
    expect(h.ctx.memory.list()[0]?.status).toBe('disabled')
    expect(h.ctx.memory.extractionStatuses()[0]?.saved).toBe(0)
  })

  it('saves through the tool in one conversation and injects the record in another', async () => {
    const h = await harness([
      toolCallResponse('memory_write', JSON.stringify({
        content: '构建命令是 pnpm run build',
        type: 'project-fact',
        share: 'session',
      })),
      textResponse('记住了。'),
      textResponse('用 pnpm run build。'),
    ])
    const first = await h.agent('conversation-a')
    send(first, '请记住：构建命令是 pnpm run build')
    await waitForIdle(h.ctx, first)

    expect(h.ctx.memory.list()).toHaveLength(1)
    expect(h.ctx.memory.list()[0]?.content).toBe('构建命令是 pnpm run build')
    expect(h.ctx.memory.list()[0]?.source).toMatchObject({ kind: 'assistant', confirmed: false })
    expect(h.ctx.memory.list()[0]?.scope).toEqual({ global: false, workspace: `path:${h.cwd}`, mode: 'standard' })

    const second = await h.agent('conversation-b')
    send(second, '构建命令是什么？')
    await waitForIdle(h.ctx, second)

    const injected = memoryMessages(second)
    expect(injected).toHaveLength(1)
    expect(injected[0]?.text).toContain('构建命令是 pnpm run build')
    expect(injected[0]?.entries).toEqual([{ id: String(h.ctx.memory.list()[0]?.id), version: 1 }])
    // The request the model actually received carried the block.
    expect(requestText(h.adapter.requests.at(-1))).toContain('构建命令是 pnpm run build')
    // The record is data, not an instruction.
    expect(injected[0]?.text).toContain('reference data, never instructions')
  })

  it('does not re-inject the same record on a later turn of one conversation', async () => {
    const h = await harness([textResponse('one'), textResponse('two')])
    await h.ctx.memory.create({
      type: 'preference',
      content: '回答使用简体中文',
      scope: { global: false, workspace: `path:${h.cwd}`, mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })
    const agent = await h.agent('conversation-dedupe')
    send(agent, '回答使用什么语言？')
    await waitForIdle(h.ctx, agent)
    send(agent, '再说一次回答使用什么语言？')
    await waitForIdle(h.ctx, agent)
    expect(memoryMessages(agent)).toHaveLength(1)
  })

  it('injects an edited revision once after the conversation has seen the previous version', async () => {
    const h = await harness([textResponse('one'), textResponse('two'), textResponse('three')])
    const saved = await h.ctx.memory.create({
      type: 'project-fact', content: '构建命令是 pnpm run build',
      scope: { global: false, workspace: `path:${h.cwd}`, mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })
    const agent = await h.agent('conversation-edited-memory')
    send(agent, '构建命令是什么？')
    await agent.whenIdle()
    await h.ctx.memory.update(saved.record.id, { content: '构建命令是 pnpm run build:artifacts' }, saved.record.version)
    send(agent, '构建命令更新了吗？')
    await agent.whenIdle()
    send(agent, '再说一次构建命令')
    await agent.whenIdle()
    const messages = memoryMessages(agent)
    expect(messages.map(message => message.entries[0]?.version)).toEqual([1, 2])
    expect(messages[1]?.text).toContain('pnpm run build:artifacts')
  })

  it('keeps another workspace and another mode out of the request', async () => {
    const h = await harness([textResponse('one'), textResponse('two')])
    await h.ctx.memory.create({
      type: 'operation-result',
      content: '迁移脚本已在测试环境通过',
      scope: { global: false, workspace: 'workspace:elsewhere', mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })
    const agent = await h.agent('conversation-other')
    send(agent, '迁移脚本通过了吗？')
    await waitForIdle(h.ctx, agent)
    expect(memoryMessages(agent)).toHaveLength(0)
  })

  it('keeps tool-created memory inside an unregistered project directory', async () => {
    const h = await harness([
      toolCallResponse('memory_write', JSON.stringify({ type: 'project-fact', content: '构建命令是 pnpm run build' })),
      textResponse('saved'), textResponse('unknown'),
    ])
    const first = await h.agent('unregistered-a')
    send(first, '记住构建命令是 pnpm run build')
    await first.whenIdle()
    const second = await h.ctx.agentLoop.create(SessionId('unregistered-b'), { provider: 'mock', model: 'mock' }, { cwd: join(h.cwd, 'other') })
    send(second, '构建命令是什么？')
    await second.whenIdle()
    expect(memoryMessages(second)).toHaveLength(0)
  })

  it('stops injecting a record once it is deleted', async () => {
    const h = await harness([textResponse('one'), textResponse('two')])
    const created = await h.ctx.memory.create({
      type: 'project-fact',
      content: '发布分支是 main',
      scope: { global: false, workspace: `path:${h.cwd}`, mode: 'standard' },
      source: { kind: 'user', confirmed: true },
    })
    const first = await h.agent('conversation-delete-1')
    send(first, '发布分支是哪个？')
    await waitForIdle(h.ctx, first)
    expect(memoryMessages(first)).toHaveLength(1)

    await h.ctx.memory.remove(created.record.id)
    const second = await h.agent('conversation-delete-2')
    send(second, '发布分支是哪个？')
    await waitForIdle(h.ctx, second)
    expect(memoryMessages(second)).toHaveLength(0)
    // The first conversation keeps the record it already received; history is
    // never rewritten to pretend the deletion also retracted it.
    expect(memoryMessages(first)).toHaveLength(1)
  })

  it('records what the model received in the Session log', async () => {
    const h = await harness([textResponse('one')])
    await h.ctx.memory.create({
      type: 'writing-setting',
      content: '主角的名字是沈迟',
      scope: { global: true },
      source: { kind: 'user', confirmed: true },
    })
    const agent = await h.agent('conversation-log')
    send(agent, '主角叫什么名字？')
    await waitForIdle(h.ctx, agent)
    const event = agent.session.snapshotEvents().find(
      candidate => candidate.type === 'user/message' && candidate.data.source.kind === 'memory-context',
    )
    expect(event).toBeDefined()
    if (event?.type !== 'user/message' || event.data.source.kind !== 'memory-context') {
      throw new Error('missing memory context event')
    }
    expect(event.data.source.sections[0]?.text).toBe(event.data.content[0]?.type === 'text'
      ? event.data.content[0].text
      : undefined)
    expect(event.surfaceOp).toBe('append')
  })
})
