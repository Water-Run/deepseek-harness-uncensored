import { expect, it, vi } from 'vitest'
import { DesktopAboutRouting } from '../src/about-routing.ts'
import { createAboutBridge } from '../src/preload-about.ts'
import type { DesktopAboutBridge } from '@deepseek-ai/dsh-client-ui-settings-account/src/about-types.ts'
import type { DshDesktopProductApi } from '../src/ipc.ts'

it('routes only while the product document is ready and releases native content on navigation', () => {
  let available = true
  const request = vi.fn(), platformHidden = vi.fn()
  const routing = new DesktopAboutRouting({ canPresent: () => available, request, platformHidden })
  expect(routing.request()).toBe(false)
  routing.synchronize(true, false)
  expect(routing.request()).toBe(true)
  expect(request).toHaveBeenCalledOnce()
  routing.synchronize(true, true)
  expect(platformHidden).toHaveBeenLastCalledWith(true)
  available = false
  expect(routing.request()).toBe(false)
  routing.reset()
  expect(platformHidden).toHaveBeenLastCalledWith(false)
  available = true
  expect(routing.request()).toBe(false)
})

it('keeps independent subscriptions and releases visibility when the last listener leaves', () => {
  const off = vi.fn(), listen = vi.fn(() => off), publish = vi.fn()
  const bridge = createAboutBridge({ listen, publish })
  const handler = vi.fn()
  const first = bridge.subscribe(handler), second = bridge.subscribe(handler)
  expect(publish).toHaveBeenCalledExactlyOnceWith(true, false)
  bridge.visible(true)
  expect(publish).toHaveBeenLastCalledWith(true, true)
  first(); first()
  expect(off).toHaveBeenCalledOnce()
  expect(publish).toHaveBeenLastCalledWith(true, true)
  second()
  expect(off).toHaveBeenCalledTimes(2)
  expect(publish).toHaveBeenLastCalledWith(false, false)
  bridge.visible(true)
  expect(publish).toHaveBeenLastCalledWith(false, false)
})

it('releases its listener if readiness cannot be published', () => {
  const off = vi.fn(), publish = vi.fn().mockImplementationOnce(() => { throw new Error('carrier closed') })
  const bridge = createAboutBridge({ listen: () => off, publish })
  expect(() => bridge.subscribe(() => {})).toThrow('carrier closed')
  expect(off).toHaveBeenCalledOnce()
  const stop = bridge.subscribe(() => {})
  expect(publish).toHaveBeenLastCalledWith(true, false)
  stop()
})

const client = (value: DshDesktopProductApi['about']): DesktopAboutBridge => value
const carrier = (value: DesktopAboutBridge): DshDesktopProductApi['about'] => value
void client; void carrier
