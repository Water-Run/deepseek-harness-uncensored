import { afterEach, expect, it, vi } from 'vitest'
import { BalanceEngine, balanceStorageKey } from '../src/engine.ts'
import type { BalanceIdentity } from '../src/engine.ts'
import type { BalanceSample } from '../src/types.ts'

const client = { version: '0.2.1-rc.2', locale: 'zh-CN', timezoneOffsetSeconds: 28800 }
const engines: BalanceEngine[] = []
afterEach(async () => { await Promise.all(engines.splice(0).map(engine => engine.close())) })

function setup(seed: readonly BalanceSample[] = []) {
  const rows = new Map<string, readonly BalanceSample[]>([['one', seed]])
  const identity: BalanceIdentity = { key: 'one', account: 'api-key', current: vi.fn(async () => true),
    query: vi.fn(async () => [{ currency: 'CNY' as const, toppedUp: '23.50', granted: '5' }]) }
  const identify = vi.fn(async () => identity)
  const write = vi.fn(async (key: string, value: readonly BalanceSample[]) => { rows.set(key, value) })
  const engine = new BalanceEngine({ identify, read: key => rows.get(key), write,
    limit: 5, displayLimit: 3, timeoutMs: 1000, now: () => 100 })
  engines.push(engine)
  return { engine, rows, identity, identify, write }
}

it('stores actual API samples and reads local history without another API query', async () => {
  const b = setup()
  const fresh = await b.engine.read(client, 'api')
  expect(fresh).toMatchObject({ status: 'ready', account: 'api-key', sampleCount: 1 })
  expect(fresh.samples[0]?.wallets).toEqual([{ currency: 'CNY', toppedUp: '23.50', granted: '5' }])
  const local = await b.engine.read(client, 'local')
  expect(local.samples).toEqual(fresh.samples)
  expect(b.identity.query).toHaveBeenCalledOnce()
  expect(b.identify).toHaveBeenLastCalledWith(client, false)
})

it('retains the previous reading on network or persistence failure', async () => {
  const prior = [{ time: 1, wallets: [{ currency: 'CNY' as const, toppedUp: '20', granted: '3' }] }]
  const b = setup(prior)
  vi.mocked(b.identity.query).mockRejectedValueOnce(new Error('offline'))
  expect(await b.engine.read(client, 'api')).toMatchObject({ status: 'unavailable', samples: prior, error: 'request' })
  b.write.mockRejectedValueOnce(new Error('disk full'))
  expect(await b.engine.read(client, 'api')).toMatchObject({ status: 'unavailable', samples: prior, error: 'storage' })
})

it('drops an in-flight sample after the credential generation changes', async () => {
  const b = setup()
  vi.mocked(b.identity.current).mockResolvedValue(false)
  expect(await b.engine.read(client, 'api')).toMatchObject({ status: 'unavailable', account: null, samples: [], error: 'changed' })
  expect(b.write).not.toHaveBeenCalled()
})

it('bounds retained history and transport samples while retaining the first and last observations', async () => {
  const prior = Array.from({ length: 5 }, (_, time) => ({ time, wallets: [{ currency: 'CNY' as const, toppedUp: String(time), granted: '0' }] }))
  const b = setup(prior)
  const result = await b.engine.read(client, 'api')
  expect(b.rows.get('one')).toHaveLength(5)
  expect(result.sampleCount).toBe(5)
  expect(result.samples.map(sample => sample.time)).toEqual([1, 3, 100])
})

it('waits for an admitted query during disposal and prevents its late write', async () => {
  const b = setup()
  const query = Promise.withResolvers<Awaited<ReturnType<BalanceIdentity['query']>>>()
  vi.mocked(b.identity.query).mockReturnValue(query.promise)
  const request = b.engine.read(client, 'api')
  try {
    await vi.waitFor(() => { expect(b.identity.query).toHaveBeenCalledOnce() })
    let closed = false
    const closing = b.engine.close().then(() => { closed = true })
    await Promise.resolve()
    expect(closed).toBe(false)
    query.resolve([{ currency: 'CNY', toppedUp: '12', granted: '1' }])
    await closing
    expect((await request).status).toBe('unavailable')
    expect(b.write).not.toHaveBeenCalled()
  } finally { query.resolve([]); await request }
})

it('uses opaque, identity-specific storage keys', () => {
  expect(balanceStorageKey('private-secret')).toMatch(/^[0-9a-f]{64}$/u)
  expect(balanceStorageKey('one')).not.toBe(balanceStorageKey('two'))
})
