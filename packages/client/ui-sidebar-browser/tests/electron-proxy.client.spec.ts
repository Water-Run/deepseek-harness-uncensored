// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { DesktopBrowserProxy } from '../src/types.ts'
import { electronFixture } from './electron-harness.client.ts'

const target = { kind: 'http' as const, url: 'http://example.test/page', title: 'Example' }
const route: DesktopBrowserProxy = { sessionId: 'security-one' as DesktopBrowserProxy['sessionId'], server: 'http://127.0.0.1:49152' }
const fixtures: ReturnType<typeof electronFixture>[] = []
const unblock: Array<() => void> = []
const fixture = (proxy?: (signal: AbortSignal) => Promise<DesktopBrowserProxy | undefined>, modern = true) => {
  const h = electronFixture(undefined, proxy, modern)
  fixtures.push(h)
  return h
}
afterEach(async () => {
  for (const finish of unblock.splice(0)) finish()
  for (const h of fixtures.splice(0)) await h.dispose()
  vi.restoreAllMocks()
})

it('resolves conversation routing before acquiring a native guest', async () => {
  const resolved = Promise.withResolvers<DesktopBrowserProxy>()
  unblock.push(() => { resolved.resolve(route) })
  const h = fixture(() => resolved.promise)
  h.mount(); h.frame.loadUrl(target)
  await Promise.resolve()
  expect(h.bridge.acquire).not.toHaveBeenCalled()
  resolved.resolve(route)
  const guest = await h.guest()
  expect(h.bridge.acquire).toHaveBeenCalledWith('cwd:/workspace', route)
  guest.emit('dom-ready')
  expect(guest.loadURL).toHaveBeenCalledWith(target.url)
})

it('does not acquire a guest when routing fails or belongs to an unsupported shell', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const h of [fixture(async () => { throw new Error('Host unavailable') }), fixture(async () => route, false)]) {
    h.mount(); h.frame.loadUrl(target)
    await vi.waitFor(() => { expect(h.frame.getSnapshot().error).toBeDefined() })
    expect(h.bridge.acquire).not.toHaveBeenCalled()
    expect(h.guests).toHaveLength(0)
  }
})

it('retains ordinary browsing in a shell without proxy support when the route is absent', async () => {
  const h = fixture(async () => undefined, false)
  h.mount(); h.frame.loadUrl(target)
  await h.guest()
  expect(h.bridge.acquire).toHaveBeenCalledWith('cwd:/workspace')
})

it('releases the old guest before applying changed routing to the retained page', async () => {
  const proxy = vi.fn(async () => route)
  const h = fixture(proxy)
  h.mount(); h.frame.loadUrl(target)
  const first = await h.guest(); first.emit('dom-ready')
  const release = Promise.withResolvers<undefined>()
  unblock.push(() => { release.resolve(undefined) })
  h.bridge.release.mockImplementationOnce(() => release.promise)
  const changed = { ...route, server: 'http://127.0.0.1:49153' }
  proxy.mockResolvedValue(changed)
  const writes = h.persist.mock.calls.length
  h.frame.refreshNetwork!()
  await vi.waitFor(() => { expect(h.host.firstElementChild).toBeNull() })
  await Promise.resolve()
  expect(h.bridge.acquire).toHaveBeenCalledTimes(1)
  release.resolve(undefined)
  const second = await h.guest()
  expect(h.guests).toHaveLength(2)
  expect(h.bridge.acquire).toHaveBeenLastCalledWith('cwd:/workspace', changed)
  second.emit('dom-ready')
  expect(second.loadURL).toHaveBeenCalledWith(target.url)
  expect(h.persist).toHaveBeenCalledTimes(writes)
})

it('does not reload an ordinary page when its authoritative routing remains unchanged', async () => {
  const proxy = vi.fn(async () => undefined)
  const h = fixture(proxy)
  h.mount(); h.frame.loadUrl(target)
  const guest = await h.guest(); guest.emit('dom-ready')
  h.frame.refreshNetwork!()
  await vi.waitFor(() => { expect(proxy).toHaveBeenCalledTimes(2) })
  expect(h.bridge.release).not.toHaveBeenCalled()
  expect(h.bridge.acquire).toHaveBeenCalledTimes(1)
  expect(h.guests).toHaveLength(1)
})

it('abandons an old routing response after a mode change without opening its guest', async () => {
  const old = Promise.withResolvers<DesktopBrowserProxy>()
  unblock.push(() => { old.resolve(route) })
  const proxy = vi.fn<(signal: AbortSignal) => Promise<DesktopBrowserProxy | undefined>>()
    .mockImplementationOnce(() => old.promise).mockResolvedValue(undefined)
  const h = fixture(proxy)
  h.mount(); h.frame.loadUrl(target)
  await vi.waitFor(() => { expect(proxy).toHaveBeenCalledOnce() })
  h.frame.refreshNetwork!()
  expect(proxy.mock.calls[0]?.[0].aborted).toBe(true)
  old.resolve(route)
  await h.guest()
  expect(h.bridge.acquire).toHaveBeenCalledExactlyOnceWith('cwd:/workspace')
})

it('blocks guest replacement when the previous shutdown cannot be confirmed', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const h = fixture(async () => route)
  h.mount(); h.frame.loadUrl(target)
  await h.guest()
  h.bridge.release.mockRejectedValueOnce(new Error('release acknowledgement failed'))
  h.frame.refreshNetwork!()
  await vi.waitFor(() => { expect(h.frame.getSnapshot().error).toBeDefined() })
  h.frame.reload()
  await Promise.resolve()
  expect(h.bridge.acquire).toHaveBeenCalledTimes(1)
})

it('does not recreate a detached or disposed page after network invalidation', async () => {
  const h = fixture(async () => route)
  const unmount = h.presentation.mount(h.host.id)
  h.frame.loadUrl(target)
  await h.guest()
  unmount()
  h.frame.refreshNetwork!()
  await Promise.resolve()
  expect(h.bridge.acquire).toHaveBeenCalledTimes(1)
  await h.frame.dispose()
  h.frame.refreshNetwork!()
  expect(h.bridge.acquire).toHaveBeenCalledTimes(1)
})

it('does not activate an idle tab when networking changes', async () => {
  const h = fixture(async () => route)
  h.mount()
  h.frame.refreshNetwork!()
  await new Promise<void>((resolve) => { setImmediate(resolve) })
  expect(h.workspace).not.toHaveBeenCalled()
  expect(h.bridge.acquire).not.toHaveBeenCalled()
})

it('does not report a superseded routing error after a newer refresh starts', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const proxy = vi.fn(async () => route)
  const h = fixture(proxy)
  h.mount()
  h.frame.loadUrl(target)
  const guest = await h.guest()
  guest.emit('dom-ready')
  const closed = Promise.withResolvers<undefined>()
  unblock.push(() => { closed.resolve(undefined) })
  h.bridge.release.mockImplementationOnce(() => closed.promise)
  proxy.mockRejectedValueOnce(new Error('old Host disconnected'))
  h.frame.refreshNetwork!()
  await vi.waitFor(() => { expect(h.bridge.release).toHaveBeenCalledOnce() })
  h.frame.refreshNetwork!()
  closed.resolve(undefined)
  await h.guest()
  expect(h.guests).toHaveLength(2)
  expect(h.frame.getSnapshot().error).toBeUndefined()
})
