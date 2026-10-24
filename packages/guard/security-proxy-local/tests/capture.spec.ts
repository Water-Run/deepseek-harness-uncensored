import { describe, expect, it } from 'vitest'
import {
  CaptureStore,
  prepareBody,
  redactBody,
  redactHeaders,
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

describe('redaction', () => {
  it('masks every credential-bearing header and keeps the rest', () => {
    expect(redactHeaders([
      ['Authorization', 'Bearer secret'],
      ['proxy-authorization', 'Basic abc'],
      ['Cookie', 'a=1'],
      ['set-cookie', 'b=2'],
      ['accept', 'text/html'],
    ])).toEqual([
      { name: 'Authorization', value: '[redacted]' },
      { name: 'proxy-authorization', value: '[redacted]' },
      { name: 'Cookie', value: '[redacted]' },
      { name: 'set-cookie', value: '[redacted]' },
      { name: 'accept', value: 'text/html' },
    ])
  })

  it('masks secret JSON fields without losing the surrounding document', () => {
    const body = JSON.stringify({ user: 'ada', password: 'pw', nested: { token: 't', keep: 1 } })
    expect(JSON.parse(redactBody('application/json', body))).toEqual({
      user: 'ada',
      password: '[redacted]',
      nested: { token: '[redacted]', keep: 1 },
    })
  })

  it('masks secret form fields', () => {
    expect(redactBody('application/x-www-form-urlencoded', 'user=ada&api_key=k&page=2')).toBe('user=ada&api_key=%5Bredacted%5D&page=2')
  })

  it('leaves a body that does not parse as the media type it claims', () => {
    expect(redactBody('application/json', '{not json')).toBe('{not json')
    expect(redactBody('text/plain', 'password=pw')).toBe('password=pw')
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

  it('describes binary media instead of storing bytes', () => {
    expect(prepareBody('image/png', 'raw', 1_024)).toEqual({ body: '[binary body omitted: image/png]', truncated: false })
  })

  it('reports truncation from the cap', () => {
    expect(prepareBody('text/plain', 'abcdef', 3)).toEqual({ body: 'abc', truncated: true })
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

  it('stores redacted headers and a detail view that matches the list row', () => {
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
    expect(detail?.responseHeaders).toContainEqual({ name: 'set-cookie', value: '[redacted]' })
  })

  it('clears everything and keeps the lifetime total', () => {
    const store = new CaptureStore(() => limits())
    store.append(exchange())
    store.clear()
    expect(store.list()).toEqual([])
    expect(store.stats(true)).toEqual({ paused: true, total: 1, retained: 0, bytes: 0 })
  })

  it('returns no detail for an unknown identity', () => {
    const store = new CaptureStore(() => limits())
    expect(store.detail('missing')).toBeUndefined()
  })

  it('does not store a request body under a secret field name in JSON', () => {
    const store = new CaptureStore(() => limits())
    store.append(exchange({
      requestHeaders: [['content-type', 'application/json']],
      requestBody: JSON.stringify({ password: 'pw', keep: true }),
      responseBody: null,
    }))
    const body = store.list()[0]
    expect(body).toBeDefined()
    expect(store.detail(body?.id ?? '')?.requestBody).toBe('{"password":"[redacted]","keep":true}')
  })
})
