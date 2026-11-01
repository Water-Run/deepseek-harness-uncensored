/** Host protocol refusal and Worker completion with native threads and controlled emissions. @module */
import { Context } from '@deepseek-ai/cordis'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import type { PtcRunRequest } from '@deepseek-ai/dsh-ptc-runtime'
import { Worker } from 'node:worker_threads'
import { expect, it, onTestFinished, vi } from 'vitest'
import Protection from '../src/index.ts'
import TargetPtcRuntime, { ptcWorkerEntry, type PtcConfig } from '../src/ptc.ts'

async function harness(config: PtcConfig = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: process.cwd() })
  const protection = await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  const owner = await ctx.plugin(TargetPtcRuntime, config)
  const runtime = ctx.ptcRuntime
  const run = (request: Partial<PtcRunRequest> = {}) => runtime.run(runtime.resolve({
    program: 'await new Promise(()=>{})', bindings: [], ...request,
  }))
  return { ctx, owner, protection, runtime, run }
}

function captureWorker() {
  const created = Promise.withResolvers<Worker>()
  // oxlint-disable-next-line typescript/unbound-method -- every call below restores the original Worker receiver.
  const original = Worker.prototype.once
  const spy = vi.spyOn(Worker.prototype, 'once').mockImplementation(function (this: Worker, event, listener) {
    const result = original.call(this, event, listener)
    if (event === 'exit') created.resolve(this)
    return result
  })
  onTestFinished(() => { spy.mockRestore() })
  return created.promise
}

it('selects source and compiled Worker locations without falling back to a source file in artifacts', () => {
  const source = ptcWorkerEntry('file:///owned/provider/ptc.ts')
  expect(decodeURIComponent(source.pathname)).toContain('file:///owned/provider/worker.ts')
  expect(ptcWorkerEntry('file:///owned/lib/ptc.js').href).toBe('file:///owned/lib/worker.js')
})

it.each([
  { kind: 'received', id: 1 },
  { kind: 'log', id: 2, text: 'unordered' },
  { kind: 'call', id: 1, index: 0, args: '{}' },
  { kind: 'done', value: 'null' },
  { kind: 'done', value: '-0' },
  { kind: 'unknown' },
])('refuses invalid Worker emissions before executing undeclared capabilities: %j', async (message) => {
  const h = await harness(), worker = captureWorker()
  const running = h.run()
  const native = await worker
  native.emit('message', message)
  expect(await running).toMatchObject({ error: { kind: 'protocol' } })
  expect(native.threadId).toBe(-1)
})

it.each([
  { kind: 'log', id: 1, text: 'x'.repeat(1024) },
  { kind: 'done' },
  { kind: 'done', value: JSON.stringify({ value: 'x'.repeat(1024) }) },
])('bounds malformed or oversized completion and console output: %j', async (message) => {
  const h = await harness({ maxOutputBytes: 1024 }), worker = captureWorker()
  const running = h.run()
  const native = await worker
  native.emit('message', message)
  expect(await running).toMatchObject({ error: { kind: 'output-limit' } })
  expect(native.threadId).toBe(-1)
})

it('bounds the final JSON envelope including escaping overhead', async () => {
  const h = await harness({ maxOutputBytes: 1024 }), worker = captureWorker()
  const running = h.run()
  const native = await worker
  native.emit('message', { kind: 'done', error: { kind: 'exception', message: '\0'.repeat(256) } })
  expect(await running).toMatchObject({ error: { kind: 'output-limit' } })
})

it('holds Worker capacity through termination and rejects pre-cancelled requests before allocation', async () => {
  const h = await harness({ maxWorkers: 1 }), worker = captureWorker()
  const abort = new AbortController()
  abort.abort()
  expect(await h.run({ signal: abort.signal })).toMatchObject({ error: { kind: 'abort' } })
  const running = h.run()
  const native = await worker
  expect(await h.run()).toMatchObject({ error: { kind: 'worker-exit' } })
  native.emit('message', { kind: 'done', value: '{}' })
  expect(await running).toEqual({ logs: [] })
  expect(native.threadId).toBe(-1)
})

