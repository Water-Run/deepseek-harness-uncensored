/** Guard-client transport failures stop the owned range without treating helper loss as rule removal. @module */
import { ChildProcess } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { PassThrough } from 'node:stream'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { ObservedWindowsJob } from '@deepseek-ai/dsh-win32-process'
import { startNativeIngress, type NativeIngressLauncher, type NativeIngressOptions } from '../src/native-ingress.ts'

vi.mock('@deepseek-ai/dsh-win32-process', () => ({ currentWindowsProcessIdentity: () => ({ pid: 42, creationTime: 123456789012345678n }) }))

const id = 'ca55d452-01c1-45c3-b0ad-73e3e3c28a45'
function fixture(respond?: (request: Record<string, unknown>, output: PassThrough) => void) {
  const input = new PassThrough(), output = new PassThrough(), error = new PassThrough()
  const child = Object.assign(new ChildProcess(), { stdin: input, stdout: output, stderr: error,
    stdio: [input, output, error] as [Writable, Readable, Readable] })
  const state = { active: true, closed: false, stopped: 0, wait: true, stopFailure: false }
  const requests: Record<string, unknown>[] = []
  const end = (code: number) => {
    if (state.closed) return
    state.closed = true
    input.destroy(); output.destroy(); error.destroy()
    child.emit('close', code, null)
  }
  child.kill = () => { end(1); return true }
  input.on('data', (chunk: Buffer) => {
    const request = JSON.parse(chunk.toString()) as Record<string, unknown>
    requests.push(request)
    if (respond !== undefined) { respond(request, output); return }
    output.write(`${JSON.stringify({ sequence: request.sequence, ok: true, value: request.operation === 'install' ? { scope: id } : null })}\n`)
  })
  input.on('finish', () => { end(0) })
  onTestFinished(() => { end(1) })
  const job: ObservedWindowsJob = {
    borrowHandle: () => 99n, isEmpty: () => !state.active, close() {},
    terminate() { state.stopped++; if (state.stopFailure) throw new Error('termination failed'); state.active = false },
    waitForExit: async () => !state.active && state.wait,
  }
  const options: NativeIngressOptions = { executable: resolve('fixture-helper.exe'), requestTimeoutMs: 100,
    shutdownTimeoutMs: 100, pollIntervalMs: 1, diagnosticMaxBytes: 16 }
  const args: string[][] = []
  const launcher: NativeIngressLauncher = (_options, value) => { args.push([...value]); return child }
  const controller = new AbortController()
  const start = () => startNativeIngress(options, job, { pid: 54, creationTime: 134121339991234567n }, controller.signal, launcher)
  return { child, input, output, error, state, job, options, requests, args, launcher, controller, start }
}

it('preserves exact kernel integers and waits for the entire range before releasing the helper', async () => {
  const h = fixture(), lease = await h.start()
  expect(lease.id).toBe(id)
  expect(h.args[0]).toEqual(['--stdio', '42', '123456789012345678', '100', '1'])
  expect(h.requests[0]).toMatchObject({ admission: { target: { created: '134121339991234567' }, job: '99' } })
  h.state.active = false
  await lease.release()
  await lease.release()
  expect(h.requests.map(request => request.operation)).toEqual(['install', 'release'])
  expect(h.state.closed).toBe(true)
})

it('stops an active range before requesting rule cleanup', async () => {
  const h = fixture(), lease = await h.start()
  await lease.stop()
  expect(h.state.active).toBe(false)
  expect(h.requests.map(request => request.operation)).toEqual(['install', 'stop'])
})

it('cancellation closes a published helper and keeps independent Job termination', async () => {
  const h = fixture(), lease = await h.start()
  h.controller.abort(new Error('cancelled'))
  await lease.stop()
  expect(h.state.active).toBe(false)
  expect(h.state.closed).toBe(true)
})

it.each([
  '{"sequence":1,"ok":true,"value":null}\n',
  '{"sequence":8,"ok":true,"value":{"scope":"ca55d452-01c1-45c3-b0ad-73e3e3c28a45"}}\n',
  'invalid JSON\n',
  '{"sequence":1,"ok":true,"value":{"scope":"wrong"}}\n',
  'x'.repeat(65537),
  '{"sequence":1,"ok":false,"error":{"code":"permission-required","message":"Denied","win32":5}}\n',
])('refuses invalid or denied admission and joins helper closure', async (reply) => {
  const h = fixture((_request, output) => { output.write(reply) })
  await expect(h.start()).rejects.toBeDefined()
  expect(h.state.active).toBe(false)
  expect(h.state.closed).toBe(true)
})

it('bounds incomplete replies without replaying installation', async () => {
  const h = fixture((_request, output) => { output.write('{') })
  await expect(h.start()).rejects.toBeDefined()
  expect(h.requests).toHaveLength(1)
  expect(h.state.closed).toBe(true)
})

