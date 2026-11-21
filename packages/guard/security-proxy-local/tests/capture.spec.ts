import { describe, expect, it } from 'vitest'
import {
  CaptureStore,
  headerEntries,
  prepareBody,
  truncateBody,
  type CapturedExchangeInput,
} from '../src/capture.ts'

/** One captured exchange with sensible defaults. */
function exchange(patch: Partial<CapturedExchangeInput> = {}): CapturedExchangeInput {
  return {
    at: Date.now(),
    kind: 'http',
    origin: 'client',
    sessionId: 'session-a',
    tool: 'web_fetch',
    method: 'GET',
    target: 'http://target.test/',
    status: 200,
    durationMs: 12,
    requestBytes: 0,
    responseBytes: 5,
    outcome: 'complete',
    note: null,
    requestHeaders: [['accept', 'text/plain']],
    responseHeaders: [['content-type', 'text/plain']],
    requestBody: null,
    responseBody: 'hello',
    contentType: 'text/plain',
    ...patch,
  }
}

const limits = (patch: Partial<{ maxFlows: number; maxBodyBytes: number; retentionMs: number }> = {}) => ({
  maxFlows: 3,
  maxBodyBytes: 1_024,
  retentionMs: 60_000,
  ...patch,
})

describe('transparency', () => {
  it('stores credential-bearing headers exactly as observed', () => {
    expect(headerEntries([
      ['Authorization', 'Bearer secret'],
      ['proxy-authorization', 'Basic abc'],
      ['Cookie', 'a=1'],
      ['set-cookie', 'b=2'],
      ['Referer', 'https://user:pass@example.test/?token=secret&display=a%20b'],
      ['Location', '/callback?keep=1#access_token=secret&expires_in=300'],
      ['accept', 'text/html'],
    ])).toEqual([
      { name: 'Authorization', value: 'Bearer secret' },
      { name: 'proxy-authorization', value: 'Basic abc' },
      { name: 'Cookie', value: 'a=1' },
      { name: 'set-cookie', value: 'b=2' },
      { name: 'Referer', value: 'https://user:pass@example.test/?token=secret&display=a%20b' },
      { name: 'Location', value: '/callback?keep=1#access_token=secret&expires_in=300' },
      { name: 'accept', value: 'text/html' },
    ])
  })
})

describe('body preparation', () => {
  it('cuts at the byte budget without splitting a character', () => {
    const text = '安全代理'
    const cut = truncateBody(text, 7)
    expect(cut.truncated).toBe(true)
    expect(cut.text).toBe('安全')
    expect(Buffer.byteLength(cut.text, 'utf8')).toBeLessThanOrEqual(7)
  })

  it('keeps a body that fits exactly', () => {
    expect(truncateBody('abc', 3)).toEqual({ text: 'abc', truncated: false })
  })

  it('preserves an original replacement character at the UTF-8 capture boundary', () => {
    expect(truncateBody('\uFFFD尾', 3)).toEqual({ text: '\uFFFD', truncated: true })
  })

  it('stores a binary media body as the text the transport decoded', () => {
    expect(prepareBody('raw', 1_024)).toEqual({ body: 'raw', truncated: false })
  })

  it('reports truncation from the cap', () => {
    expect(prepareBody('abcdef', 3)).toEqual({ body: 'abc', truncated: true })
  })
})