it('cancels active programs before provider withdrawal finishes and refuses retained references', async () => {
  const h = await harness(), worker = captureWorker()
  const spec = h.runtime.resolve({ program: 'return 1', bindings: [] })
  const running = h.run()
  const native = await worker
  await h.owner.dispose()
  expect(await running).toMatchObject({ error: { kind: 'abort' } })
  expect(native.threadId).toBe(-1)
  expect(() => h.runtime.resolve({ program: 'return 1', bindings: [] })).toThrow('disposal')
  await expect(h.runtime.run(spec)).rejects.toThrow('disposal')
})

it('validates program size and absolute directories before starting a Worker', async () => {
  const h = await harness({ maxProgramBytes: 1024 })
  expect(() => h.runtime.resolve({ program: ' '.repeat(1025), bindings: [] })).toThrow('program size')
  expect(() => h.runtime.resolve({ program: '', bindings: [], cwd: 'relative' })).toThrow('absolute')
})

it('acknowledges only delivered replies and releases their queue budget', async () => {
  const h = await harness({ maxMessageBytes: 1024 }), worker = captureWorker()
  const sent: PromiseWithResolvers<void> = Promise.withResolvers()
  const work = vi.fn(async () => 'x'.repeat(700))
  const running = h.run({ bindings: [{ global: 'tools', functions: { work } }] })
  const native = await worker
  const post = vi.spyOn(native, 'postMessage').mockImplementation(() => { sent.resolve() })
  onTestFinished(() => { post.mockRestore() })
  native.emit('message', { kind: 'call', id: 1, index: 0, args: '{}' })
  await sent.promise
  expect(post).toHaveBeenCalledWith({ kind: 'reply', id: 1, ok: true, text: JSON.stringify('x'.repeat(700)) })
  native.emit('message', { kind: 'received', id: 1 })
  native.emit('message', { kind: 'done', value: '{"value":42}' })
  expect(await running).toEqual({ logs: [], value: 42 })
  expect(work).toHaveBeenCalledOnce()
})

it('bounds aggregate unacknowledged replies even when each reply fits', async () => {
  const h = await harness({ maxMessageBytes: 1024 }), worker = captureWorker()
  const running = h.run({ bindings: [{ global: 'tools', functions: { work: async () => 'x'.repeat(700) } }] })
  const native = await worker
  const post = vi.spyOn(native, 'postMessage').mockImplementation(() => {})
  onTestFinished(() => { post.mockRestore() })
  native.emit('message', { kind: 'call', id: 1, index: 0, args: '{}' })
  native.emit('message', { kind: 'call', id: 2, index: 0, args: '{}' })
  expect(await running).toMatchObject({ error: { kind: 'protocol', message: 'Queued binding replies exceeded the message budget' } })
  expect(post).toHaveBeenCalledOnce()
})

it.each([async () => NaN, async () => 'x'.repeat(2048), async () => { throw 'owned rejection' }])(
  'delivers bounded binding rejections without sending lossy or oversized values', async (work) => {
    const h = await harness({ maxMessageBytes: 1024 }), worker = captureWorker()
    const sent: PromiseWithResolvers<void> = Promise.withResolvers()
    const running = h.run({ bindings: [{ global: 'tools', functions: { work } }] })
    const native = await worker
    const post = vi.spyOn(native, 'postMessage').mockImplementation(() => { sent.resolve() })
    onTestFinished(() => { post.mockRestore() })
    native.emit('message', { kind: 'call', id: 1, index: 0, args: '{}' })
    await sent.promise
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reply', id: 1, ok: false }))
    native.emit('message', { kind: 'done', value: '{}' })
    expect(await running).toEqual({ logs: [] })
  },
)