it('unexpected helper exit rejects its published lease and stops the target', async () => {
  const h = fixture(), lease = await h.start()
  h.error.write('private diagnostic exceeding the limit')
  h.child.kill()
  await expect(lease.failed).rejects.toThrow('Inbound guard exited')
  await expect(lease.stop()).rejects.toBeDefined()
  expect(h.state.active).toBe(false)
})

it('does not send rule removal while range closure is unconfirmed', async () => {
  const h = fixture(), lease = await h.start()
  h.state.wait = false
  await expect(lease.release()).rejects.toMatchObject({ code: 'TARGET_INGRESS_CLEANUP_UNCONFIRMED' })
  expect(h.requests.map(request => request.operation)).toEqual(['install'])
  expect(h.state.closed).toBe(true)
})

it('rejects unsolicited replies and closes an already published helper', async () => {
  const h = fixture(), lease = await h.start()
  h.output.write('{"sequence":1,"ok":true,"value":null}\n')
  await expect(lease.failed).rejects.toThrow('Unexpected inbound guard reply')
  await expect(lease.stop()).rejects.toBeDefined()
  expect(h.state.closed).toBe(true)
})

it('preserves termination failures and still closes its transport', async () => {
  const h = fixture(), lease = await h.start()
  h.state.stopFailure = true
  h.output.emit('error', new Error('transport error'))
  await expect(lease.failed).rejects.toBeInstanceOf(AggregateError)
  await expect(lease.stop()).rejects.toBeDefined()
  expect(h.state.closed).toBe(true)
})

it('does not allocate a helper after cancellation or invalid configuration', async () => {
  const h = fixture()
  h.controller.abort(new Error('cancelled before launch'))
  await expect(h.start()).rejects.toThrow('cancelled before launch')
  expect(h.args).toEqual([])
  h.options.executable = 'relative.exe'
  await expect(h.start()).rejects.toBeDefined()
  expect(h.args).toEqual([])
})

it('fails closed when the configured native helper is missing', async () => {
  const h = fixture()
  await expect(startNativeIngress({ ...h.options, executable: resolve(`missing-guard-${randomUUID()}.exe`), requestTimeoutMs: 5000 },
    h.job, { pid: 54, creationTime: 134121339991234567n }, h.controller.signal)).rejects.toBeInstanceOf(AggregateError)
  expect(h.state.active).toBe(false)
})

it('cancellation during admission waits for its reply and then requests cleanup', async () => {
  const h = fixture((request, output) => {
    if (request.operation === 'install') h.controller.abort(new Error('cancel during admission'))
    output.write(`${JSON.stringify({ sequence: request.sequence, ok: true, value: request.operation === 'install' ? { scope: id } : null })}\n`)
  })
  await expect(h.start()).rejects.toThrow('cancel during admission')
  expect(h.requests.map(request => request.operation)).toEqual(['install', 'stop'])
  expect(h.state.closed).toBe(true)
})

it('rejects cleanup replies that still carry an admission identifier', async () => {
  const h = fixture((request, output) => { output.write(`${JSON.stringify({ sequence: request.sequence, ok: true, value: { scope: id } })}\n`) })
  const lease = await h.start()
  await expect(lease.stop()).rejects.toThrow('unexpected value')
  expect(h.state.closed).toBe(true)
})

it('rejects a nonzero helper exit after its cleanup reply', async () => {
  const h = fixture(), lease = await h.start()
  h.input.removeAllListeners('finish')
  h.input.on('finish', () => { h.child.kill() })
  await expect(lease.stop()).rejects.toMatchObject({ code: 'TARGET_INGRESS_FAILED' })
})

it('reports an unconfirmed helper exit at the shutdown deadline', async () => {
  const h = fixture(), lease = await h.start()
  h.input.removeAllListeners('finish')
  await expect(lease.stop()).rejects.toMatchObject({ code: 'TARGET_INGRESS_CLEANUP_UNCONFIRMED' })
  expect(h.state.closed).toBe(true)
})

it('normalizes unexpected transport failures and caps all retained diagnostics', async () => {
  const h = fixture(), lease = await h.start()
  h.error.write('a'.repeat(16)); h.error.write('ignored extra bytes')
  h.output.emit('error', 'unexpected non-error rejection')
  await expect(lease.failed).rejects.toThrow('Inbound guard failed')
  await expect(lease.stop()).rejects.toBeDefined()
})

it('reports termination failure when cancellation arrives during admission', async () => {
  const h = fixture((_request, output) => {
    h.state.stopFailure = true
    h.controller.abort(new Error('cancel during admission'))
    output.write('{"sequence":1,"ok":true,"value":null}\n')
  })
  await expect(h.start()).rejects.toBeDefined()
  expect(h.state.closed).toBe(true)
  expect(h.state.active).toBe(true)
})
