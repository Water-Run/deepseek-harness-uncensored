import { beforeEach, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { DesktopBrowserGuests } from '../src/browser-guests.ts'

type RequestHandler = (details: { url: string }, callback: (result: { cancel: boolean }) => void) => void
const state = vi.hoisted(() => ({ sessions: [] as Array<{
  setProxy: ReturnType<typeof vi.fn<(config: object) => Promise<void>>>
  webRequest: { onBeforeRequest: ReturnType<typeof vi.fn<(handler: RequestHandler) => void>> }
}>, configure: undefined as undefined | (() => Promise<void>) }))
vi.mock('electron', () => ({
  app: { isPackaged: true },
  session: { fromPartition: vi.fn(() => {
    const session = {
      setProxy: vi.fn(async (_config: object) => { await state.configure?.() }),
      setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(),
      setDisplayMediaRequestHandler: vi.fn(), on: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn<(handler: RequestHandler) => void>() },
    }
    state.sessions.push(session)
    return session
  }) },
}))
beforeEach(() => { state.sessions = []; state.configure = undefined })

const owner = { isDestroyed: () => false } as WebContents
const route = { sessionId: 'security-one', server: 'http://127.0.0.1:49152' }
const opaque = async (): Promise<null> => null

it('retains ordinary workspace storage and isolates each proxied conversation', async () => {
  const guests = new DesktopBrowserGuests(() => undefined, opaque)
  const ordinary = await guests.acquire(owner, 'cwd:/shared')
  expect((await guests.acquire(owner, 'cwd:/shared')).partition).toBe(ordinary.partition)
  const security = await guests.acquire(owner, 'cwd:/shared', route)
  expect(security.partition).not.toBe(ordinary.partition)
  expect((await guests.acquire(owner, 'cwd:/shared', route)).partition).toBe(security.partition)
  expect((await guests.acquire(owner, 'cwd:/shared', { ...route, sessionId: 'security-two' })).partition).not.toBe(security.partition)
  expect((await guests.acquire(owner, 'cwd:/shared', { ...route, server: 'http://127.0.0.1:49153' })).partition).not.toBe(security.partition)
  expect(state.sessions[0]?.setProxy).not.toHaveBeenCalled()
  expect(state.sessions[1]?.setProxy).toHaveBeenCalledExactlyOnceWith({ mode: 'fixed_servers', proxyRules: route.server, proxyBypassRules: '<-loopback>' })
})

it('joins proxy preparation and does not issue a lease until it settles', async () => {
  const prepared = Promise.withResolvers<undefined>()
  state.configure = () => prepared.promise
  const guests = new DesktopBrowserGuests(() => undefined, opaque)
  let leased = false
  const first = guests.acquire(owner, 'shared', route).then((value) => { leased = true; return value })
  const second = guests.acquire(owner, 'shared', route)
  await Promise.resolve()
  expect(leased).toBe(false)
  expect(state.sessions).toHaveLength(1)
  prepared.resolve(undefined)
  expect((await first).partition).toBe((await second).partition)
  expect(state.sessions[0]?.setProxy).toHaveBeenCalledOnce()
})

it('discards failed proxy preparation before another reservation can use it', async () => {
  state.configure = async () => { throw new Error('configuration failed') }
  const guests = new DesktopBrowserGuests(() => undefined, opaque)
  await expect(guests.acquire(owner, 'shared', route)).rejects.toThrow('configuration failed')
  state.configure = undefined
  await expect(guests.acquire(owner, 'shared', route)).resolves.toHaveProperty('lease')
  expect(state.sessions).toHaveLength(2)
})

it('refuses a reservation if its window closes during proxy preparation', async () => {
  const prepared = Promise.withResolvers<undefined>()
  state.configure = () => prepared.promise
  let closed = false
  const window = { isDestroyed: () => closed } as WebContents
  const result = new DesktopBrowserGuests(() => undefined, opaque).acquire(window, 'shared', route)
  const rejection = expect(result).rejects.toThrow('window closed')
  closed = true
  prepared.resolve(undefined)
  await rejection
})

it.each([
  { ...route, sessionId: '' }, { ...route, server: 'https://127.0.0.1:49152' },
  { ...route, server: 'http://example.test:49152' }, { ...route, server: 'http://user:password@127.0.0.1:49152' },
  { ...route, server: 'http://127.0.0.1:49152/path' }, { ...route, server: 'http://127.0.0.1:49152/?key=value' },
  { ...route, server: 'not a URL' }, { ...route, server: 'http://127.0.0.1' }, null,
])('rejects invalid IPC proxy settings before creating storage (%j)', async (routing) => {
  await expect(new DesktopBrowserGuests(() => undefined, opaque).acquire(owner, 'shared', routing)).rejects.toThrow('desktop browser:')
  expect(state.sessions).toHaveLength(0)
})

it('continues blocking application control URLs before proxied page requests leave Chromium', async () => {
  await new DesktopBrowserGuests(() => 'http://127.0.0.1:23333/', opaque).acquire(owner, 'shared', route)
  const handler = state.sessions[0]?.webRequest.onBeforeRequest.mock.calls[0]?.[0]
  expect(handler).toBeTypeOf('function')
  const outcome = vi.fn()
  handler!({ url: 'http://localhost:23333/api' }, outcome)
  expect(outcome).toHaveBeenLastCalledWith({ cancel: true })
  handler!({ url: 'http://127.0.0.1:23456/page' }, outcome)
  expect(outcome).toHaveBeenLastCalledWith({ cancel: false })
})

it('looks up trust on the Host and rejects a failed lookup before preparing the guest', async () => {
  const trust = vi.fn().mockRejectedValueOnce(new Error('route withdrawn')).mockResolvedValue(null)
  const guests = new DesktopBrowserGuests(() => undefined, trust)
  await expect(guests.acquire(owner, 'shared', { ...route, certificate: 'renderer-provided' })).rejects.toThrow('route withdrawn')
  expect(trust).toHaveBeenCalledExactlyOnceWith(route)
  expect(state.sessions).toHaveLength(0)
  await expect(guests.acquire(owner, 'shared', { ...route, certificate: 'renderer-provided' })).resolves.toHaveProperty('partition')
})
