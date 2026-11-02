/** One-shot maintenance reports partial cleanup and never retries an unknown result. @module */
import { ChildProcess } from 'node:child_process'
import { PassThrough, type Readable, type Writable } from 'node:stream'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, onTestFinished, vi } from 'vitest'
import { recoverNativeIngress } from '../src/native-ingress-recovery.ts'
import type { NativeIngressLauncher } from '../src/native-ingress.ts'

vi.mock('@deepseek-ai/dsh-win32-process', () => ({ currentWindowsProcessIdentity: () => ({ pid: 42, creationTime: 123456789012345678n }) }))

function fixture(reply: string | null, exit = 0) {
  const input = new PassThrough(), output = new PassThrough(), diagnostic = new PassThrough()
  const child = Object.assign(new ChildProcess(), { stdin: input, stdout: output, stderr: diagnostic,
    stdio: [input, output, diagnostic] as [Writable, Readable, Readable] })
  const state = { closed: false, requests: [] as string[] }
  const close = (code: number) => {
    if (state.closed) return
    state.closed = true; input.destroy(); output.destroy(); diagnostic.destroy(); child.emit('close', code, null)
  }
  child.kill = () => { close(1); return true }
  input.on('data', (bytes: Buffer) => { state.requests.push(bytes.toString()) })
  input.on('finish', () => { if (reply !== null) { output.write(reply); close(exit) } })
  onTestFinished(() => { close(1) })
  const launcher: NativeIngressLauncher = (_config, args) => {
    expect(args.slice(0, 3)).toEqual(['--stdio', '42', '123456789012345678'])
    return child
  }
  const controller = new AbortController()
  const config = { executable: resolve('guard.exe'), requestTimeoutMs: 100, shutdownTimeoutMs: 100,
    pollIntervalMs: 1, diagnosticMaxBytes: 16 }
  return { input, output, diagnostic, child, state, launcher, controller, config,
    run: () => recoverNativeIngress(config, controller.signal, launcher) }
}

it('returns separate removed, retained and unrecognized results after a successful helper exit', async () => {
  const value = { removed: [randomUUID()], retained: [{ scope: randomUUID(), code: 'scope-active' }], unrecognized: 2 }
  const h = fixture(JSON.stringify({ sequence: 1, ok: true, value }))
  expect(await h.run()).toEqual(value)
  expect(h.state.requests.map((row): unknown => JSON.parse(row))).toEqual([{ sequence: 1, operation: 'recover' }])
  expect(h.state.closed).toBe(true)
})

it('restricts maintenance to an explicitly selected original owner without rounding FILETIME', async () => {
  const h = fixture('{"sequence":1,"ok":true,"value":{"removed":[],"retained":[],"unrecognized":0}}')
  await recoverNativeIngress(h.config, h.controller.signal, h.launcher, { pid: 99, creationTime: 134121339991234567n })
  expect(JSON.parse(h.state.requests[0] ?? '')).toMatchObject({ owner: { pid: 99, created: '134121339991234567' } })
})

it.each([
  'not json',
  '{"sequence":2,"ok":true,"value":{"removed":[],"retained":[],"unrecognized":0}}',
  '{"sequence":1,"ok":true,"value":null}',
  '{"sequence":1,"ok":true,"value":{"removed":["not-an-id"],"retained":[],"unrecognized":0}}',
])('does not interpret malformed maintenance output as all clear', async (message) => {
  const h = fixture(message)
  await expect(h.run()).rejects.toMatchObject({ code: 'TARGET_INGRESS_RECOVERY_FAILED' })
  expect(h.state.requests).toHaveLength(1)
})

it('preserves a native refusal even when the helper exits unsuccessfully', async () => {
  const h = fixture('{"sequence":1,"ok":false,"error":{"code":"permission-required","message":"Denied","win32":5}}', 1)
  await expect(h.run()).rejects.toMatchObject({ code: 'TARGET_INGRESS_RECOVERY_REFUSED', cause: { win32: 5 } })
})

it('does not accept success output from an unsuccessful helper', async () => {
  const h = fixture('{"sequence":1,"ok":true,"value":{"removed":[],"retained":[],"unrecognized":0}}', 1)
  await expect(h.run()).rejects.toMatchObject({ code: 'TARGET_INGRESS_RECOVERY_FAILED' })
})

it('bounds oversized output and reports timeout without replaying recovery', async () => {
  const huge = fixture('x'.repeat(65537))
  await expect(huge.run()).rejects.toThrow('wire limit')
  const h = fixture(null)
  await expect(h.run()).rejects.toMatchObject({ code: 'TARGET_INGRESS_RECOVERY_TIMEOUT' })
  expect(h.state.requests).toHaveLength(1)
})

it('cancels a started helper and preserves the possibility of partial cleanup', async () => {
  const h = fixture(null), pending = h.run()
  h.controller.abort(new Error('owner cancelled'))
  await expect(pending).rejects.toMatchObject({ code: 'TARGET_INGRESS_RECOVERY_CANCELLED' })
  expect(h.state.closed).toBe(true)
})

it('reports unknown closure instead of waiting indefinitely for an unresponsive helper', async () => {
  const h = fixture(null)
  h.child.kill = () => false
  await expect(h.run()).rejects.toMatchObject({ code: 'TARGET_INGRESS_RECOVERY_UNCONFIRMED' })
})

it('normalizes transport errors and retains only bounded diagnostics', async () => {
  const h = fixture(null), pending = h.run()
  h.diagnostic.write('a'.repeat(20)); h.diagnostic.write('extra')
  h.output.emit('error', 'non-Error transport failure')
  await expect(pending).rejects.toThrow('Native recovery transport failed')
})

it('does not recurse or replay when termination itself reports another transport error', async () => {
  const h = fixture(null), kill = vi.fn(() => {
    h.child.emit('error', new Error('second transport failure'))
    h.child.emit('close', 1, null)
    return true
  })
  h.child.kill = kill
  const pending = h.run()
  h.output.emit('error', new Error('first transport failure'))
  await expect(pending).rejects.toThrow('first transport failure')
  expect(kill).toHaveBeenCalledOnce()
  expect(h.state.requests).toHaveLength(1)
})

it('does not allocate after cancellation and reports a missing helper as failure', async () => {
  const h = fixture(null)
  h.controller.abort(new Error('already cancelled'))
  await expect(h.run()).rejects.toThrow('already cancelled')
  expect(h.state.requests).toEqual([])
  await expect(recoverNativeIngress({ ...h.config, executable: resolve(`missing-${randomUUID()}.exe`), requestTimeoutMs: 5000 },
    new AbortController().signal)).rejects.toMatchObject({ code: 'ENOENT' })
})
