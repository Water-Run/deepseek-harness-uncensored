/**
 * Bounded capture store for the security-mode egress proxy: flow identity,
 * default redaction, body caps, retention, and the list/detail reads the
 * settings surface performs.
 *
 * Redaction happens once, when a flow is appended. Everything downstream — the
 * list, the detail view, exports, and diagnostics — reads the stored value, so a
 * second presentation path cannot re-expose a credential.
 * @module @deepseek-ai/dsh-security-proxy-local/capture
 */

import { randomUUID } from 'node:crypto'
import type {
  SecurityProxyFlowDetail,
  SecurityProxyFlowKind,
  SecurityProxyFlowOrigin,
  SecurityProxyFlowQuery,
  SecurityProxyFlowSummary,
  SecurityProxyHeader,
} from '@deepseek-ai/dsh-security-proxy/types'

/** Header names whose values never reach the store. */
const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-csrf-token',
])

/** Object keys whose values are replaced before a body is stored. */
const SECRET_FIELDS = /^(?:pass(?:word|wd)?|secret|token|api[-_]?key|authorization|cookie|access[-_]?token|refresh[-_]?token)$/i

/** The marker stored in place of a redacted header or field value. */
const REDACTED = '[redacted]'

/** Bodies this large are described rather than decoded. */
const MAX_DECODED_BODY_BYTES = 1_048_576

/** One completed or in-flight exchange as the store keeps it. */
export interface CapturedExchange {
  readonly id: string
  readonly at: number
  readonly kind: SecurityProxyFlowKind
  readonly origin: SecurityProxyFlowOrigin
  readonly sessionId: string | null
  readonly tool: string
  readonly method: string
  readonly target: string
  readonly status: number | null
  readonly durationMs: number | null
  /** Bytes the peer sent for the request body, before the capture cap. */
  readonly requestBytes: number
  /** Bytes the peer sent for the response body, before the capture cap. */
  readonly responseBytes: number
  readonly outcome: 'complete' | 'error' | 'pending'
  readonly note: string | null
  readonly requestHeaders: readonly SecurityProxyHeader[]
  readonly responseHeaders: readonly SecurityProxyHeader[]
  readonly requestBody: string | null
  readonly responseBody: string | null
  readonly bodyTruncated: boolean
  readonly contentType: string | null
}

/** Capture limits the store enforces on every append. */
export interface CaptureLimits {
  readonly maxFlows: number
  readonly maxBodyBytes: number
  readonly retentionMs: number
}

/** Everything an append supplies; identity, outcome, and redaction are the store's. */
export type CapturedExchangeInput = Omit<
  CapturedExchange,
  'id' | 'requestHeaders' | 'responseHeaders' | 'requestBody' | 'responseBody' | 'bodyTruncated'
> & {
  readonly requestHeaders: readonly (readonly [string, string])[]
  readonly responseHeaders: readonly (readonly [string, string])[]
  readonly requestBody: string | null
  readonly responseBody: string | null
  readonly contentType: string | null
}

/**
 * Redact one header list.
 * @param headers - raw header entries in peer order.
 * @returns the entries with secret-bearing values replaced.
 */
export function redactHeaders(headers: readonly (readonly [string, string])[]): SecurityProxyHeader[] {
  return headers.map(([name, value]) => ({
    name,
    value: SECRET_HEADERS.has(name.toLowerCase()) ? REDACTED : value,
  }))
}

/**
 * Redact common secret fields in a textual body.
 *
 * JSON objects keep their keys and lose secret values; form-encoded bodies drop
 * the same names; any other textual media type is stored verbatim (it carries no
 * name/value structure to match). A body that does not parse as the media type it
 * claims is left untouched rather than mangled.
 * @param contentType - response or request media type, when known.
 * @param text - decoded body text.
 * @returns the body to store.
 */
