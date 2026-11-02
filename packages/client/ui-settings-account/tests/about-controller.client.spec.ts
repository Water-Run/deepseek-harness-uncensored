import { expect, it, vi } from 'vitest'
import { AboutController } from '../src/client/about-controller.ts'

it('shares one dialog across sidebar and native requests and releases it on teardown', () => {
  let request: (() => void) | undefined
  const unsubscribe = vi.fn(), visible = vi.fn()
  const controller = new AboutController({ subscribe: (listener) => { request = listener; return unsubscribe }, visible })
  controller.start(); controller.start()
  request!()
  controller.open()
  expect(controller.state.getSnapshot()).toBe(true)
  expect(visible).toHaveBeenCalledExactlyOnceWith(true)
  controller.close(); controller.close()
  expect(controller.state.getSnapshot()).toBe(false)
  request!()
  controller.dispose(); controller.dispose()
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(visible).toHaveBeenLastCalledWith(false)
  request!(); controller.open()
  expect(controller.state.getSnapshot()).toBe(false)
})

it('works without Desktop and still detaches if the carrier closes first', () => {
  const browser = new AboutController()
  browser.start()
  browser.open(); browser.dispose()
  expect(browser.state.getSnapshot()).toBe(false)
  const off = vi.fn(), visible = vi.fn()
  const desktop = new AboutController({ subscribe: () => off, visible })
  desktop.start()
  desktop.open()
  visible.mockImplementationOnce(() => { throw new Error('carrier closed') })
  expect(() => { desktop.dispose() }).toThrow('carrier closed')
  expect(off).toHaveBeenCalledOnce()
  desktop.open()
  expect(desktop.state.getSnapshot()).toBe(false)
})