it.each([false, true])('contains reply delivery failure after terminal outcome=%s', async (finishFirst) => {
  const h = await harness(), worker = captureWorker()
  const running = h.run({ bindings: [{ global: 'tools', functions: { work: async () => null } }] })
  const native = await worker
  const post = vi.spyOn(native, 'postMessage').mockImplementation(() => {
    if (finishFirst) native.emit('message', { kind: 'done', value: '{}' })
    throw new Error('owned delivery failure')
  })
  onTestFinished(() => { post.mockRestore() })
  native.emit('message', { kind: 'call', id: 1, index: 0, args: '{}' })
  expect(await running).toMatchObject(finishFirst ? { logs: [] } : { error: { kind: 'protocol' } })
  native.emit('message', { kind: 'unknown' })
  expect(native.threadId).toBe(-1)
})

it('reports Worker errors without accepting a late successful completion', async () => {
  const h = await harness(), worker = captureWorker()
  const running = h.run()
  const native = await worker
  native.emit('error', new Error('owned Worker error'))
  native.emit('message', { kind: 'done', value: '{"value":1}' })
  expect(await running).toMatchObject({ error: { kind: 'worker-exit', message: 'owned Worker error' } })
  expect(native.threadId).toBe(-1)
})

it('contains an untyped console acknowledgement transport failure', async () => {
  const h = await harness(), worker = captureWorker()
  const running = h.run()
  const native = await worker
  const post = vi.spyOn(native, 'postMessage').mockImplementation(() => { throw 'owned transport failure' })
  onTestFinished(() => { post.mockRestore() })
  native.emit('message', { kind: 'log', id: 1, text: 'ready' })
  expect(await running).toMatchObject({ error: { kind: 'protocol', message: 'Invalid interpreter message' } })
})

it('retains protection after unconfirmed shutdown until the real Worker exits', async () => {
  const h = await harness(), worker = captureWorker()
  const spec = h.runtime.resolve({ program: 'return 1', bindings: [] })
  const release = vi.fn()
  const retain = h.ctx.targetProtection.retainExecution.bind(h.ctx.targetProtection)
  const retained = vi.spyOn(h.ctx.targetProtection, 'retainExecution').mockImplementation(() => {
    const dispose = retain()
    return () => { release(); dispose() }
  })
  onTestFinished(() => { retained.mockRestore() })
  const running = h.run()
  const native = await worker
  const terminate = native.terminate.bind(native)
  const broken = vi.spyOn(native, 'terminate').mockRejectedValueOnce(new Error('native termination unavailable'))
  onTestFinished(async () => { broken.mockRestore(); await terminate() })
  try {
    native.emit('message', { kind: 'done', value: '{}' })
    await expect(running).rejects.toMatchObject({ code: 'PTC_SHUTDOWN_UNCONFIRMED' })
    expect(release).not.toHaveBeenCalled()
    await expect(h.runtime.run(spec)).rejects.toMatchObject({ code: 'PTC_SHUTDOWN_UNCONFIRMED' })
    expect(() => h.runtime.resolve({ program: 'return 1', bindings: [] })).toThrow('closure could not be confirmed')
  } finally { await terminate() }
  expect(release).toHaveBeenCalledOnce()
})

it('bounds an unresolved native shutdown while retaining the live Worker lease', async () => {
  const h = await harness({ shutdownTimeoutMs: 50 }), worker = captureWorker()
  const requested: PromiseWithResolvers<void> = Promise.withResolvers()
  const termination = Promise.withResolvers<number>()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  onTestFinished(() => { vi.useRealTimers() })
  const running = h.run()
  const rejected = expect(running).rejects.toMatchObject({ code: 'PTC_SHUTDOWN_UNCONFIRMED' })
  const native = await worker
  const terminate = native.terminate.bind(native)
  const held = vi.spyOn(native, 'terminate').mockImplementation(() => { requested.resolve(); return termination.promise })
  try {
    native.emit('message', { kind: 'done', value: '{}' })
    await requested.promise
    await vi.advanceTimersByTimeAsync(50)
    await rejected
    expect(native.threadId).not.toBe(-1)
    expect(() => h.runtime.resolve({ program: '', bindings: [] })).toThrow('closure could not be confirmed')
  } finally {
    held.mockRestore()
    vi.useRealTimers()
    termination.resolve(await terminate())
  }
})
