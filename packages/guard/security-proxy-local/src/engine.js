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
import { fetch as undiciFetch } from 'undici';
import { addAbortListener } from 'node:events';
import { WebError } from '@deepseek-ai/dsh-web';
import { classifyContentType, decoderForCharset, isSameOrigin, parseCharset, validateFetchUrl, } from '@deepseek-ai/dsh-web-fetch-http';
import { SessionChainProxy } from "./chain.js";
import { applyPatch, assertUpstream } from "./settings.js";
import { connectThrough, classifyFailure, createDispatcher, describeFailure, proxyUrl, UpstreamFailure, } from "./upstream.js";
/** The preset whose sessions this proxy serves. */
export const SECURITY_PRESET = 'security';
/** Coverage this build can state honestly; the Client localizes every code. */
const COVERAGE = [
    { id: 'web_fetch', code: 'captured' },
    { id: 'shell', code: 'partial' },
    { id: 'browser', code: 'partial' },
    { id: 'mcp', code: 'partial' },
    { id: 'delegates', code: 'partial' },
    { id: 'model_api', code: 'uncovered' },
];
function chainKey(sessionId, tool) {
    return JSON.stringify([sessionId, tool]);
}
function chainUrl(proxy) {
    return `http://127.0.0.1:${String(proxy.port)}`;
}
/**
 * Owns the proxy's whole runtime. One instance serves every conversation in the
 * Host; attribution and child environments are per session.
 */
