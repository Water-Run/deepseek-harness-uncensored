import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SpendGate } from '../src/gate.ts'
import { SpendLedger, DEFAULT_PREFERENCES } from '../src/ledger.ts'
import { DEFAULT_RATES, reserveCost, usageCost } from '../src/pricing.ts'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

const gates: SpendGate[] = []
afterEach(async () => { await Promise.all(gates.splice(0).map(gate => gate.close())) })
async function setup() {
  const ledger = await SpendLedger.open(':memory:')
  ledger.configure({ ...DEFAULT_PREFERENCES, enabled: true, autoResume: true })
  const gate = new SpendGate(ledger, DEFAULT_RATES, 1, () => true)
  gates.push(gate)
  return gate
}
function request(signal?: AbortSignal): GenerateOptions { return { provider: 'deepseek-official', model: 'deepseek-flash', messages: [], maxTokens: 100, ...signal === undefined ? {} : { signal } } }
async function consume(stream: AsyncIterable<StreamChunk>) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}
async function* success(): AsyncGenerator<StreamChunk> {
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 200, reasoningTokens: 10 } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

it('settles before releasing the terminal chunk and does not double-count reasoning or cumulative usage', async () => {
  const gate = await setup()
  const stream = gate.stream(request(), success)
  expect((await stream.next()).value?.type).toBe('usage')
  expect(gate.ledger.snapshot().pending).toBe(1)
  expect((await stream.next()).value?.type).toBe('finish')
  expect(gate.ledger.snapshot().windows[0]).toMatchObject({ reserved: 0, spent: 0.000288 })
  await stream.next()
})

it('keeps the reservation on missing usage, failures, and early consumer return', async () => {
  const gate = await setup()
  async function* broken(): AsyncGenerator<StreamChunk> { yield { type: 'finish', reason: { kind: 'error', failure: { code: 'OFFLINE', message: 'offline' } } } }
  await consume(gate.stream(request(), broken))
  expect(gate.ledger.snapshot().windows[0]?.uncertain).toBe(2.0008)
  const stream = gate.stream(request(), success)
  await stream.next()
  await stream.return(undefined)
  expect(gate.ledger.snapshot().windows[0]?.uncertain).toBe(4.0016)
})

it('cancels an exhausted wait without dispatching a provider request', async () => {
  const gate = await setup()
  const admitted = gate.ledger.reserve(4000000)
  if (admitted.kind !== 'reserved') throw new Error(admitted.kind)
  const controller = new AbortController()
  const send = vi.fn(success)
  const pending = consume(gate.stream(request(controller.signal), send))
  const rejected = expect(pending).rejects.toThrow()
  expect(gate.waiting).toBe(1)
  controller.abort()
  await rejected
  expect(send).not.toHaveBeenCalled()
  expect(gate.ledger.snapshot().pending).toBe(1)
  gate.ledger.settle(admitted.id, 0)
})

it('automatically admits after an in-flight reservation settles', async () => {
  const gate = await setup()
  const admitted = gate.ledger.reserve(4000000)
  if (admitted.kind !== 'reserved') throw new Error(admitted.kind)
  const send = vi.fn(success)
  const pending = consume(gate.stream(request(), send))
  expect(gate.waiting).toBe(1)
  expect(send).not.toHaveBeenCalled()
  gate.ledger.settle(admitted.id, 0)
  await pending
  expect(send).toHaveBeenCalledOnce()
})

it('rejects unknown rates while enabled and leaves disabled model calls unchanged', async () => {
  const gate = await setup()
  const send = vi.fn(success)
  await expect(consume(gate.stream({ ...request(), model: 'unknown' }, send))).rejects.toMatchObject({ code: 'SPEND_RATE_UNKNOWN' })
  expect(send).not.toHaveBeenCalled()
  gate.ledger.configure(DEFAULT_PREFERENCES)
  await consume(gate.stream({ ...request(), model: 'unknown' }, send))
  expect(send).toHaveBeenCalledOnce()
})

it('uses the same ledger for native search and ordinary conversation', async () => {
  const gate = await setup()
  const value = await gate.call({ provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 100, searches: 5 }, async () => ({ value: 'result', usage: { inputTokens: 100, outputTokens: 10 }, searches: 2 }))
  expect(value).toBe('result')
  expect(gate.ledger.snapshot().windows[0]?.spent).toBe(0.01028)
  await consume(gate.stream(request(), success))
  expect(gate.ledger.snapshot().windows[0]?.spent).toBe(0.010568)
})

