/** Browser transport identity and refusal of native dispatcher bypasses. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Agent, Dispatcher1Wrapper, fetch, getGlobalDispatcher, Headers, Pool, ProxyAgent, Request, Response, setGlobalDispatcher,
} from '../../src/node/external_packages/undici.ts'
import { createNodeBuiltins } from '../../src/node/builtins.ts'
import { MODULE_PROXIES } from '../../src/module-proxies.ts'
import { REPLACED_EXTERNAL_PACKAGES } from '../../src/node/external_packages/replaced-externals.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Worker Undici transport', () => {
  it('uses the browser Fetch classes and performs an ordinary request', async () => {
    expect(Headers).toBe(globalThis.Headers)
    expect(Request).toBe(globalThis.Request)
    expect(Response).toBe(globalThis.Response)
    const response = await fetch('data:text/plain,worker-fetch')
    expect(await response.text()).toBe('worker-fetch')
  })

  it('forwards request options and cancellation to the browser transport', async () => {
    const response = new Response('accepted')
    const transport = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', transport)
    const controller = new AbortController()
    const options = { method: 'POST', body: 'payload', signal: controller.signal }
    expect(await fetch('https://example.invalid/', options)).toBe(response)
    expect(transport).toHaveBeenCalledExactlyOnceWith('https://example.invalid/', options)
  })

  it('rejects a dispatcher before starting a request', async () => {
    const transport = vi.fn()
    vi.stubGlobal('fetch', transport)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = fetch('https://example.invalid/', { dispatcher: {} })
    await expect(request).rejects.toHaveProperty('code', 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM')
    await expect(request).rejects.toThrow('undici.fetch dispatcher')
    expect(transport).not.toHaveBeenCalled()
  })

  it.each([['Agent', Agent], ['Pool', Pool], ['ProxyAgent', ProxyAgent], ['Dispatcher1Wrapper', Dispatcher1Wrapper]] as const)
  ('refuses native %s construction', (name, constructor) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => { Reflect.construct(constructor, []) }).toThrow(expect.objectContaining({
      code: 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM', message: `web-preview: undici.${name} is not available in the worker host`,
    }))
  })

  it.each([['getGlobalDispatcher', getGlobalDispatcher], ['setGlobalDispatcher', setGlobalDispatcher]] as const)
  ('refuses native %s access', (name, operation) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(operation).toThrow(expect.objectContaining({
      code: 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM', message: `web-preview: undici.${name} is not available in the worker host`,
    }))
  })

  it('replaces the native package with one stable Worker module', () => {
    const table = createNodeBuiltins()
    expect(table.undici?.()).toBe(table.undici?.())
    expect(table.undici?.()).toMatchObject({ fetch, Headers, Request, Response })
    expect(MODULE_PROXIES.undici).toBe('./node/external_packages/undici.ts')
    expect(REPLACED_EXTERNAL_PACKAGES).toContain('undici')
  })
})
