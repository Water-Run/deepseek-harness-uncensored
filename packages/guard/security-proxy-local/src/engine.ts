/**
 * The security-mode egress engine: one configured upstream proxy, one bounded
 * capture store, one loopback chain proxy per conversation, and the controlled
 * Client that records plaintext for the application's own HTTPS requests.
 *
 * Nothing here installs a process-wide dispatcher, changes the operating
 * system's proxy settings, or touches another Agent's environment. Mode coverage
 * is decided from the Agent's durable session record by the caller-supplied
 * `presetOf`, never from a tool argument.
 * @module @deepseek-ai/dsh-security-proxy-local/engine
 */

import { fetch as undiciFetch, type ProxyAgent } from 'undici'
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import {
  classifyContentType,
  decoderForCharset,
  isSameOrigin,
  parseCharset,
  validateFetchUrl,
} from '@deepseek-ai/dsh-web-fetch-http'
import type {
  SecurityProxyCoverage,
  SecurityProxyFailure,
  SecurityProxyFlowDetail,
  SecurityProxyFlowQuery,
  SecurityProxyFlowSummary,
  SecurityProxySettingsPatch,
  SecurityProxyState,
  SecurityProxyStatus,
  SecurityProxyTestResult,
} from '@deepseek-ai/dsh-security-proxy/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { CaptureStore, prepareBody, redactHeaders, type CapturedExchangeInput } from './capture.ts'
import { SessionChainProxy } from './chain.ts'
import { applyPatch, assertUpstream, SettingsStore, type StoredSettings } from './settings.ts'
import {
  checkUpstream,
  classifyFailure,
  createDispatcher,
  describeFailure,
  proxyUrl,
  UpstreamFailure,
  type Upstream,
} from './upstream.ts'

/** The preset whose sessions this proxy serves. */
export const SECURITY_PRESET = 'security'

/** One connection's cryptographic material; stored by the credential provider, read per operation. */
export interface PasswordVault {
  /** Whether a password record exists. */
  present(): Promise<boolean>
  /** The stored password, or undefined when unset. */
  resolve(): Promise<string | undefined>
  /** Store a new password, or remove the record when given null. */
  save(value: string | null): Promise<void>
}

/**
 * The one fact coverage needs about an execution: the conversation it belongs
 * to. An Agent satisfies this, and a test supplies one directly.
 */
export interface EgressSubject {
  readonly session: { readonly id: SessionId }
}

/** What the engine needs from its owner to run. */
export interface EngineOptions {
  readonly store: SettingsStore
  readonly capture: CaptureStore
  readonly vault: PasswordVault
  /** Preset the subject's session currently records; `security` is the only covered value. */
  presetOf(subject: EgressSubject): string
  /** The subject's conversation identity, used for attribution and chain listeners. */
  sessionIdOf(subject: EgressSubject): SessionId
  /** Target the connection check asks the upstream to reach. */
  readonly testTarget: { readonly host: string; readonly port: number }
  /** Whole-handshake budget for the check and for CONNECT tunnels. */
  readonly connectTimeoutMs: number
  /** Whole-request budget for one forwarded or controlled request. */
  readonly requestTimeoutMs: number
  /** Same-origin redirect hops the controlled Client follows. */
  readonly maxRedirects: number
  /** Decoded body character cap for the controlled Client. */
  readonly maxBodyChars: number
  /** Response byte cap for the controlled Client. */
  readonly maxResponseBytes: number
  /** `User-Agent` the controlled Client sends. */
  readonly userAgent: string
  /** Called once per session when a covered call runs with the proxy off. */
  readonly warnDisabled?: (sessionId: SessionId) => void
  /** Clock for flow timestamps and retention. */
  readonly now?: () => number
  /** Contained diagnostic sink. */
  readonly log?: (message: string, error?: unknown) => void
}

/** Coverage this build can state honestly; the Client localizes every code. */
const COVERAGE: readonly SecurityProxyCoverage[] = [
  { id: 'web_fetch', code: 'captured' },
  { id: 'shell', code: 'partial' },
  { id: 'browser', code: 'uncovered' },
  { id: 'mcp', code: 'uncovered' },
  { id: 'model_api', code: 'uncovered' },
]

