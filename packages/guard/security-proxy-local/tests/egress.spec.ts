/** Native delegates retain proxy resources through cancellation and confirmed cleanup. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SecurityProxyCaptureInput, SecurityProxyEgressLease } from '@deepseek-ai/dsh-security-proxy'
import { CaptureStore } from '../src/capture.ts'
import { SecurityProxyEngine, type EngineOptions, type EgressSubject } from '../src/engine.ts'
import { SettingsStore } from '../src/settings.ts'

const subject = (id = 'owner'): EgressSubject => ({ session: { id: SessionId(id) } })
const input = (): SecurityProxyCaptureInput => ({
  at: 1000, kind: 'http', origin: 'proxy', sessionId: 'forged', tool: 'forged', method: 'POST',
  target: 'https://owned.example/fixture', status: 200, durationMs: 1, requestBytes: 22, responseBytes: 17,
  outcome: 'complete', note: null, requestHeaders: [['authorization', 'private'], ['content-type', 'application/json']],
  responseHeaders: [['set-cookie', 'private']], requestBody: '{"password":"private"}',
  responseBody: '{"token":"private"}', contentType: 'application/json',
})

async function fixture(patch: Partial<EngineOptions> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'security-native-egress-'))
  const owned: { engine?: SecurityProxyEngine } = {}
  let expectFailedCleanup = false
  const gates: Array<() => void> = []
  onTestFinished(async () => {
    for (const release of gates) release()
    vi.useRealTimers()
    try {
      if (expectFailedCleanup) await expect(owned.engine?.dispose()).rejects.toThrow('routes failed to close')
      else await owned.engine?.dispose()
    }
    finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) }
  })
  const store = await SettingsStore.open(join(root, 'settings.json'))
  await store.write({ ...store.value, enabled: true, host: '127.0.0.1', port: 1, authEnabled: true, username: 'owner' })
  const capture = new CaptureStore(() => ({ maxFlows: 10, maxBodyBytes: 4096, retentionMs: 60000 }), () => 1000)
  let retained = 0
  class RetainedEngine extends SecurityProxyEngine {
    protected override retainExecution() { retained++; return () => { retained-- } }
  }
  const engine = new RetainedEngine({
    store, capture, vault: { present: async () => true, resolve: async () => 'upstream-private', save: async () => {} },
    presetOf: value => value.session.id === 'standard' ? 'standard' : 'security', sessionIdOf: value => value.session.id,
    testTarget: { host: '127.0.0.1', port: 1 }, connectTimeoutMs: 1000, requestTimeoutMs: 1000,
    maxRedirects: 1, maxBodyChars: 4096, maxResponseBytes: 4096, userAgent: 'egress-fixture', now: () => 1000,
    ...patch,
  })
  owned.engine = engine
  return { engine, store, capture, gates, retained: () => retained, expectFailedCleanup: () => { expectFailedCleanup = true } }
}

it('binds attribution and redaction, honors capture pause, and keeps credentials off the state surface', async () => {
  const h = await fixture(), stop = vi.fn(async () => {})
  const lease = await h.engine.openEgress(subject(), 'native-command', stop, new AbortController().signal)
  expect(lease).toBeDefined()
  try {
    expect(lease!.upstream.password).toBe('upstream-private')
    const flow = lease!.capture.append(input())!
    expect(flow.sessionId).toBe('owner'); expect(flow.tool).toBe('native-command')
    expect(JSON.stringify(flow)).not.toContain('private')
    expect(JSON.stringify(await h.engine.state())).not.toContain('upstream-private')
    await h.store.write({ ...h.store.value, capturePaused: true })
    expect(lease!.paused()).toBe(true)
    expect(lease!.capture.append(input())).toBeUndefined()
    expect(h.capture.stats(true).total).toBe(1)
  } finally { lease!.release() }
  expect(stop).not.toHaveBeenCalled()
  expect(h.retained()).toBe(0)
  expect(() => lease!.capture.append(input())).toThrow('released')
})

it('does not acquire an absent, non-security or disabled route', async () => {
  const h = await fixture(), stop = vi.fn(async () => {}), signal = new AbortController().signal
  expect(await h.engine.openEgress(undefined, 'native', stop, signal)).toBeUndefined()
  expect(await h.engine.openEgress(subject('standard'), 'native', stop, signal)).toBeUndefined()
  await h.store.write({ ...h.store.value, enabled: false })
  expect(await h.engine.openEgress(subject(), 'native', stop, signal)).toBeUndefined()
  expect(stop).not.toHaveBeenCalled(); expect(h.retained()).toBe(0)
})

it('keeps startup cancellation detached after publishing the lease', async () => {
  const h = await fixture(), admission = new AbortController(), stop = vi.fn(async () => {})
  const lease = await h.engine.openEgress(subject(), 'native', stop, new AbortController().signal, admission.signal)
  try { admission.abort(); expect(lease!.signal.aborted).toBe(false); expect(stop).not.toHaveBeenCalled() }
  finally { lease!.release() }
})

it('withdraws a pending credential admission without invoking the not-yet-delegated stop callback', async () => {
  const entered = Promise.withResolvers<undefined>(), credential = Promise.withResolvers<string>()
  const h = await fixture({ vault: { present: async () => true,
    resolve: () => { entered.resolve(undefined); return credential.promise }, save: async () => {} } })
  h.gates.push(() => { credential.resolve('private') })
  const stop = vi.fn(async () => {})
  const opening = h.engine.openEgress(subject(), 'native', stop, new AbortController().signal)
  const refused = expect(opening).rejects.toThrow()
  await entered.promise
  h.engine.forgetSession(SessionId('owner'))
  credential.resolve('private')
  await refused
  expect(stop).not.toHaveBeenCalled(); expect(h.retained()).toBe(0)
})

it('joins a paused native stop before releasing capture resources and completing shutdown', async () => {
  const h = await fixture(), entered = Promise.withResolvers<undefined>(), resume = Promise.withResolvers<undefined>()
  h.gates.push(() => { resume.resolve(undefined) })
  const order: string[] = []
  const reference: { lease: SecurityProxyEgressLease | undefined } = { lease: undefined }
  const stop = vi.fn(async () => {
    entered.resolve(undefined); await resume.promise
    expect(h.retained()).toBeGreaterThan(0)
    reference.lease!.capture.append(input()); order.push('native-closed')
  })
  reference.lease = await h.engine.openEgress(subject(), 'native', stop, new AbortController().signal)
  // This fixture opens no network connections, so fake-time draining observes all runnable promise work.
  vi.useFakeTimers()
  let done = false
  const closing = h.engine.dispose().then(() => { done = true; order.push('proxy-closed') })
  await entered.promise
  await vi.runAllTimersAsync()
  expect(done).toBe(false)
  resume.resolve(undefined); await closing
  expect(order).toEqual(['native-closed', 'proxy-closed'])
  expect(stop).toHaveBeenCalledOnce(); expect(h.retained()).toBe(0)
  expect(h.capture.list()).toHaveLength(1)
  await expect(h.engine.openEgress(subject(), 'native', stop, new AbortController().signal)).rejects.toThrow('closing')
})

it('retires only the withdrawn conversation', async () => {
  const h = await fixture(), stopped = Promise.withResolvers<undefined>()
  const first = await h.engine.openEgress(subject(), 'native', async () => { stopped.resolve(undefined) }, new AbortController().signal)
  const secondStop = vi.fn(async () => {})
  const second = await h.engine.openEgress(subject('other'), 'native', secondStop, new AbortController().signal)
  try {
    h.engine.forgetSession(SessionId('owner')); await stopped.promise
    expect(first!.signal.aborted).toBe(true); expect(second!.signal.aborted).toBe(false)
    expect(secondStop).not.toHaveBeenCalled()
  } finally { first!.release(); second!.release() }
})

it('waits for a native delegate before completing a proxy configuration change', async () => {
  const h = await fixture(), entered = Promise.withResolvers<undefined>(), resume = Promise.withResolvers<undefined>()
  h.gates.push(() => { resume.resolve(undefined) })
  const stop = vi.fn(async () => { entered.resolve(undefined); await resume.promise })
  const lease = await h.engine.openEgress(subject(), 'native', stop, new AbortController().signal)
  let completed = false
  const changing = h.engine.configure({ enabled: false }).then(() => { completed = true })
  await entered.promise
  vi.useFakeTimers()
  await vi.runAllTimersAsync()
  expect(completed).toBe(false); expect(lease!.signal.aborted).toBe(true)
  expect(h.retained()).toBe(1)
  resume.resolve(undefined); await changing
  expect(stop).toHaveBeenCalledOnce(); expect(h.retained()).toBe(0)
  expect((await h.engine.state()).status).toBe('off')
})

it('reports an unconfirmed stop and refuses new native delegation without discarding its dependencies', async () => {
  const h = await fixture(), failed = new Error('range closure unknown')
  const lease = await h.engine.openEgress(subject(), 'native', async () => { throw failed }, new AbortController().signal)
  h.expectFailedCleanup()
  lease!.release({ error: failed })
  expect(h.retained()).toBe(1)
  await expect(h.engine.openEgress(subject(), 'native', async () => {}, new AbortController().signal)).rejects.toThrow('cleanup is unconfirmed')
  await expect(h.engine.dispose()).rejects.toThrow('routes failed to close')
})
