/** Country downloads inherit the Host transport and leave its lifetime to the launcher. @module */
import { MockAgent, fetch, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { expect, it, onTestFinished, vi } from 'vitest'
import { downloadCountry } from '../src/country-download.ts'

vi.mock('undici', async original => ({
  ...await original<typeof import('undici')>(),
  EnvHttpProxyAgent: function () { throw new Error('Country downloads must not replace the Host dispatcher') },
}))

it('uses the active Host route for both release attempts and leaves that route usable', async () => {
  const previous = getGlobalDispatcher(), dispatcher = new MockAgent()
  onTestFinished(async () => { setGlobalDispatcher(previous); await dispatcher.close() })
  dispatcher.disableNetConnect()
  setGlobalDispatcher(dispatcher)
  const source = dispatcher.get('https://download.db-ip.com')
  source.intercept({ path: '/free/dbip-country-lite-2026-11.mmdb.gz' }).reply(404)
  source.intercept({ path: '/free/dbip-country-lite-2026-10.mmdb.gz' }).reply(200, Buffer.from([1, 2, 3]))
  source.intercept({ path: '/owned-route-probe' }).reply(200, 'still active')
  expect(await downloadCountry(Date.UTC(2026, 10, 1), 10, new AbortController().signal))
    .toEqual({ bytes: Buffer.from([1, 2, 3]), month: '2026-10' })
  expect(await (await fetch('https://download.db-ip.com/owned-route-probe')).text()).toBe('still active')
  dispatcher.assertNoPendingInterceptors()
})