export class SecurityProxyEngine {
    options;
    statusValue = 'off';
    failureValue = null;
    detailValue = null;
    checkedAtValue = null;
    latencyValue = null;
    dispatcher;
    dispatcherKey;
    upstreamNow;
    chains = new Map();
    retiringChains = new Set();
    egress = new Set();
    warned = new Set();
    closing = false;
    lifetime = new AbortController();
    generation = new AbortController();
    pending = new Set();
    disposal;
    changes = Promise.resolve();
    /**
     * @param options - store, capture, credential vault, and deployment limits.
     */
    constructor(options) {
        this.options = options;
        this.statusValue = options.store.value.enabled ? 'connecting' : 'off';
    }
    /** The capture store this engine writes into. */
    get capture() {
        return this.options.capture;
    }
    /** @returns Cancellation when this engine closes or its selected upstream changes. */
    executionSignal() { return AbortSignal.any([this.lifetime.signal, this.generation.signal]); }
    /** @returns A release callback for execution dependencies held through response cleanup. */
    retainExecution() { return () => { }; }
    async execute(action, caller) {
        if (this.closing)
            throw new UpstreamFailure('unknown', 'the security proxy is closing');
        const release = this.retainExecution();
        const settled = Promise.withResolvers();
        this.pending.add(settled.promise);
        try {
            const signal = AbortSignal.any([this.executionSignal(), ...caller === undefined ? [] : [caller]]);
            signal.throwIfAborted();
            return await action(signal);
        }
        finally {
            settled.resolve(true);
            this.pending.delete(settled.promise);
            release();
        }
    }
    change(action) {
        if (this.closing)
            return Promise.reject(new UpstreamFailure('unknown', 'the security proxy is closing'));
        const next = this.changes.then(() => {
            if (this.closing)
                throw new UpstreamFailure('unknown', 'the security proxy is closing');
            return action();
        });
        this.changes = next.then(() => undefined, () => undefined);
        return next;
    }
    assertOpen() {
        if (this.closing)
            throw new UpstreamFailure('unknown', 'the security proxy is closing');
    }
    /**
     * Send one hop through the selected transport without following redirects.
     * @param _upstream - Selected upstream, including private credentials.
     * @param dispatcher - Engine-owned pool for this upstream.
     * @param url - Original target URL.
     * @param request - Origin method, headers and bounded body.
     * @param signal - Caller, transport and engine cancellation.
     * @returns Response and cleanup to run after consuming or cancelling its body.
     */
    async requestHttp(_upstream, dispatcher, url, request, signal) {
        // proxy-exempt: uses the owner's independent Security proxy, isolated from the application's global proxy.
        const response = await undiciFetch(url, { ...request, redirect: 'manual', signal, dispatcher });
        return { response, close: () => Promise.resolve() };
    }
    /**
     * Open an opaque tunnel; an enforcing subclass must validate or refuse its effects before connecting.
     * @param upstream - Selected upstream with private credentials.
     * @param host - Requested destination hostname.
     * @param port - Destination port.
     * @param signal - Execution cancellation.
     * @returns Tunnel whose socket is owned by the relay until closure.
     */
    openTunnel(upstream, host, port, signal) {
        return connectThrough(upstream, host, port, this.options.connectTimeoutMs, signal);
    }
    /**
     * Bind request attribution for a route or Host check; subclasses may validate the live owner.
     * @param _sessionId - Route owner, or undefined for a Host-level connection check.
     * @returns The request runner; the default preserves the operation without adding context.
     */
    executionScope(_sessionId) {
        return operation => operation(this.executionSignal());
    }
    /**
     * Check a proxy path without forwarding application bytes.
     * @param upstream - Selected upstream with private credentials.
     * @param signal - Execution cancellation.
     * @returns The handshake latency in milliseconds.
     */
    async probe(upstream, signal) {
        const start = performance.now();
        const tunnel = await this.openTunnel(upstream, this.options.testTarget.host, this.options.testTarget.port, signal);
        if (!tunnel.socket.closed) {
            await new Promise((resolve) => { tunnel.socket.once('close', () => { resolve(); }); tunnel.socket.destroy(); });
        }
        if (tunnel.socket.errored !== null)
            throw tunnel.socket.errored;
        return Math.round(performance.now() - start);
    }
    /**
     * Verify the configured upstream over a real proxy path, and publish the
     * resulting status.
     * @returns the check outcome and the state after it.
     */
    async test() {
        return this.executionScope(undefined)(() => this.execute(signal => this.runTest(signal)));
    }
    async runTest(signal) {
        const settings = this.options.store.value;
        this.checkedAtValue = this.now();
        this.statusValue = settings.enabled ? 'connecting' : 'off';
        const started = performance.now();
        try {
            const { upstream } = await this.ensureTransport();
            const latency = await this.probe(upstream, signal);
            signal.throwIfAborted();
            this.latencyValue = latency;
            this.failureValue = null;
            this.detailValue = null;
            this.statusValue = settings.enabled ? 'ready' : 'off';
            return {
                ok: true,
                durationMs: Math.round(performance.now() - started),
                failure: null,
                detail: null,
                state: await this.state(),
            };
        }
        catch (error) {
            signal.throwIfAborted();
            const failure = classifyFailure(error);
            this.failureValue = failure;
            this.detailValue = describeFailure(error);
            this.latencyValue = null;
            this.statusValue = settings.enabled ? 'failed' : 'off';
            return {
                ok: false,
                durationMs: Math.round(performance.now() - started),
                failure,
                detail: this.detailValue,
                state: await this.state(),
            };
        }
    }
    /**
     * Merge one settings patch, persist it, and re-verify when the transport changed.
     * @param patch - owner-edited fields.
     * @returns the state after the write.
     */
    async configure(patch) {
        return this.change(() => this.configureNow(patch));
    }
    async configureNow(patch) {
        const previous = this.options.store.value;
        const next = applyPatch(previous, patch);
        if (next.enabled)
            assertUpstream(next.host, next.port);
        await this.options.store.write(next);
        const transportChanged = previous.enabled !== next.enabled
            || previous.protocol !== next.protocol
            || previous.host !== next.host
            || previous.port !== next.port
            || previous.authEnabled !== next.authEnabled
            || previous.username !== next.username;
        if (!transportChanged)
            return await this.state();
        await this.resetTransport();
        if (!next.enabled) {
            this.statusValue = 'off';
            this.failureValue = null;
            this.detailValue = null;
            return await this.state();
        }
        this.statusValue = 'connecting';
        await this.test();
        return await this.state();
    }
    /**
     * Store or remove the upstream password, then re-verify when the proxy is on.
     * @param password - the new secret, or null to remove the record.
     * @returns the state after the change.
     */
    async setPassword(password) {
        return this.change(() => this.setPasswordNow(password));
    }
    async setPasswordNow(password) {
        if (password !== null && password === '') {
            throw new UpstreamFailure('auth', 'the upstream proxy password must not be empty');
        }
        await this.options.vault.save(password);
        await this.resetTransport();
        if (this.options.store.value.enabled) {
            this.statusValue = 'connecting';
            await this.test();
        }
        return await this.state();
    }
    /**
     * Read the whole surface state.
     * @returns settings, status, counters, and coverage.
     */
    async state() {
        const settings = this.options.store.value;
        const hasPassword = await this.options.vault.present();
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
        };
    }
    /**
     * Decide whether one tool execution is covered.
     * @param subject - the Agent executing the call.
     * @param tool - the model-facing tool name.
     * @returns the route, or undefined when the session is not covered or the feature is off.
     */
    route(subject, tool) {
        if (subject === undefined || this.closing)
            return undefined;
        const preset = this.options.presetOf(subject);
        if (preset !== SECURITY_PRESET)
            return undefined;
        const sessionId = this.options.sessionIdOf(subject);
        const settings = this.options.store.value;
        if (!settings.enabled) {
            // One reminder per conversation: the first covered call is the signal a
            // user gets; repeating it on every tool call would be noise.
            if (settings.warnWhenDisabled && !this.warned.has(sessionId)) {
                this.warned.add(sessionId);
                this.options.warnDisabled?.(sessionId);
            }
            return undefined;
        }
        return { sessionId, preset, tool };
    }
    /**
     * Environment a child process needs to reach the chain proxy that belongs to
     * its own session.
     * @param subject - the Agent executing the call.
     * @param tool - the model-facing tool name.
     * @returns the overlay for one spawn, or undefined when not covered.
     */
    async environment(subject, tool) {
        const route = this.route(subject, tool);
        if (route === undefined)
            return undefined;
        return this.execute(async (signal) => {
            await this.ensureTransport();
            signal.throwIfAborted();
            const { proxy, certificate } = await this.chainFor(route.sessionId, tool);
            signal.throwIfAborted();
            const url = chainUrl(proxy);
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
                ...certificate === undefined ? {} : { DSH_SECURITY_PROXY_CA_PEM: certificate },
            };
        });
    }
    /**
     * Read trust material for an existing listener without issuing another one.
     * @param subject - Actual conversation owning the requested listener.
     * @param tool - Tool name bound to the listener.
     * @param server - Previously issued endpoint.
     * @returns Public certificate, null for opaque CONNECT, or undefined for an unissued route.
     */
    async issuedCertificate(subject, tool, server) {
        if (this.closing || !this.options.store.value.enabled || this.options.presetOf(subject) !== SECURITY_PRESET)
            return undefined;
        const key = chainKey(this.options.sessionIdOf(subject), tool);
        const record = this.chains.get(key);
        if (record === undefined)
            return undefined;
        const route = await this.resolveChain(key, record);
        return chainUrl(route.proxy) === server ? route.certificate ?? null : undefined;
    }
    /**
     * Retain this owner's upstream and capture for native enforcement.
     * @param subject - Actual executing conversation; absent or uncovered subjects acquire nothing.
     * @param tool - Attribution bound to the returned capture writer.
     * @param stop - Stop and join all delegated resources when the lease is revoked.
     * @param caller - Caller cancellation for admission and the published lease.
     * @param admission - Optional startup-only cancellation; omission adds no further signal.
     * @returns Covered lease, otherwise undefined. A route withdrawn during admission rejects.
     */
    async openEgress(subject, tool, stop, caller, admission) {
        const route = this.route(subject, tool);
        if (route === undefined) {
            if (this.closing && subject !== undefined && this.options.store.value.enabled && this.options.presetOf(subject) === SECURITY_PRESET) {
                this.assertOpen();
            }
            return undefined;
        }
        if ([...this.egress].some(record => record.phase === 'failed')) {
            throw new UpstreamFailure('unknown', 'Native egress cleanup is unconfirmed. Restart the Host before retrying.');
        }
        return this.execute(async (starting) => {
            const cancel = new AbortController(), completed = Promise.withResolvers();
            const signal = AbortSignal.any([this.executionSignal(), caller, cancel.signal]);
            let retained, abort, stopping;
            const record = {
                sessionId: route.sessionId, cancel, phase: 'opening', done: completed.promise,
                stop: () => { stopping ??= Promise.resolve().then(stop); return stopping; },
                release: (failure) => {
                    if (record.phase === 'released' || record.phase === 'failed')
                        return;
                    abort?.[Symbol.dispose]();
                    if (failure !== undefined) {
                        const error = new UpstreamFailure('unknown', 'Native egress cleanup is unconfirmed. Restart the Host before retrying.', { cause: failure.error });
                        record.phase = 'failed';
                        cancel.abort(error);
                        completed.reject(error);
                        this.markFailed(error);
                        return;
                    }
                    retained?.();
                    record.phase = 'released';
                    cancel.abort(new Error('Native egress was released.'));
                    this.egress.delete(record);
                    completed.resolve(undefined);
                },
            };
            // Provider shutdown observes failed closure even when the caller's cleanup throws first.
            void completed.promise.catch((_closureFailure) => { });
            this.egress.add(record);
            try {
                const { upstream } = await this.ensureTransport();
                starting.throwIfAborted();
                signal.throwIfAborted();
                if (this.route(subject, tool) === undefined)
                    throw new UpstreamFailure('invalid-config', 'The native egress route was withdrawn during admission.');
                retained = this.retainExecution();
                record.phase = 'leased';
                abort = addAbortListener(signal, () => {
                    void record.stop().then(() => { record.release(); }, (error) => { record.release({ error }); });
                });
                return {
                    upstream, signal, paused: () => this.options.store.value.capturePaused,
                    capture: { append: (input) => {
                            if (record.phase === 'released')
                                throw new UpstreamFailure('unknown', 'The native egress lease was released.');
                            if (this.options.store.value.capturePaused)
                                return undefined;
                            return this.options.capture.append({ ...input, sessionId: route.sessionId, tool: route.tool });
                        } },
                    release: (failure) => { record.release(failure); },
                };
            }
            catch (error) {
                record.release();
                throw error;
            }
        }, admission === undefined ? caller : AbortSignal.any([caller, admission]));
    }
    /**
     * Retrieve one target through the upstream, recording the exchange at the
     * controlled Client layer.
     * @param subject - the Agent executing the call.
     * @param url - absolute HTTP(S) target.
     * @param signal - caller cancellation.
     * @returns the decoded response.
     */
    async fetchTarget(subject, url, signal) {
        const route = this.route(subject, 'web_fetch');
        if (route === undefined) {
            throw new WebError('the security-mode proxy does not cover this request', 'SECURITY_PROXY_NOT_COVERED');
        }
        return this.executionScope(route.sessionId)(sourceSignal => this.execute(async (executionSignal) => {
            const { upstream, dispatcher } = await this.ensureTransport();
            executionSignal.throwIfAborted();
            return this.retrieve(url, upstream, dispatcher, route.sessionId, 'web_fetch', executionSignal);
        }, AbortSignal.any([signal, sourceSignal])));
    }
    /**
     * List retained flows, newest first.
     * @param query - optional filters.
     * @returns matching summaries.
     */
    list(query = {}) {
        return this.options.capture.list(query);
    }
    /**
     * Read one flow's stored detail.
     * @param id - flow identity.
     * @returns the detail, or null when pruned or unknown.
     */
    detail(id) {
        return this.options.capture.detail(id) ?? null;
    }
    /**
     * Build a complete stored snapshot within the configured export byte budget.
     * @param query - Filters without list pagination.
     * @returns Snapshot or an explicit budget refusal; no partial data is returned.
     */
    exportCapture(query) {
        this.assertOpen();
        const data = this.options.capture.snapshot(query, this.options.store.value.capturePaused);
        let bytes = Buffer.byteLength(JSON.stringify({ ...data, flows: [] }), 'utf8') + 1;
        for (const [index, flow] of data.flows.entries()) {
            bytes += Buffer.byteLength(JSON.stringify(flow), 'utf8') + (index === 0 ? 0 : 1);
            if (bytes > this.options.maxExportBytes)
                return { kind: 'too-large', maxBytes: this.options.maxExportBytes };
        }
        return bytes > this.options.maxExportBytes
            ? { kind: 'too-large', maxBytes: this.options.maxExportBytes } : { kind: 'ready', data };
    }
    /** Drop every retained flow. */
    clear() {
        this.options.capture.clear();
    }
    /**
     * Pause or resume capture. Pausing keeps forwarding and existing rows.
     * @param paused - whether new flows are refused.
     * @returns the state after the change.
     */
    async setPaused(paused) {
        return this.change(async () => {
            const next = applyPatch(this.options.store.value, { capturePaused: paused });
            await this.options.store.write(next);
            return await this.state();
        });
    }
    /**
     * Close one conversation's chain listeners and forget its reminder state.
     * @param sessionId - the disposed conversation.
     */
    forgetSession(sessionId) {
        this.warned.delete(sessionId);
        for (const record of this.egress) {
            if (record.sessionId === sessionId)
                record.cancel.abort(new Error('The native egress conversation was withdrawn.'));
        }
        for (const [key, record] of this.chains) {
            if (record.sessionId !== sessionId)
                continue;
            this.chains.delete(key);
            const closing = record.route.then(({ proxy }) => proxy.close(), () => undefined);
            this.retiringChains.add(closing);
            void closing.then(() => { this.retiringChains.delete(closing); }, (error) => {
                this.retiringChains.delete(closing);
                this.lifetime.abort(error);
                this.markFailed(error);
                this.options.log?.('security-proxy: session listener cleanup failed; reload the proxy provider', error);
            });
        }
    }
    /** Close every listener, dispatcher, and in-flight request. */
    dispose() {
        this.disposal ??= this.close();
        return this.disposal;
    }
    async close() {
        this.closing = true;
        this.lifetime.abort(new Error('Security proxy is closing.'));
        try {
            await this.closeRoutes();
        }
        finally {
            try {
                await this.closeDispatcher();
            }
            finally {
                await Promise.allSettled([...this.pending, this.changes]);
            }
        }
    }
    async closeRoutes() {
        const native = [...this.egress].map(async (record) => {
            record.cancel.abort(new Error('Native egress is closing.'));
            if (record.phase === 'leased' || record.phase === 'failed') {
                try {
                    await record.stop();
                    record.release();
                }
                catch (error) {
                    record.release({ error });
                }
            }
            await record.done;
        });
        const results = await Promise.allSettled([this.closeChains(), ...native]);
        const failures = [];
        for (const result of results)
            if (result.status === 'rejected')
                failures.push(result.reason);
        if (failures.length > 0)
            throw new AggregateError(failures, 'Security proxy routes failed to close.');
    }
    /** Resolve the upstream and dispatcher for the current settings, rebuilding them when the key changed. */
    async ensureTransport() {
        this.assertOpen();
        const settings = this.options.store.value;
        if (!settings.enabled) {
            throw new UpstreamFailure('invalid-config', 'the security proxy is disabled');
        }
        const password = settings.authEnabled ? await this.options.vault.resolve() : undefined;
        this.assertOpen();
        const upstream = {
            protocol: settings.protocol,
            host: settings.host,
            port: settings.port,
            username: settings.authEnabled ? settings.username : '',
            password,
        };
        const key = `${proxyUrl(upstream)}|${settings.authEnabled ? `${settings.username}:${password ?? ''}` : ''}`;
        if (this.dispatcher === undefined || this.dispatcherKey !== key) {
            await this.closeDispatcher();
            this.dispatcher = createDispatcher(upstream);
            this.dispatcherKey = key;
        }
        this.upstreamNow = upstream;
        // proxy-exempt: returns the same Security upstream and pool to this engine's consumers.
        return { upstream, dispatcher: this.dispatcher };
    }
    /** Close the dispatcher so the next request rebuilds it from current settings. */
    async closeDispatcher() {
        const dispatcher = this.dispatcher;
        this.dispatcher = undefined;
        this.dispatcherKey = undefined;
        this.upstreamNow = undefined;
        if (dispatcher !== undefined)
            await dispatcher.destroy();
    }
    /** Close every session listener; used on reconfiguration and disposal. */
    async closeChains() {
        const records = [...this.chains.values()];
        this.chains.clear();
        const results = await Promise.allSettled([...records.map(async (record) => {
                const route = await record.route.catch(() => undefined);
                await route?.proxy.close();
            }), ...this.retiringChains]);
        const failures = [];
        for (const result of results)
            if (result.status === 'rejected')
                failures.push(result.reason);
        if (failures.length > 0)
            throw new AggregateError(failures, 'Security proxy listeners failed to close.');
    }
    /** Close the dispatcher and listeners before a settings change takes effect. */
    async resetTransport() {
        this.generation.abort(new Error('Security proxy upstream changed.'));
        try {
            await this.closeRoutes();
        }
        finally {
            await this.closeDispatcher();
        }
        this.generation = new AbortController();
    }
    /**
     * Start a listener with the selected transport's optional inspection and public trust material.
     * @param options - Listener ownership, forwarding, and capture callbacks.
     * @param signal - Current provider and transport generation lifetime.
     * @returns The listener and optional PEM certificate for its own clients.
     */
    async startChain(options, signal) {
        signal.throwIfAborted();
        return { proxy: await SessionChainProxy.start(options) };
    }
    /** Return the conversation/tool listener, starting it on first use. */
    async chainFor(sessionId, tool) {
        if (this.closing)
            throw new UpstreamFailure('unknown', 'the security proxy is closing');
        const key = chainKey(sessionId, tool);
        const existing = this.chains.get(key);
        if (existing !== undefined) {
            return this.resolveChain(key, existing);
        }
        const execution = this.executionScope(sessionId);
        const upstream = () => {
            if (this.upstreamNow === undefined)
                throw new UpstreamFailure('invalid-config', 'the security proxy has no upstream configured');
            return this.upstreamNow;
        };
        // proxy-exempt: the session relay shares the engine's independent Security proxy pool.
        const dispatcher = () => {
            if (this.dispatcher === undefined)
                throw new UpstreamFailure('invalid-config', 'the security proxy has no dispatcher configured');
            return this.dispatcher;
        };
        const record = {
            sessionId,
            route: this.startChain({
                sessionId,
                tool: () => tool,
                signal: () => this.executionSignal(),
                retainExecution: () => this.retainExecution(),
                executionScope: execution,
                requestHttp: (url, request, signal) => {
                    if (this.chains.get(key) !== record)
                        return Promise.reject(new UpstreamFailure('unknown', 'This proxy route was withdrawn.'));
                    return this.requestHttp(upstream(), dispatcher(), url, request, signal);
                },
                openTunnel: (host, port, signal) => {
                    if (this.chains.get(key) !== record)
                        return Promise.reject(new UpstreamFailure('unknown', 'This proxy route was withdrawn.'));
                    return this.openTunnel(upstream(), host, port, signal);
                },
                capture: this.options.capture,
                paused: () => this.options.store.value.capturePaused,
                timeoutMs: this.options.requestTimeoutMs,
                ...this.options.now === undefined ? {} : { now: this.options.now },
            }, this.executionSignal()),
        };
        this.chains.set(key, record);
        record.route.catch(() => { if (this.chains.get(key) === record)
            this.chains.delete(key); });
        return this.resolveChain(key, record);
    }
    async resolveChain(key, record) {
        const route = await record.route;
        if (this.chains.get(key) !== record)
            throw new UpstreamFailure('unknown', 'This proxy route was withdrawn.');
        return route;
    }
    /** Follow same-origin redirects, read a capped body, and record the exchange. */
    async retrieve(url, upstream, dispatcher, sessionId, tool, signal) {
        let current = validateFetchUrl(url);
        let redirects = 0;
        for (;;) {
            const at = this.now();
            const startedAt = performance.now();
            const timeout = AbortSignal.timeout(this.options.requestTimeoutMs);
            const fused = AbortSignal.any([signal, timeout]);
            let exchange;
            try {
                exchange = await this.requestHttp(upstream, dispatcher, current, {
                    method: 'GET',
                    headers: {
                        'user-agent': this.options.userAgent,
                        'accept': 'text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8',
                    },
                }, fused);
            }
            catch (error) {
                this.recordFailure(at, startedAt, sessionId, tool, current.toString(), error);
                this.markFailed(error);
                throw toWebError(error, signal, timeout);
            }
            const response = exchange.response;
            try {
                if (isRedirect(response.status)) {
                    const location = response.headers.get('location');
                    await response.body?.cancel();
                    if (redirects >= this.options.maxRedirects) {
                        this.recordFailure(at, startedAt, sessionId, tool, current.toString(), new WebError(`exceeded the maximum of ${String(this.options.maxRedirects)} redirects`, 'WEB_REDIRECT_BLOCKED'));
                        throw new WebError(`exceeded the maximum of ${String(this.options.maxRedirects)} redirects`, 'WEB_REDIRECT_BLOCKED');
                    }
                    if (location === null) {
                        this.recordFailure(at, startedAt, sessionId, tool, current.toString(), new WebError('redirect without Location', 'WEB_PROVIDER_ERROR'));
                        throw new WebError(`redirect response (HTTP ${String(response.status)}) without a Location header`, 'WEB_PROVIDER_ERROR');
                    }
                    const next = new URL(location, current);
                    let validated;
                    try {
                        validated = validateFetchUrl(next.toString());
                        if (!isSameOrigin(validated, current)) {
                            throw new WebError(`cross-origin redirect to ${validated.origin} is not followed automatically; retry against that URL directly`, 'WEB_REDIRECT_BLOCKED');
                        }
                    }
                    catch (error) {
                        this.recordFailure(at, startedAt, sessionId, tool, current.toString(), error);
                        throw error;
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
                    });
                    redirects += 1;
                    current = validated;
                    continue;
                }
                const contentType = response.headers.get('content-type');
                let kind;
                try {
                    kind = classifyContentType(contentType);
                    if (kind === undefined)
                        throw new WebError(`unsupported content type "${contentType ?? 'unknown'}"`, 'WEB_UNSUPPORTED_CONTENT_TYPE');
                }
                catch (error) {
                    await response.body?.cancel();
                    this.recordResponse(at, startedAt, sessionId, tool, current, response.status, [...response.headers], contentType, null, error);
                    throw error;
                }
                const { bytes, truncatedByBytes } = await this.readCapped(response, signal, timeout).catch((error) => {
                    this.recordResponse(at, startedAt, sessionId, tool, current, response.status, [...response.headers], contentType, null, error);
                    throw error;
                });
                const decoder = decoderForCharset(parseCharset(contentType));
                const decoded = decoder.decode(bytes);
                const truncatedByChars = decoded.length > this.options.maxBodyChars;
                const content = truncatedByChars ? decoded.slice(0, this.options.maxBodyChars) : decoded;
                this.recordResponse(at, startedAt, sessionId, tool, current, response.status, [...response.headers], contentType, decoded, null, truncatedByBytes);
                return {
                    url: current.toString(),
                    statusCode: response.status,
                    body: kind === 'html' ? { kind: 'html', content } : { kind: 'text', content },
                    truncated: truncatedByBytes || truncatedByChars,
                };
            }
            finally {
                await exchange.close();
            }
        }
    }
    /** Read a response body up to the byte cap. */
    async readCapped(response, signal, timeout) {
        const declared = response.headers.get('content-length');
        if (declared !== null) {
            const length = Number(declared);
            if (Number.isFinite(length) && length > this.options.maxResponseBytes) {
                await response.body?.cancel();
                const error = new WebError(`response exceeds the maximum of ${String(this.options.maxResponseBytes)} bytes`, 'WEB_FETCH_TOO_LARGE');
                this.markFailed(error);
                throw error;
            }
        }
        if (response.body === null)
            return { bytes: new Uint8Array(0), truncatedByBytes: false };
        const chunks = [];
        let total = 0;
        let truncatedByBytes = false;
        const reader = response.body.getReader();
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const remaining = this.options.maxResponseBytes - total;
                if (value.byteLength > remaining) {
                    chunks.push(value.subarray(0, remaining));
                    total += remaining;
                    truncatedByBytes = true;
                    break;
                }
                chunks.push(value);
                total += value.byteLength;
            }
        }
        catch (error) {
            throw toWebError(error, signal, timeout);
        }
        finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return { bytes, truncatedByBytes };
    }
    /** Record one completed controlled exchange. */
    recordResponse(at, startedAt, sessionId, tool, url, status, responseHeaders, contentType, decoded, error, readTruncated = false) {
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
            ...readTruncated ? { responseCaptureLimit: 'read' } : {},
            contentType,
        });
    }
    /** Record a controlled exchange that never produced a response. */
    recordFailure(at, startedAt, sessionId, tool, target, error) {
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
        });
    }
    /** Append one exchange unless the owner paused capture. */
    record(input) {
        if (this.options.store.value.capturePaused)
            return;
        this.options.capture.append(input);
    }
    /** Mark the upstream unreachable after a transport failure, without touching a target's own status. */
    markFailed(error) {
        if (error instanceof WebError)
            return;
        const failure = classifyFailure(error);
        if (failure === 'unknown')
            return;
        this.failureValue = failure;
        this.detailValue = describeFailure(error);
        this.statusValue = this.options.store.value.enabled ? 'failed' : 'off';
    }
    /** Current clock. */
    now() {
        return this.options.now?.() ?? Date.now();
    }
}
/** Redirect statuses the controlled Client follows. */
function isRedirect(status) {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
/** Translate a fetch or body-read failure into the web seam's error type. */
function toWebError(error, signal, timeout) {
    if (error instanceof WebError)
        return error;
    if (timeout.aborted)
        return new WebError('web fetch timed out', 'WEB_FETCH_TIMEOUT', { cause: error });
    if (signal.aborted)
        return new WebError('web fetch aborted', 'WEB_ABORTED', { cause: error });
    const failure = classifyFailure(error);
    const code = failure === 'timeout'
        ? 'WEB_FETCH_TIMEOUT'
        : failure === 'auth'
            ? 'SECURITY_PROXY_AUTH'
            : failure === 'unreachable'
                ? 'SECURITY_PROXY_UNREACHABLE'
                : 'WEB_PROVIDER_ERROR';
    return new WebError(`web fetch failed: ${describeFailure(error)}`, code, { cause: error });
}
/** Re-export the body preparation helpers the service uses for its own tests. */
export { headerEntries, prepareBody } from "./capture.js";
//# sourceMappingURL=engine.js.map