it('disposal cancels waiting calls and drains an already-dispatched request', async () => {
  const gate = await setup()
  const started = Promise.withResolvers<undefined>()
  const finish = Promise.withResolvers<undefined>()
  const running = gate.call({ provider: 'deepseek-official', model: 'deepseek-flash', maxTokens: 100, searches: 0 }, async () => { started.resolve(undefined); await finish.promise; return { value: true } })
  await started.promise
  let closed = false
  const closing = gate.close().then(() => { closed = true })
  await Promise.resolve()
  expect(closed).toBe(false)
  finish.resolve(undefined)
  expect(await running).toBe(true)
  await closing
  expect(closed).toBe(true)
})

it('clears a cancelled conversation and blocks it when the process shuts down', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-spending-gate-'))
  const path = join(directory, 'budget.sqlite')
  const ledger = await SpendLedger.open(path)
  ledger.configure({ ...DEFAULT_PREFERENCES, enabled: true, autoResume: true })
  const gate = new SpendGate(ledger, DEFAULT_RATES, 1, () => true)
  const sessionId = brandString<SessionId>('paused-conversation')
  try {
    const admitted = ledger.reserve(4_000_000)
    if (admitted.kind !== 'reserved') throw new Error(admitted.kind)
    const controller = new AbortController()
    const send = vi.fn(success)
    const cancelled = consume(gate.stream(markAgentLoopRequest({ ...request(controller.signal), sessionId }), send))
    await vi.waitFor(() => { expect(ledger.snapshot().pausedSessions).toEqual([{ sessionId, state: 'waiting' }]) })
    controller.abort()
    await expect(cancelled).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    expect(ledger.snapshot().pausedSessions).toEqual([])
    ledger.settle(admitted.id, 0)
    const held = ledger.reserve(4_000_000)
    if (held.kind !== 'reserved') throw new Error(held.kind)
    const stopping = consume(gate.stream(markAgentLoopRequest({ ...request(), sessionId }), vi.fn(success)))
    await vi.waitFor(() => { expect(ledger.snapshot().pausedSessions).toEqual([{ sessionId, state: 'waiting' }]) })
    const rejected = expect(stopping).rejects.toThrow()
    await expect(gate.close()).resolves.toBeUndefined()
    await rejected
    const restored = await SpendLedger.open(path)
    expect(restored.snapshot().pausedSessions).toEqual([{ sessionId, state: 'blocked' }])
    restored.close()
  } finally {
    await gate.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('never turns an auxiliary model request into a resumable conversation', async () => {
  const gate = await setup()
  const held = gate.ledger.reserve(4_000_000)
  if (held.kind !== 'reserved') throw new Error(held.kind)
  const abort = new AbortController()
  const pending = consume(gate.stream({ ...request(abort.signal), sessionId: brandString<SessionId>('draft-only') }, success))
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() => { expect(gate.waiting).toBe(1) })
  expect(gate.ledger.snapshot().pausedSessions).toEqual([])
  abort.abort({ kind: 'disposed' })
  await rejected
  expect(gate.ledger.snapshot().pausedSessions).toEqual([])
})

it('preserves an actual admission wait when its Agent is disposed before the gate', async () => {
  const gate = await setup()
  const held = gate.ledger.reserve(4_000_000)
  if (held.kind !== 'reserved') throw new Error(held.kind)
  const abort = new AbortController()
  const sessionId = brandString<SessionId>('paused-agent')
  const pending = consume(gate.stream(markAgentLoopRequest({ ...request(abort.signal), sessionId }), success))
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() => { expect(gate.ledger.snapshot().pausedSessions).toEqual([{ sessionId, state: 'waiting' }]) })
  abort.abort({ kind: 'disposed' })
  await rejected
  expect(gate.ledger.snapshot().pausedSessions).toEqual([{ sessionId, state: 'blocked' }])
})

it('keeps an unowned runtime out of automatic conversation recovery', async () => {
  const ledger = await SpendLedger.open(':memory:')
  ledger.configure({ ...DEFAULT_PREFERENCES, enabled: true })
  const gate = new SpendGate(ledger, DEFAULT_RATES, 1, () => false)
  gates.push(gate)
  const held = ledger.reserve(4_000_000)
  if (held.kind !== 'reserved') throw new Error(held.kind)
  const abort = new AbortController()
  const pending = consume(gate.stream(markAgentLoopRequest({ ...request(abort.signal), sessionId: brandString<SessionId>('foreign-agent') }), success))
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() => { expect(gate.waiting).toBe(1) })
  expect(ledger.snapshot().pausedSessions).toEqual([])
  abort.abort({ kind: 'disposed' })
  await rejected
  expect(ledger.snapshot().pausedSessions).toEqual([])
})

it('prices a full-context reservation and disjoint cached counters', () => {
  const rate = DEFAULT_RATES[0]
  if (rate === undefined) throw new Error('missing default')
  expect(reserveCost(rate, 256000)).toBe(4048000)
  expect(usageCost(rate, { inputTokens: 10, outputTokens: 20, cacheReadTokens: 100, cacheWriteTokens: 30, reasoningTokens: 10 })).toBe(244)
})