export function redactBody(contentType: string | null, text: string): string {
  const media = (contentType ?? '').toLowerCase()
  if (media.includes('json')) {
    try {
      const parsed = JSON.parse(text) as unknown
      return JSON.stringify(redactJson(parsed, 0))
    } catch {
      // Not valid JSON despite the media type: store the text unchanged.
      return text
    }
  }
  if (media.includes('application/x-www-form-urlencoded')) {
    try {
      const params = new URLSearchParams(text)
      for (const key of [...params.keys()]) {
        if (SECRET_FIELDS.test(key)) params.set(key, REDACTED)
      }
      return params.toString()
    } catch {
      return text
    }
  }
  return text
}

/** Recursively replace secret-looking object values; depth is bounded by the body cap. */
function redactJson(value: unknown, depth: number): unknown {
  if (depth > 32 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(entry => redactJson(entry, depth + 1))
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SECRET_FIELDS.test(key) ? REDACTED : redactJson(entry, depth + 1)
  }
  return result
}

/**
 * Cut text at a UTF-8 byte budget without splitting a character.
 * @param text - text to cut.
 * @param maxBytes - inclusive byte budget.
 * @returns the prefix and whether anything was dropped.
 */
export function truncateBody(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes <= maxBytes) return { text, truncated: false }
  const decoded = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8')
  // A cut multi-byte character decodes as U+FFFD at the tail; drop that one unit so
  // the stored body never ends in a replacement character introduced by the cap.
  return { text: decoded.endsWith('\uFFFD') ? decoded.slice(0, -1) : decoded, truncated: true }
}

/**
 * Present a body for storage: binary media types are described, textual ones are
 * redacted and cut at the capture cap.
 * @param contentType - media type the body carries.
 * @param text - decoded text, or null when the caller kept no text.
 * @param maxBytes - capture cap in bytes.
 * @returns the stored body and whether a cap cut it.
 */
export function prepareBody(
  contentType: string | null,
  text: string | null,
  maxBytes: number,
): { body: string | null; truncated: boolean } {
  if (text === null) return { body: null, truncated: false }
  if (Buffer.byteLength(text, 'utf8') > MAX_DECODED_BODY_BYTES) {
    return { body: `[body omitted: ${String(Buffer.byteLength(text, 'utf8'))} bytes]`, truncated: true }
  }
  if (contentType !== null && isBinaryMedia(contentType)) {
    return { body: `[binary body omitted: ${contentType}]`, truncated: false }
  }
  const redacted = redactBody(contentType, text)
  const cut = truncateBody(redacted, maxBytes)
  return { body: cut.text, truncated: cut.truncated }
}

/** Whether a media type is clearly not text. */
function isBinaryMedia(contentType: string): boolean {
  const media = contentType.toLowerCase()
  return media.startsWith('image/')
    || media.startsWith('audio/')
    || media.startsWith('video/')
    || media.includes('octet-stream')
    || media.includes('application/pdf')
    || media.includes('application/zip')
}

/**
 * Ring buffer of captured exchanges for one Host.
 *
 * The store keeps at most `maxFlows` entries and prunes by age; every append and
 * read prunes first, so a stale entry cannot outlive its retention window. Bodies
 * are already capped and redacted by {@link prepareBody} and {@link redactHeaders}.
 */
export class CaptureStore {
  private entries: CapturedExchange[] = []
  private total = 0
  private retainedBytes = 0