/** One session's loopback listener and the tool name most recently seen for it. */
interface ChainRecord {
  tool: string
  readonly proxy: Promise<SessionChainProxy>
}

/**
 * Owns the proxy's whole runtime. One instance serves every conversation in the
 * Host; attribution and child environments are per session.
 */
export class SecurityProxyEngine {
  private statusValue: SecurityProxyStatus = 'off'
  private failureValue: SecurityProxyFailure | null = null
  private detailValue: string | null = null
  private checkedAtValue: number | null = null
  private latencyValue: number | null = null
  private dispatcher: ProxyAgent | undefined
  private dispatcherKey: string | undefined
  private upstreamNow: Upstream | undefined
  private readonly chains = new Map<string, ChainRecord>()
  private readonly warned = new Set<string>()
  private closing = false

  /**
   * @param options - store, capture, credential vault, and deployment limits.
   */
  constructor(private readonly options: EngineOptions) {
    this.statusValue = options.store.value.enabled ? 'connecting' : 'off'
  }

  /** The capture store this engine writes into. */
  get capture(): CaptureStore {
    return this.options.capture
  }

  /**
   * Verify the configured upstream over a real proxy path, and publish the
   * resulting status.
   * @returns the check outcome and the state after it.
   */
  async test(): Promise<SecurityProxyTestResult> {
    const settings = this.options.store.value
    this.checkedAtValue = this.now()
    this.statusValue = settings.enabled ? 'connecting' : 'off'
    const started = performance.now()
    try {
      const { upstream } = await this.ensureTransport()
      const latency = await checkUpstream(
        upstream,
        this.options.testTarget.host,
        this.options.testTarget.port,
        this.options.connectTimeoutMs,
      )
      this.latencyValue = latency
      this.failureValue = null
      this.detailValue = null
      this.statusValue = settings.enabled ? 'ready' : 'off'
      return {
        ok: true,
        durationMs: Math.round(performance.now() - started),
        failure: null,
        detail: null,
        state: await this.state(),
      }
    } catch (error: unknown) {
      const failure = classifyFailure(error)
      this.failureValue = failure
      this.detailValue = describeFailure(error)
      this.latencyValue = null
      this.statusValue = settings.enabled ? 'failed' : 'off'
      return {
        ok: false,
        durationMs: Math.round(performance.now() - started),
        failure,
        detail: this.detailValue,
        state: await this.state(),
      }
    }
  }

  /**
   * Merge one settings patch, persist it, and re-verify when the transport changed.
   * @param patch - owner-edited fields.
   * @returns the state after the write.
   */
  async configure(patch: SecurityProxySettingsPatch): Promise<SecurityProxyState> {
    const previous = this.options.store.value
    const next = applyPatch(previous, patch)
    if (next.enabled) assertUpstream(next.host, next.port)
    await this.options.store.write(next)
    const transportChanged = previous.enabled !== next.enabled
      || previous.protocol !== next.protocol
      || previous.host !== next.host
      || previous.port !== next.port
      || previous.authEnabled !== next.authEnabled
      || previous.username !== next.username
    if (!transportChanged) return await this.state()
    await this.resetTransport()
    if (!next.enabled) {
      this.statusValue = 'off'
      this.failureValue = null
      this.detailValue = null
      return await this.state()
    }
    this.statusValue = 'connecting'
    await this.test()
    return await this.state()
  }

  /**
   * Store or remove the upstream password, then re-verify when the proxy is on.
   * @param password - the new secret, or null to remove the record.
   * @returns the state after the change.
   */
  async setPassword(password: string | null): Promise<SecurityProxyState> {
    if (password !== null && password === '') {
      throw new UpstreamFailure('auth', 'the upstream proxy password must not be empty')
    }
    await this.options.vault.save(password)
    await this.resetTransport()
    if (this.options.store.value.enabled) {
      this.statusValue = 'connecting'
      await this.test()
    }
    return await this.state()
  }

