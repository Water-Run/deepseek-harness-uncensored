import { expect, it } from 'vitest'
import { browserProxy } from '../src/client/browser/electron/proxy.ts'
import type { DesktopBrowserProxy } from '../src/types.ts'
import { proxyFixture as port, proxyState as state } from './proxy-fixture.client.ts'

const id = 'browser-owner' as DesktopBrowserProxy['sessionId']

it('keeps absent and disabled proxy deployments on ordinary networking without activating an Agent', async () => {
  const signal = new AbortController().signal
  expect(await browserProxy(undefined, id, signal)).toBeUndefined()
  const proxy = port(false)
  expect(await browserProxy(proxy, id, signal)).toBeUndefined()
  expect(proxy.browserEnvironment).not.toHaveBeenCalled()
})

it('uses the Host response for the actual owning conversation', async () => {
  const proxy = port()
  expect(await browserProxy(proxy, id, new AbortController().signal)).toEqual({ sessionId: id, server: 'http://127.0.0.1:49152' })
  expect(proxy.browserEnvironment).toHaveBeenCalledExactlyOnceWith(id)
  proxy.browserEnvironment.mockResolvedValue({ ok: true, value: undefined })
  expect(await browserProxy(proxy, id, new AbortController().signal)).toBeUndefined()
})

it('does not fall back to ordinary networking after losing the proxy service', async () => {
  await expect(browserProxy('unavailable', id, new AbortController().signal)).rejects.toThrow('reconnect')
  const proxy = port()
  proxy.get.mockRejectedValueOnce(new Error('offline'))
  await expect(browserProxy(proxy, id, new AbortController().signal)).rejects.toThrow('offline')
  expect(proxy.browserEnvironment).not.toHaveBeenCalled()
})

it('stops before opening an endpoint if the guest was canceled while reading settings', async () => {
  const controller = new AbortController()
  const proxy = port()
  proxy.get.mockImplementationOnce(async () => {
    controller.abort(new Error('closed'))
    return { ok: true, value: state(true) }
  })
  await expect(browserProxy(proxy, id, controller.signal)).rejects.toThrow('closed')
  expect(proxy.browserEnvironment).not.toHaveBeenCalled()
})

it('discards an endpoint response after the guest lifetime ended', async () => {
  const controller = new AbortController()
  const proxy = port()
  proxy.browserEnvironment.mockImplementationOnce(async () => {
    controller.abort(new Error('mode changed'))
    return { ok: true, value: 'http://127.0.0.1:49152' }
  })
  await expect(browserProxy(proxy, id, controller.signal)).rejects.toThrow('mode changed')
})
