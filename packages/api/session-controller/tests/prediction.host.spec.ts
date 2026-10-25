import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { readFile } from 'node:fs/promises'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { predictionContext, predictionInstruction, predictionSurface, PredictionRequests, requestPrediction } from '../src/prediction.ts'
import { sideIdentity } from '../src/aside-context.ts'

const parent = SessionId('parent')
const side = sideIdentity(parent)
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function fixture() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(parent)
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Main request' }] }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  return { session, surface: 'main' as const, draft: 'Please', revision: 7, context: 'completed context',
    provider: 'fixture', model: 'fixture', signal: new AbortController().signal, maxTokens: 128, maxSuggestionBytes: 1024 }
}

it('uses a different instruction for the main composer, a side question, and a by-the-way question', () => {
  expect(predictionSurface(parent, undefined, '继续写')).toBe('main')
  expect(predictionSurface(side, parent, '这个结论')).toBe('side')
  expect(predictionSurface(parent, undefined, '/btw ')).toBe('btw')
  expect(predictionInstruction('btw')).toContain('进度如何')
  expect(predictionInstruction('main')).not.toContain('进度如何')
  expect(predictionSurface(parent, undefined, '/btwhatever')).toBe('main')
  expect(predictionContext('btw', [], parent, 'running', 8192)).toBe('Interaction status: running')
  expect(predictionContext('side', [], parent, 'idle', 8192)).not.toContain('Interaction status')
})

it('logs the exact request and result while preserving the joining space of an English suffix', async () => {
  const input = await fixture()
  const requests: GenerateOptions[] = []
  const suggestion = await requestPrediction({ ...input, stream: async function* (options) {
    requests.push(options)
    expect(input.session.snapshotEvents().at(-1)?.type).toBe('input/prediction')
    yield { type: 'text-delta', index: 0, text: ' continue\nextra line' }
    yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } })
  expect(suggestion).toBe(' continue')
  const records = input.session.snapshotEvents().filter(event => event.type === 'input/prediction').map(event => event.data)
  expect(records).toHaveLength(2)
  expect(records[0]?.request).toMatchObject({ provider: 'fixture', model: 'fixture', maxTokens: 128, message: requests[0]?.messages[0] })
  expect(records[1]).toMatchObject({ phase: 'result', outcome: 'completed', suggestion: ' continue', requestId: records[0]?.requestId })
  expect(input.session.snapshotEvents().filter(event => event.type === 'user/message')).toHaveLength(1)
  const normalized = input.session.snapshotEvents().filter(event => event.type === 'input/prediction').map(event => ({
    ...event, time: 0, data: { ...event.data, requestId: 'prediction-1', ...event.data.request === undefined ? {} : {
      request: { ...event.data.request, message: { ...event.data.request.message, id: 'prediction-message-1' } },
    } },
  }))
  const expected = JSON.parse(await readFile(new URL('../../../sdk/client/tests/expected/input-prediction-projection.json', import.meta.url), 'utf8')) as { auditEvents: object[] }
  expect(normalized).toEqual(expected.auditEvents)
})

it.each([
  ['配色可以', '配色可以更柔和吗？', '更柔和吗？'],
  ['Please', 'Please continue', ' continue'],
  ['/btw ', '/btw 进展如何？', '进展如何？'],
])('does not duplicate the draft %s when the model returns a full completion', async (draft, response, expected) => {
  const input = await fixture()
  const suggestion = await requestPrediction({ ...input, draft, stream: async function* () {
    yield { type: 'text-delta', index: 0, text: response }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } })
  expect(suggestion).toBe(expected)
  expect(input.session.snapshotEvents().at(-1)?.data).toMatchObject({ suggestion: expected })
})

it.each(['error', 'missing-finish', 'oversized'] as const)('logs and rejects %s prediction output without keeping partial suggestions', async (failure) => {
  const input = await fixture()
  const stream = async function* (): AsyncGenerator<StreamChunk> {
    yield { type: 'text-delta', index: 0, text: failure === 'oversized' ? 'x'.repeat(1025) : ' partial' }
    if (failure === 'error') yield { type: 'finish', reason: { kind: 'error', failure: { code: 'OFFLINE', message: 'offline' } } }
  }
  await expect(requestPrediction({ ...input, stream })).rejects.toThrow()
  expect(input.session.snapshotEvents().at(-1)?.data).toMatchObject({ phase: 'result', outcome: 'failed', suggestion: '' })
})

it('cancels and drains a background request before its Session can be removed', async () => {
  const input = await fixture()
  const requests = new PredictionRequests()
  const entered = Promise.withResolvers<undefined>()
  let started = false
  const operation = requests.run(parent, input.signal, signal => requestPrediction({ ...input, signal, stream: async function* () {
    started = true; entered.resolve(undefined)
    await new Promise<void>((_resolve, reject) => { signal.addEventListener('abort', () => { reject(new DOMException('Prediction cancelled', 'AbortError')) }, { once: true }) })
    yield { type: 'finish', reason: { kind: 'stop' } }
  } }))
  const rejected = expect(operation).rejects.toThrow()
  try {
    await vi.waitFor(() => { expect(started).toBe(true) })
    await entered.promise
    await requests.stop(parent)
    await rejected
    expect(input.session.snapshotEvents().at(-1)?.data).toMatchObject({ phase: 'result', outcome: 'cancelled', suggestion: '' })
    await requests.close()
    await expect(requests.run(parent, input.signal, async () => '')).rejects.toThrow('stopping')
  } finally { await requests.close() }
})
