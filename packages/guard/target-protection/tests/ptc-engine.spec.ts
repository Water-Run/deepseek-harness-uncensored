/** Interpreter cleanup and wire refusal using exclusive real message channels. @module */
import { MessageChannel } from 'node:worker_threads'
import { once } from 'node:events'
import { expect, it, onTestFinished, vi } from 'vitest'
import { QuickJSContext, QuickJSRuntime } from 'quickjs-emscripten-core'
import { ptcEmission } from '../src/ptc-protocol.ts'
import type { PtcBoot } from '../src/ptc-protocol.ts'
import { runPtcInterpreter } from '../src/ptc-engine.ts'

async function evaluate(program: string, options: {
  limits?: Partial<PtcBoot['limits']>
  namespaces?: PtcBoot['namespaces']
  reply?: (id: number) => unknown
  acknowledge?: (id: number) => unknown
} = {}) {
  const { port1, port2 } = new MessageChannel()
  const closed = [once(port1, 'close'), once(port2, 'close')]
  onTestFinished(async () => { port1.close(); port2.close(); await Promise.all(closed) })
  const outcome = Promise.withResolvers<ReturnType<typeof ptcEmission.parse>>()
  const logs: string[] = []
  port2.on('message', (input: unknown) => {
    const message = ptcEmission.parse(input)
    if (message.kind === 'done') outcome.resolve(message)
    else if (message.kind === 'call') port2.postMessage(options.reply?.(message.id) ?? { kind: 'reply', id: message.id, ok: true, text: '42' })
    else if (message.kind === 'log') {
      logs.push(message.text)
      port2.postMessage(options.acknowledge?.(message.id) ?? { kind: 'log-received', id: message.id })
    }
  })
  const running = runPtcInterpreter({ program,
    namespaces: options.namespaces
      ?? [{ global: 'tools', members: ['work'],
        errorClass: { name: 'ToolCallError', memberNameProperty: 'member' } }],
    limits: { memoryBytes: 67108864, stackBytes: 1048576, maxMessageBytes: 4096,
      maxOutputBytes: 65536, maxPendingCalls: 8, ...options.limits },
  }, port1)
  const result = await Promise.race([outcome.promise, running.then(() => outcome.promise)])
  await running
  return { result, logs }
}

it('disposes interpreter handles after typed async computation and console output', async () => {
  const outcome = await evaluate('const value: number = await tools.work({});console.log("value",value);return value+1;')
  expect(outcome).toEqual({ logs: ['value 42'], result: { kind: 'done', value: '{"value":43}' } })
})

it('rejects final delivery failure and closes the carrier and interpreter resources', async () => {
  const { port1, port2 } = new MessageChannel()
  const closed = [once(port1, 'close'), once(port2, 'close')]
  onTestFinished(async () => { port1.close(); port2.close(); await Promise.all(closed) })
  const fault = new Error('owned delivery failure')
  const post = vi.spyOn(port1, 'postMessage').mockImplementation(() => { throw fault })
  const contextDisposed = vi.spyOn(QuickJSContext.prototype, 'dispose')
  const runtimeDisposed = vi.spyOn(QuickJSRuntime.prototype, 'dispose')
  onTestFinished(() => { post.mockRestore(); contextDisposed.mockRestore(); runtimeDisposed.mockRestore() })
  await expect(runPtcInterpreter({ program: 'return 42', namespaces: [],
    limits: { memoryBytes: 67108864, stackBytes: 1048576, maxMessageBytes: 4096, maxOutputBytes: 65536, maxPendingCalls: 8 },
  }, port1)).rejects.toBe(fault)
  await Promise.all(closed)
  expect(contextDisposed).toHaveBeenCalledOnce()
  expect(runtimeDisposed).toHaveBeenCalledOnce()
})

it('supports no bindings and completion without a value', async () => {
  expect((await evaluate('return undefined;', { namespaces: [] })).result).toEqual({ kind: 'done', value: '{}' })
})