  /**
   * @param limits - reads the current caps; a settings change applies to the next operation.
   * @param now - clock, injectable for retention tests.
   */
  constructor(
    private readonly limits: () => CaptureLimits,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Append one exchange, applying redaction and every storage cap.
   * @param input - the exchange the transport observed.
   * @returns the stored flow, or undefined when capture is paused.
   */
  append(input: CapturedExchangeInput): CapturedExchange | undefined {
    const limits = this.limits()
    this.prune(limits)
    const flow: CapturedExchange = {
      ...input,
      id: randomUUID(),
      requestHeaders: redactHeaders(input.requestHeaders),
      responseHeaders: redactHeaders(input.responseHeaders),
      requestBody: prepareBody(input.requestHeaders.find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? null, input.requestBody, limits.maxBodyBytes).body,
      responseBody: prepareBody(input.contentType, input.responseBody, limits.maxBodyBytes).body,
      bodyTruncated: isBodyTruncated(input, limits.maxBodyBytes),
    }
    this.entries.push(flow)
    this.total += 1
    this.retainedBytes += flowBytes(flow)
    while (this.entries.length > limits.maxFlows) this.dropOldest()
    return flow
  }

  /**
   * List retained flows newest first.
   * @param query - optional session, kind, text, and limit filters.
   * @returns matching summaries.
   */
  list(query: SecurityProxyFlowQuery = {}): SecurityProxyFlowSummary[] {
    this.prune(this.limits())
    const text = query.text?.trim().toLowerCase() ?? ''
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 200), 1), 500)
    const rows: SecurityProxyFlowSummary[] = []
    for (let index = this.entries.length - 1; index >= 0 && rows.length < limit; index -= 1) {
      const flow = this.entries[index]
      if (flow === undefined) continue
      if (query.sessionId !== undefined && flow.sessionId !== query.sessionId) continue
      if (query.kind !== undefined && flow.kind !== query.kind) continue
      if (text !== '' && !`${flow.method} ${flow.target} ${flow.tool}`.toLowerCase().includes(text)) continue
      rows.push(summaryOf(flow))
    }
    return rows
  }

  /**
   * Read one retained flow's complete stored value.
   * @param id - flow identity.
   * @returns the detail, or undefined when pruned or unknown.
   */
  detail(id: string): SecurityProxyFlowDetail | undefined {
    this.prune(this.limits())
    const flow = this.entries.find(entry => entry.id === id)
    if (flow === undefined) return undefined
    return {
      ...summaryOf(flow),
      requestHeaders: flow.requestHeaders,
      responseHeaders: flow.responseHeaders,
      requestBody: flow.requestBody,
      responseBody: flow.responseBody,
      bodyTruncated: flow.bodyTruncated,
      contentType: flow.contentType,
    }
  }

  /** Drop every retained flow. */
  clear(): void {
    this.entries = []
    this.retainedBytes = 0
  }

  /**
   * Current counters.
   * @param paused - whether new flows are currently refused.
   * @returns totals the settings surface renders.
   */
  stats(paused: boolean): { paused: boolean; total: number; retained: number; bytes: number } {
    this.prune(this.limits())
    return { paused, total: this.total, retained: this.entries.length, bytes: this.retainedBytes }
  }

  /** Drop entries older than the retention window, oldest first. */
  private prune(limits: CaptureLimits): void {
    const cutoff = this.now() - limits.retentionMs
    while (this.entries.length > 0 && (this.entries[0]?.at ?? 0) < cutoff) this.dropOldest()
  }

  /** Remove the oldest retained entry and its byte accounting. */
  private dropOldest(): void {
    const dropped = this.entries.shift()
    if (dropped !== undefined) this.retainedBytes -= flowBytes(dropped)
  }
}

/** Captured body bytes one flow contributes to the memory total. */
function flowBytes(flow: CapturedExchange): number {
  return Buffer.byteLength(flow.requestBody ?? '', 'utf8') + Buffer.byteLength(flow.responseBody ?? '', 'utf8')
}

/** Whether either stored body was cut by the capture cap. */
function isBodyTruncated(input: CapturedExchangeInput, maxBytes: number): boolean {
  for (const body of [input.requestBody, input.responseBody]) {
    if (body !== null && Buffer.byteLength(body, 'utf8') > maxBytes) return true
  }
  return false
}

/** Project the list row of one stored flow. */
function summaryOf(flow: CapturedExchange): SecurityProxyFlowSummary {
  return {
    id: flow.id,
    at: flow.at,
    kind: flow.kind,
    origin: flow.origin,
    sessionId: flow.sessionId,
    tool: flow.tool,
    method: flow.method,
    target: flow.target,
    status: flow.status,
    durationMs: flow.durationMs,
    requestBytes: flow.requestBytes,
    responseBytes: flow.responseBytes,
    outcome: flow.outcome,
    note: flow.note,
  }
}
