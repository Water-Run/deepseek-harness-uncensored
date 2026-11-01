/** Carrier and interpreter fault injection preserves observable cleanup. @module */
import { MessageChannel } from 'node:worker_threads'
import { once } from 'node:events'
import { stripTypeScriptTypes } from 'node:module'
import { QuickJSContext, QuickJSRuntime, DisposableFail } from 'quickjs-emscripten-core'
import { expect, it, onTestFinished, vi } from 'vitest'
import { runPtcInterpreter } from '../src/ptc-engine.ts'
import { PTC_BOOTSTRAP } from '../src/ptc-bootstrap.ts'
import { ptcEmission } from '../src/ptc-protocol.ts'

vi.mock('node:module', async (original) => {
  const native = await original<Pick<typeof import('node:module'), 'stripTypeScriptTypes'>>()
  return { ...native, stripTypeScriptTypes: vi.fn(native.stripTypeScriptTypes) }
})

function fixture(program = 'return 7') {
  const { port1, port2 } = new MessageChannel()
  const closed = [once(port1, 'close'), once(port2, 'close')]
  onTestFinished(async () => { port1.close(); port2.close(); await Promise.all(closed) })
  const emissions: ReturnType<typeof ptcEmission.parse>[] = []
  port2.on('message', (message: unknown) => { emissions.push(ptcEmission.parse(message)) })
  const run = () => runPtcInterpreter({ program, namespaces: [],
    limits: { memoryBytes: 67108864, stackBytes: 1048576, maxMessageBytes: 4096, maxOutputBytes: 1024, maxPendingCalls: 8 },
  }, port1)
  return { port1, port2, closed, emissions, run }
}

it('releases the runtime and carrier when context creation fails', async () => {
  const h = fixture(), failure = new Error('context allocation failed')
  const create = vi.spyOn(QuickJSRuntime.prototype, 'newContext').mockImplementation(() => { throw failure })
  const dispose = vi.spyOn(QuickJSRuntime.prototype, 'dispose')
  onTestFinished(() => { create.mockRestore(); dispose.mockRestore() })
  await expect(h.run()).rejects.toBe(failure)
  await Promise.all(h.closed)
  expect(dispose).toHaveBeenCalledOnce()
})

it('reports an untyped parser rejection and closes without allocating an interpreter', async () => {
  const h = fixture()
  vi.mocked(stripTypeScriptTypes).mockImplementationOnce(() => { throw 'owned parser rejection' })
  await h.run()
  await Promise.all(h.closed)
  expect(h.emissions).toEqual([{ kind: 'done', error: { kind: 'exception', message: 'owned parser rejection' } }])
})

it('reports an untyped FFI exception and releases the partially initialized context', async () => {
  const h = fixture()
  const call = vi.spyOn(QuickJSContext.prototype, 'callFunction').mockImplementationOnce(() => { throw 'owned FFI rejection' })
  onTestFinished(() => { call.mockRestore() })
  await h.run()
  await Promise.all(h.closed)
  expect(h.emissions).toEqual([{ kind: 'done', error: { kind: 'exception', message: 'owned FFI rejection' } }])
})

it('serializes and disposes a pending-job failure before releasing its context', async () => {
  const h = fixture()
  // oxlint-disable-next-line typescript/unbound-method -- the call below supplies the original runtime receiver.
  const nativeContext = QuickJSRuntime.prototype.newContext
  let context: QuickJSContext | undefined
  const create = vi.spyOn(QuickJSRuntime.prototype, 'newContext').mockImplementation(function (this: QuickJSRuntime, options) {
    context = nativeContext.call(this, options)
    return context
  })
  const jobs = vi.spyOn(QuickJSRuntime.prototype, 'executePendingJobs').mockImplementationOnce(() => {
    if (context === undefined) throw new Error('Context must exist before executing jobs')
    const error = Object.assign(context.newError('owned job failure'), { context })
    return new DisposableFail(error, () => { throw new Error('Unexpected unwrap') })
  })
  onTestFinished(() => { create.mockRestore(); jobs.mockRestore() })
  await h.run()
  await Promise.all(h.closed)
  expect(h.emissions).toEqual([{ kind: 'done', error: { kind: 'exception', message: 'owned job failure' } }])
  expect(context?.alive).toBe(false)
})

it('still releases the context, runtime and port when removing the listener fails', async () => {
  const h = fixture(), failure = new Error('carrier listener failure')
  const detach = h.port1.removeAllListeners.bind(h.port1)
  const spy = vi.spyOn(h.port1, 'removeAllListeners').mockImplementation((event) => { detach(event); throw failure })
  const context = vi.spyOn(QuickJSContext.prototype, 'dispose')
  const runtime = vi.spyOn(QuickJSRuntime.prototype, 'dispose')
  onTestFinished(() => { spy.mockRestore(); context.mockRestore(); runtime.mockRestore() })
  await expect(h.run()).rejects.toBe(failure)
  await Promise.all(h.closed)
  expect(context).toHaveBeenCalledOnce()
  expect(runtime).toHaveBeenCalledOnce()
})

it('ignores a late reply after completion without publishing a second outcome', async () => {
  const h = fixture()
  const post = h.port1.postMessage.bind(h.port1)
  const spy = vi.spyOn(h.port1, 'postMessage').mockImplementation((input: unknown) => {
    post(input)
    queueMicrotask(() => { h.port1.emit('message', { kind: 'unknown' }) })
  })
  onTestFinished(() => { spy.mockRestore() })
  await h.run()
  await Promise.all(h.closed)
  expect(h.emissions).toEqual([{ kind: 'done', value: '{"value":7}' }])
})

it('publishes only one limit failure when a program catches and repeats output errors', async () => {
  const h = fixture('for(let i=0;i<2;i++){try{console.log("x".repeat(2000))}catch{}}return 1')
  await h.run()
  await Promise.all(h.closed)
  expect(h.emissions).toEqual([{ kind: 'done', error: { kind: 'output-limit', message: 'QuickJS output limit exceeded' } }])
})

it.each([
  ['invalid binding index', '(program,declarations,send) => send("bad","{}")'],
  ['invalid binding arguments', '(program,declarations,send) => send(0,42)'],
  ['invalid console output', '(program,declarations,send,log) => log(42)'],
] as const)('rejects malformed interpreter bridge calls: %s', async (_name, source) => {
  const h = fixture()
  // The injected factory exercises the private FFI independently of the trusted wrapper.
  // oxlint-disable-next-line typescript/unbound-method -- the call below supplies the original context receiver.
  const evaluate = QuickJSContext.prototype.evalCode
  const spy = vi.spyOn(QuickJSContext.prototype, 'evalCode').mockImplementation(function (this: QuickJSContext, code, ...args) {
    return evaluate.call(this, code === PTC_BOOTSTRAP ? source : code, ...args)
  })
  onTestFinished(() => { spy.mockRestore() })
  await h.run()
  await Promise.all(h.closed)
  expect(h.emissions).toHaveLength(1)
  expect(h.emissions[0]).toMatchObject({ kind: 'done', error: { kind: 'exception' } })
})