  /**
   * Read the whole surface state.
   * @returns settings, status, counters, and coverage.
   */
  async state(): Promise<SecurityProxyState> {
    const settings = this.options.store.value
    const hasPassword = await this.options.vault.present()
    return {
      settings: { ...settings, hasPassword },
      status: this.statusValue,
      failure: this.failureValue,
      detail: this.detailValue,
      checkedAt: this.checkedAtValue,
      latencyMs: this.latencyValue,
      capture: this.options.capture.stats(settings.capturePaused),
      listeners: this.chains.size,
      coverage: COVERAGE,
    }
  }

  /**
   * Decide whether one tool execution is covered.
   * @param subject - the Agent executing the call.
   * @param tool - the model-facing tool name.
   * @returns the route, or undefined when the session is not covered or the feature is off.
   */
  route(subject: EgressSubject | undefined, tool: string): { sessionId: SessionId; preset: string; tool: string } | undefined {
    if (subject === undefined || this.closing) return undefined
    const preset = this.options.presetOf(subject)
    if (preset !== SECURITY_PRESET) return undefined
    const sessionId = this.options.sessionIdOf(subject)
    const settings = this.options.store.value
    if (!settings.enabled) {
      // One reminder per conversation: the first covered call is the signal a
      // user gets; repeating it on every tool call would be noise.
      if (settings.warnWhenDisabled && !this.warned.has(sessionId)) {
        this.warned.add(sessionId)
        this.options.warnDisabled?.(sessionId)
      }
      return undefined
    }
    return { sessionId, preset, tool }
  }

  /**
   * Environment a child process needs to reach the chain proxy that belongs to
   * its own session.
   * @param subject - the Agent executing the call.
   * @param tool - the model-facing tool name.
   * @returns the overlay for one spawn, or undefined when not covered.
   */
  async environment(subject: EgressSubject | undefined, tool: string): Promise<Readonly<Record<string, string>> | undefined> {
    const route = this.route(subject, tool)
    if (route === undefined) return undefined
    await this.ensureTransport()
    const proxy = await this.chainFor(route.sessionId, tool)
    const url = `http://127.0.0.1:${String(proxy.port)}`
    return {
      HTTP_PROXY: url,
      HTTPS_PROXY: url,
      ALL_PROXY: url,
      http_proxy: url,
      https_proxy: url,
      all_proxy: url,
      // The proxy itself is the only loopback endpoint a child should treat
      // specially; a target on loopback is still a target of this engagement.
      NO_PROXY: '',
      no_proxy: '',
    }
  }

  /**
   * Retrieve one target through the upstream, recording the exchange at the
   * controlled Client layer.
   * @param subject - the Agent executing the call.
   * @param url - absolute HTTP(S) target.
   * @param signal - caller cancellation.
   * @returns the decoded response.
   */
  async fetchTarget(subject: EgressSubject | undefined, url: string, signal: AbortSignal): Promise<WebFetchResult> {
    const route = this.route(subject, 'web_fetch')
    if (route === undefined) {
      throw new WebError('the security-mode proxy does not cover this request', 'SECURITY_PROXY_NOT_COVERED')
    }
    const { dispatcher } = await this.ensureTransport()
    return await this.retrieve(url, dispatcher, route.sessionId, 'web_fetch', signal)
  }

  /**
   * List retained flows, newest first.
   * @param query - optional filters.
   * @returns matching summaries.
   */
  list(query: SecurityProxyFlowQuery = {}): SecurityProxyFlowSummary[] {
    return this.options.capture.list(query)
  }

  /**
   * Read one flow's stored detail.
   * @param id - flow identity.
   * @returns the detail, or null when pruned or unknown.
   */
  detail(id: string): SecurityProxyFlowDetail | null {
    return this.options.capture.detail(id) ?? null
  }

  /** Drop every retained flow. */
  clear(): void {
    this.options.capture.clear()
  }

  /**
   * Pause or resume capture. Pausing keeps forwarding and existing rows.
   * @param paused - whether new flows are refused.
   * @returns the state after the change.
   */
  async setPaused(paused: boolean): Promise<SecurityProxyState> {
    const next = applyPatch(this.options.store.value, { capturePaused: paused })
    await this.options.store.write(next)
    return await this.state()
  }