it('releases acknowledged console capacity while async work is pending', async () => {
  const outcome = await evaluate('console.log("first");await tools.work({});console.log("second");await tools.work({});return 7')
  expect(outcome.logs).toEqual(['first', 'second'])
  expect(outcome.result).toEqual({ kind: 'done', value: '{"value":7}' })
})

it('refuses an unknown console acknowledgement instead of accepting more queued output', async () => {
  const outcome = await evaluate('console.log("first");await tools.work({});return 7', {
    acknowledge: id => ({ kind: 'log-received', id: id + 1 }),
  })
  expect(outcome.result).toMatchObject({ error: { kind: 'protocol', message: 'Unknown console acknowledgement' } })
})

it.each(['enum Flag {One};return Flag.One;', 'const =;'])('rejects parsing before interpreter allocation: %s', async (program) => {
  expect((await evaluate(program)).result).toMatchObject({ kind: 'done', error: { kind: 'exception' } })
})

it.each(['throw new Error("owned failure");', 'throw "owned failure";', 'throw 7;', 'throw null;', 'throw {};'])('serializes program rejection safely: %s', async (program) => {
  expect((await evaluate(program)).result).toMatchObject({ kind: 'done', error: { kind: 'exception' } })
})

it.each(['return NaN;', 'return -0;', 'return {x:undefined};', 'return [,,];', 'return new Date();',
  'return {get x(){return 1}};', 'const x={};x.self=x;return x;', 'const x={};x[Symbol("x")]=1;return x;'])('rejects invalid completion and releases handles: %s', async (program) => {
  expect((await evaluate(program)).result).toMatchObject({ error: { kind: 'invalid-output' } })
})

it('materializes binding failures without a declared rejection subclass', async () => {
  const outcome = await evaluate('try {await tools.work({})}catch(e){return {message:e.message,typed:e instanceof Error}}', {
    namespaces: [{ global: 'tools', members: ['work'] }],
    reply: id => ({ kind: 'reply', id, ok: false, text: 'owned failure' }),
  })
  expect(outcome.result).toEqual({ kind: 'done', value: '{"value":{"message":"owned failure","typed":true}}' })
})

it.each([
  (id: number) => ({ kind: 'reply', id: id + 1, ok: true, text: 'null' }),
  (id: number) => ({ kind: 'reply', id, ok: true, text: 'x'.repeat(4097) }),
  () => ({ kind: 'unknown' }),
])('refuses invalid Host reply %s and releases outstanding promises', async (reply) => {
  const outcome = await evaluate('return await tools.work({})', { reply })
  expect(outcome.result).toMatchObject({ error: { kind: 'protocol' } })
})

it('refuses a binding value whose bytes do not form JSON', async () => {
  expect((await evaluate('return await tools.work({})', { reply: id => ({ kind: 'reply', id, ok: true, text: '{' }) })).result)
    .toMatchObject({ error: { kind: 'exception' } })
})

it('bounds serialized console output', async () => {
  expect((await evaluate('console.log("x".repeat(4096))', { limits: { maxOutputBytes: 1024 } })).result)
    .toMatchObject({ error: { kind: 'output-limit' } })
})

it('bounds queued console traffic independently of text output', async () => {
  expect((await evaluate('for(let i=0;i<1000;i++)console.log("")', { limits: { maxMessageBytes: 1024 } })).result)
    .toMatchObject({ error: { kind: 'output-limit', message: 'QuickJS console backlog exceeded' } })
})

it('bounds completion and program arguments', async () => {
  expect((await evaluate('return "x".repeat(4096)', { limits: { maxOutputBytes: 1024 } })).result)
    .toMatchObject({ error: { kind: 'output-limit' } })
  expect((await evaluate('return await tools.work({text:"x".repeat(4096)})', { limits: { maxMessageBytes: 1024 } })).result)
    .toMatchObject({ error: { kind: 'exception' } })
})

it('bounds outstanding interpreter promises', async () => {
  const outcome = await evaluate('return await Promise.all([tools.work({}),tools.work({})])', { limits: { maxPendingCalls: 1 } })
  expect(outcome.result).toMatchObject({ error: { kind: 'exception' } })
})
