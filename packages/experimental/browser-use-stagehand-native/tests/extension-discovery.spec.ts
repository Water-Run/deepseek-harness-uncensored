/** Pinned extension identity and one-shot, read-only CDP discovery. @module */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { findRuntimeExtension } from '../src/extension-discovery.ts'

vi.mock('node:fs/promises', () => ({ readFile: async () => JSON.stringify({ name: 'Stagehand Runtime', version: '1.0.2' }) }))
const installed = { id: 'a'.repeat(32), name: 'Stagehand Runtime', version: '1.0.2', enabled: true }
class Socket extends EventTarget {
  static reply: unknown = { id: 1, result: { extensions: [] } }
  static instances: Socket[] = []
  static silent = false
  static frames: unknown[] | undefined
  readonly sent: string[] = []
  closed = false
  constructor(readonly url: string) { super(); Socket.instances.push(this); queueMicrotask(() => { this.dispatchEvent(new Event('open')) }) }
  send(text: string): void {
    this.sent.push(text)
    if (!Socket.silent) queueMicrotask(() => {
      for (const data of Socket.frames ?? [JSON.stringify(Socket.reply)]) this.dispatchEvent(new MessageEvent('message', { data }))
    })
  }
  close(): void { this.closed = true; this.dispatchEvent(new Event('close')) }
}
beforeEach(() => {
  Socket.reply = { id: 1, result: { extensions: [] } }; Socket.instances = []; Socket.silent = false; Socket.frames = undefined
  vi.stubGlobal('WebSocket', Socket)
})
afterEach(() => { vi.unstubAllGlobals() })

it('returns no id for a fresh browser and closes the read-only discovery connection', async () => {
  expect(await findRuntimeExtension('ws://fixture', 1000)).toBeUndefined()
  expect(Socket.instances[0]?.closed).toBe(true)
  expect(Socket.instances[0]?.sent).toEqual([JSON.stringify({ id: 1, method: 'Extensions.getExtensions', params: {} })])
})
it('reuses the version-matched enabled extension', async () => {
  Socket.reply = { id: 1, result: { extensions: [installed] } }
  expect(await findRuntimeExtension('ws://fixture', 1000)).toBe(installed.id)
})
it.each([
  [{ ...installed, enabled: false }],
  [installed, { ...installed, id: 'b'.repeat(32) }],
  [{ ...installed, version: 'another-version' }],
])('refuses disabled, duplicated or incompatible runtime extensions: %j', async (...extensions) => {
  Socket.reply = { id: 1, result: { extensions } }
  await expect(findRuntimeExtension('ws://fixture', 1000)).rejects.toMatchObject({ code: 'BROWSER_EXTENSION_IDENTITY_MISMATCH' })
  expect(Socket.instances[0]?.closed).toBe(true)
})
it('resolves an HTTP debugging base using verified debugger metadata', async () => {
  const fetch = vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) =>
    new Response(JSON.stringify({ webSocketDebuggerUrl: 'ws://fixture/browser' })))
  vi.stubGlobal('fetch', fetch)
  await findRuntimeExtension('http://fixture/', 1000)
  expect(fetch.mock.calls[0]?.[0]).toBe('http://fixture/json/version')
  expect(Socket.instances[0]?.url).toBe('ws://fixture/browser')
})
it('refuses unsupported extension inspection without installing another extension', async () => {
  Socket.reply = { id: 1, error: { code: -32601, message: 'Unavailable' } }
  await expect(findRuntimeExtension('ws://fixture', 1000)).rejects.toMatchObject({ code: 'BROWSER_EXTENSION_DISCOVERY_FAILED' })
  expect(Socket.instances[0]?.closed).toBe(true)
})
it('closes an unanswered discovery request at its deadline', async () => {
  Socket.silent = true
  await expect(findRuntimeExtension('ws://fixture', 20)).rejects.toMatchObject({ name: 'TimeoutError' })
  expect(Socket.instances[0]?.closed).toBe(true)
})

it('refuses unsuccessful debugging metadata before opening a socket', async () => {
  vi.stubGlobal('fetch', async () => new Response('', { status: 503 }))
  await expect(findRuntimeExtension('http://fixture', 1000)).rejects.toMatchObject({ code: 'BROWSER_EXTENSION_DISCOVERY_FAILED' })
  expect(Socket.instances).toHaveLength(0)
})
it('refuses binary debugging messages', async () => {
  Socket.frames = [new Uint8Array([1])]
  await expect(findRuntimeExtension('ws://fixture', 1000)).rejects.toThrow('metadata must be text')
  expect(Socket.instances[0]?.closed).toBe(true)
})
it('ignores unrelated debugging events while waiting for its own response', async () => {
  Socket.frames = [JSON.stringify({ method: 'unrelated' }), JSON.stringify(Socket.reply)]
  expect(await findRuntimeExtension('ws://fixture', 1000)).toBeUndefined()
})
it('settles discovery after a transport error and closes its socket', async () => {
  Socket.silent = true
  const outcome = findRuntimeExtension('ws://fixture', 1000).catch((error: unknown) => error)
  await vi.waitFor(() => { expect(Socket.instances).toHaveLength(1) })
  Socket.instances[0]!.dispatchEvent(new Event('error'))
  expect(await outcome).toMatchObject({ code: 'BROWSER_EXTENSION_DISCOVERY_FAILED' })
  expect(Socket.instances[0]?.closed).toBe(true)
})