  /**
   * Close one conversation's chain listener and forget its reminder state.
   * @param sessionId - the disposed conversation.
   */
  forgetSession(sessionId: SessionId): void {
    this.warned.delete(sessionId)
    const record = this.chains.get(sessionId)
    if (record === undefined) return
    this.chains.delete(sessionId)
    void record.proxy.then(proxy => proxy.close(), () => undefined)
  }

  /** Close every listener, dispatcher, and in-flight request. */
  async dispose(): Promise<void> {
    this.closing = true
    await this.closeChains()
    await this.closeDispatcher()
  }

  /** Resolve the upstream and dispatcher for the current settings, rebuilding them when the key changed. */
  private async ensureTransport(): Promise<{ upstream: Upstream; dispatcher: ProxyAgent }> {
    if (this.closing) throw new UpstreamFailure('unknown', 'the security proxy is closing')
    const settings: StoredSettings = this.options.store.value
    if (!settings.enabled) {
      throw new UpstreamFailure('invalid-config', 'the security proxy is disabled')
    }
    const password = settings.authEnabled ? await this.options.vault.resolve() : undefined
    const upstream: Upstream = {
      protocol: settings.protocol,
      host: settings.host,
      port: settings.port,
      username: settings.username,
      password,
    }
    const key = `${proxyUrl(upstream)}|${settings.authEnabled ? `${settings.username}:${password ?? ''}` : ''}`
    if (this.dispatcher === undefined || this.dispatcherKey !== key) {
      await this.closeDispatcher()
      this.dispatcher = createDispatcher(upstream)
      this.dispatcherKey = key
    }
    this.upstreamNow = upstream
    return { upstream, dispatcher: this.dispatcher }
  }

  /** Close the dispatcher so the next request rebuilds it from current settings. */
  private async closeDispatcher(): Promise<void> {
    const dispatcher = this.dispatcher
    this.dispatcher = undefined
    this.dispatcherKey = undefined
    this.upstreamNow = undefined
    if (dispatcher !== undefined) await dispatcher.close().catch(() => undefined)
  }

  /** Close every session listener; used on reconfiguration and disposal. */
  private async closeChains(): Promise<void> {
    const records = [...this.chains.values()]
    this.chains.clear()
    for (const record of records) {
      const proxy = await record.proxy.catch(() => undefined)
      await proxy?.close()
    }
  }

  /** Close the dispatcher and listeners before a settings change takes effect. */
  private async resetTransport(): Promise<void> {
    await this.closeChains()
    await this.closeDispatcher()
  }

  /** Return the session's chain listener, starting it on first use. */
  private async chainFor(sessionId: SessionId, tool: string): Promise<SessionChainProxy> {
    const existing = this.chains.get(sessionId)
    if (existing !== undefined) {
      existing.tool = tool
      return await existing.proxy
    }
    const record: ChainRecord = {
      tool,
      proxy: SessionChainProxy.start({
        sessionId,
        tool: () => record.tool,
        upstream: () => {
          if (this.upstreamNow === undefined) throw new UpstreamFailure('invalid-config', 'the security proxy has no upstream configured')
          return this.upstreamNow
        },
        dispatcher: () => {
          if (this.dispatcher === undefined) throw new UpstreamFailure('invalid-config', 'the security proxy has no dispatcher configured')
          return this.dispatcher
        },
        capture: this.options.capture,
        paused: () => this.options.store.value.capturePaused,
        timeoutMs: this.options.requestTimeoutMs,
        ...this.options.now === undefined ? {} : { now: this.options.now },
      }),
    }
    this.chains.set(sessionId, record)
    record.proxy.catch(() => { this.chains.delete(sessionId) })
    return await record.proxy
  }