describe('capture store', () => {
  it('caps retained flows at maxFlows and keeps the newest', () => {
    const store = new CaptureStore(() => limits({ maxFlows: 2 }))
    store.append(exchange({ target: 'http://one/' }))
    store.append(exchange({ target: 'http://two/' }))
    store.append(exchange({ target: 'http://three/' }))
    expect(store.list().map(flow => flow.target)).toEqual(['http://three/', 'http://two/'])
    expect(store.stats(false)).toMatchObject({ retained: 2, total: 3 })
  })

  it('prunes entries past the retention window', () => {
    let now = 1_000
    const store = new CaptureStore(() => limits({ retentionMs: 1_000 }), () => now)
    store.append(exchange({ at: now }))
    now = 2_500
    expect(store.list()).toEqual([])
  })

  it('filters by session, kind, text, and limit', () => {
    const store = new CaptureStore(() => limits({ maxFlows: 10 }))
    store.append(exchange({ sessionId: 'a', target: 'http://alpha/' }))
    store.append(exchange({ sessionId: 'b', target: 'http://beta/', kind: 'tunnel', method: 'CONNECT', status: null }))
    expect(store.list({ sessionId: 'a' })).toHaveLength(1)
    expect(store.list({ kind: 'tunnel' })[0]?.target).toBe('http://beta/')
    expect(store.list({ text: 'ALPHA' })[0]?.target).toBe('http://alpha/')
    expect(store.list({ limit: 1 })).toHaveLength(1)
  })

  it('stores headers verbatim and a detail view that matches the list row', () => {
    const store = new CaptureStore(() => limits())
    const stored = store.append(exchange({
      responseHeaders: [['set-cookie', 'session=secret'], ['content-type', 'text/plain']],
      responseBody: 'hello',
    }))
    expect(stored).toBeDefined()
    const row = store.list()[0]
    expect(row).toBeDefined()
    const detail = store.detail(row?.id ?? '')
    expect(detail).toMatchObject({ target: 'http://target.test/', status: 200, contentType: 'text/plain', responseBody: 'hello' })
    expect(detail?.responseHeaders).toContainEqual({ name: 'set-cookie', value: 'session=secret' })
  })

  it('reports clipping from the stored body when the cap cuts it', () => {
    const store = new CaptureStore(() => limits({ maxBodyBytes: 32 }))
    store.append(exchange({ contentType: 'application/json', responseBody: JSON.stringify({ token: 'x', label: 'test' }) }))
    store.append(exchange({ contentType: 'application/json', responseBody: JSON.stringify({ token: 'x'.repeat(80) }) }))
    const [lengthened, shortened] = store.snapshot({}, false).flows
    expect(shortened).toMatchObject({ responseBody: '{"token":"x","label":"test"}', bodyTruncated: false })
    expect(lengthened?.bodyTruncated).toBe(true)
  })

  it('reports storage clipping on each body alongside earlier response clipping', () => {
    const store = new CaptureStore(() => limits({ maxBodyBytes: 32 }))
    store.append(exchange({ requestBody: 'x'.repeat(35), responseBody: 'x'.repeat(40), responseCaptureLimit: 'read' }))
    const [detail] = store.snapshot({}, false).flows
    expect(detail).toMatchObject({
      bodyTruncated: true, bodyLimits: { requestStorage: true, responseCapture: 'read', responseStorage: true },
    })
  })

  it('keeps a partial JSON body verbatim from a capped read', () => {
    const store = new CaptureStore(() => limits())
    const contentType = 'application/json'
    store.append(exchange({ contentType, bodyTruncated: true, responseBody: '{"token":"fixture' }))
    store.append(exchange({ contentType, bodyTruncated: true, responseBody: '{"token":"fixture","label":"sample"}' }))

    const [complete, partial] = store.snapshot({}, false).flows
    expect(complete).toMatchObject({ bodyTruncated: true, responseBody: '{"token":"fixture","label":"sample"}' })
    expect(partial).toMatchObject({ bodyTruncated: true, responseBody: '{"token":"fixture' })
    expect(store.detail(partial?.id ?? '')?.responseBody).toBe(partial?.responseBody)
  })

  it('clears everything and keeps the lifetime total', () => {
    const store = new CaptureStore(() => limits())
    store.append(exchange())
    store.clear()
    expect(store.list()).toEqual([])
    expect(store.stats(true)).toEqual({ paused: true, total: 1, retained: 0, bytes: 0 })
  })

  it('exports all matching retained details beyond the list ceiling', () => {
    const store = new CaptureStore(() => limits({ maxFlows: 650 }), () => 1_000)
    for (let index = 0; index < 600; index += 1) store.append(exchange({ at: 1_000, target: `http://target.test/${index}` }))
    expect(store.list({ limit: 5_000 })).toHaveLength(500)
    const data = store.snapshot({}, true)
    expect(data).toMatchObject({ format: 'dshu-security-proxy-capture', version: 1, exportedAt: 1_000,
      filtered: false, capture: { paused: true, total: 600, retained: 600 } })
    expect(data.flows).toHaveLength(600)
    expect(data.flows[0]).toMatchObject({ target: 'http://target.test/599', responseBody: 'hello' })
  })

  it('exports stored credentials, truncation and opaque tunnel metadata', () => {
    const store = new CaptureStore(() => limits({ maxBodyBytes: 32 }), () => 1_000)
    store.append(exchange({ at: 1_000, target: 'https://user:password@target.test/?token=secret',
      requestHeaders: [['Authorization', 'Bearer hidden']], responseBody: 'x'.repeat(64) }))
    store.append(exchange({ at: 1_000, kind: 'tunnel', origin: 'proxy', target: 'other.test:443', method: 'CONNECT',
      requestBody: null, responseBody: null, status: null, note: 'tunnel-metadata-only' }))
    const data = store.snapshot({ sessionId: 'session-a' }, false)
    expect(data.filtered).toBe(true)
    expect(data.flows[0]).toMatchObject({ kind: 'tunnel', responseBody: null, note: 'tunnel-metadata-only' })
    expect(data.flows[1]).toMatchObject({ bodyTruncated: true, responseBody: 'x'.repeat(32),
      target: 'https://user:password@target.test/?token=secret',
      requestHeaders: [{ name: 'Authorization', value: 'Bearer hidden' }] })
    expect(store.snapshot({ text: 'CONNECT', kind: 'tunnel' }, false).flows).toHaveLength(1)
  })

  it('returns no detail for an unknown identity', () => {
    const store = new CaptureStore(() => limits())
    expect(store.detail('missing')).toBeUndefined()
  })

  it('stores a request body under a password field name verbatim', () => {
    const store = new CaptureStore(() => limits())
    store.append(exchange({
      requestHeaders: [['content-type', 'application/json']],
      requestBody: JSON.stringify({ password: 'pw', keep: true }),
      responseBody: null,
    }))
    const body = store.list()[0]
    expect(body).toBeDefined()
    expect(store.detail(body?.id ?? '')?.requestBody).toBe('{"password":"pw","keep":true}')
  })
})