  /** Follow same-origin redirects, read a capped body, and record the exchange. */
  private async retrieve(
    url: string,
    dispatcher: ProxyAgent,
    sessionId: SessionId,
    tool: string,
    signal: AbortSignal,
  ): Promise<WebFetchResult> {
    let current = validateFetchUrl(url)
    let redirects = 0
    for (;;) {
      const at = this.now()
      const startedAt = performance.now()
      const timeout = AbortSignal.timeout(this.options.requestTimeoutMs)
      const fused = AbortSignal.any([signal, timeout])
      let response
      try {
        response = await undiciFetch(current, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'user-agent': this.options.userAgent,
            'accept': 'text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8',
          },
          signal: fused,
          dispatcher,
        })
      } catch (error: unknown) {
        this.recordFailure(at, startedAt, sessionId, tool, current.toString(), error)
        this.markFailed(error)
        throw toWebError(error, signal, timeout)
      }

      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (redirects >= this.options.maxRedirects) {
          this.recordFailure(at, startedAt, sessionId, tool, current.toString(), new WebError(`exceeded the maximum of ${String(this.options.maxRedirects)} redirects`, 'WEB_REDIRECT_BLOCKED'))
          throw new WebError(`exceeded the maximum of ${String(this.options.maxRedirects)} redirects`, 'WEB_REDIRECT_BLOCKED')
        }
        if (location === null) {
          this.recordFailure(at, startedAt, sessionId, tool, current.toString(), new WebError('redirect without Location', 'WEB_PROVIDER_ERROR'))
          throw new WebError(`redirect response (HTTP ${String(response.status)}) without a Location header`, 'WEB_PROVIDER_ERROR')
        }
        const next = new URL(location, current)
        let validated: URL
        try {
          validated = validateFetchUrl(next.toString())
          if (!isSameOrigin(validated, current)) {
            throw new WebError(`cross-origin redirect to ${validated.origin} is not followed automatically; retry against that URL directly`, 'WEB_REDIRECT_BLOCKED')
          }
        } catch (error: unknown) {
          this.recordFailure(at, startedAt, sessionId, tool, current.toString(), error)
          throw error
        }
        this.record({
          at,
          kind: 'http',
          origin: 'client',
          sessionId,
          tool,
          method: 'GET',
          target: current.toString(),
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
          requestBytes: 0,
          responseBytes: 0,
          outcome: 'complete',
          note: 'redirect',
          requestHeaders: [['user-agent', this.options.userAgent]],
          responseHeaders: [...response.headers],
          requestBody: null,
          responseBody: null,
          contentType: null,
        })
        redirects += 1
        current = validated
        continue
      }

      const contentType = response.headers.get('content-type')
      let kind
      try {
        kind = classifyContentType(contentType)
        if (kind === undefined) throw new WebError(`unsupported content type "${contentType ?? 'unknown'}"`, 'WEB_UNSUPPORTED_CONTENT_TYPE')
      } catch (error: unknown) {
        await response.body?.cancel()
        this.recordResponse(at, startedAt, sessionId, tool, current, response.status, [...response.headers], contentType, null, error)
        throw error
      }
      const { bytes, truncatedByBytes } = await this.readCapped(response, signal, timeout).catch((error: unknown) => {
        this.recordResponse(at, startedAt, sessionId, tool, current, response.status, [...response.headers], contentType, null, error)
        throw error
      })
      const decoder = decoderForCharset(parseCharset(contentType))
      const decoded = decoder.decode(bytes)
      const truncatedByChars = decoded.length > this.options.maxBodyChars
      const content = truncatedByChars ? decoded.slice(0, this.options.maxBodyChars) : decoded
      this.recordResponse(at, startedAt, sessionId, tool, current, response.status, [...response.headers], contentType, decoded, null)
      return {
        url: current.toString(),
        statusCode: response.status,
        body: kind === 'html' ? { kind: 'html', content } : { kind: 'text', content },
        truncated: truncatedByBytes || truncatedByChars,
      }
    }
  }

  /** Read a response body up to the byte cap. */
  private async readCapped(
    response: Awaited<ReturnType<typeof undiciFetch>>,
    signal: AbortSignal,
    timeout: AbortSignal,
  ): Promise<{ bytes: Uint8Array; truncatedByBytes: boolean }> {
    const declared = response.headers.get('content-length')
    if (declared !== null) {
      const length = Number(declared)
      if (Number.isFinite(length) && length > this.options.maxResponseBytes) {
        await response.body?.cancel()
        const error = new WebError(`response exceeds the maximum of ${String(this.options.maxResponseBytes)} bytes`, 'WEB_FETCH_TOO_LARGE')
        this.markFailed(error)
        throw error
      }
    }
    if (response.body === null) return { bytes: new Uint8Array(0), truncatedByBytes: false }
    const chunks: Uint8Array[] = []
    let total = 0
    let truncatedByBytes = false
    const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const remaining = this.options.maxResponseBytes - total
        if (value.byteLength > remaining) {
          chunks.push(value.subarray(0, remaining))
          total += remaining
          truncatedByBytes = true
          break
        }
        chunks.push(value)
        total += value.byteLength
      }
    } catch (error: unknown) {
      throw toWebError(error, signal, timeout)
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { bytes, truncatedByBytes }
  }

  /** Record one completed controlled exchange. */
  private recordResponse(
    at: number,
    startedAt: number,
    sessionId: SessionId,
    tool: string,
    url: URL,
    status: number,
    responseHeaders: readonly (readonly [string, string])[],
    contentType: string | null,
    decoded: string | null,
    error: unknown,
  ): void {
    this.record({
      at,
      kind: 'http',
      origin: 'client',
      sessionId,
      tool,
      method: 'GET',
      target: url.toString(),
      status,
      durationMs: Math.round(performance.now() - startedAt),
      requestBytes: 0,
      responseBytes: decoded === null ? 0 : Buffer.byteLength(decoded, 'utf8'),
      outcome: error === null ? 'complete' : 'error',
      note: error === null ? null : error instanceof WebError ? error.code : 'error',
      requestHeaders: [['user-agent', this.options.userAgent]],
      responseHeaders,
      requestBody: null,
      responseBody: decoded,
      contentType,
    })
  }

  /** Record a controlled exchange that never produced a response. */
  private recordFailure(at: number, startedAt: number, sessionId: SessionId, tool: string, target: string, error: unknown): void {
    this.record({
      at,
      kind: 'http',
      origin: 'client',
      sessionId,
      tool,
      method: 'GET',
      target,
      status: null,
      durationMs: Math.round(performance.now() - startedAt),
      requestBytes: 0,
      responseBytes: 0,
      outcome: 'error',
      note: error instanceof WebError ? error.code : classifyFailure(error),
      requestHeaders: [['user-agent', this.options.userAgent]],
      responseHeaders: [],
      requestBody: null,
      responseBody: null,
      contentType: null,
    })
  }

  /** Append one exchange unless the owner paused capture. */
  private record(input: CapturedExchangeInput): void {
    if (this.options.store.value.capturePaused) return
    this.options.capture.append(input)
  }

  /** Mark the upstream unreachable after a transport failure, without touching a target's own status. */
  private markFailed(error: unknown): void {
    if (error instanceof WebError) return
    const failure = classifyFailure(error)
    if (failure === 'unknown') return
    this.failureValue = failure
    this.detailValue = describeFailure(error)
    this.statusValue = this.options.store.value.enabled ? 'failed' : 'off'
  }

  /** Current clock. */
  private now(): number {
    return this.options.now?.() ?? Date.now()
  }
}

/** Redirect statuses the controlled Client follows. */
function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

/** Translate a fetch or body-read failure into the web seam's error type. */
function toWebError(error: unknown, signal: AbortSignal, timeout: AbortSignal): WebError {
  if (error instanceof WebError) return error
  if (timeout.aborted) return new WebError('web fetch timed out', 'WEB_FETCH_TIMEOUT', { cause: error })
  if (signal.aborted) return new WebError('web fetch aborted', 'WEB_ABORTED', { cause: error })
  const failure = classifyFailure(error)
  const code = failure === 'timeout'
    ? 'WEB_FETCH_TIMEOUT'
    : failure === 'auth'
      ? 'SECURITY_PROXY_AUTH'
      : failure === 'unreachable'
        ? 'SECURITY_PROXY_UNREACHABLE'
        : 'WEB_PROVIDER_ERROR'
  return new WebError(`web fetch failed: ${describeFailure(error)}`, code, { cause: error })
}

/** Re-export the body preparation helpers the service uses for its own tests. */
export { prepareBody, redactHeaders }
