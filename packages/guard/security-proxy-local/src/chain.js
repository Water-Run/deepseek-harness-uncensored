/**
 * Loopback chain proxy for child processes.
 *
 * A tool call gets an environment pointing at one listener owned by its session.
 * Plain HTTP through that listener is forwarded to the upstream and captured in
 * full; HTTPS is tunnelled with CONNECT and only its metadata is recorded, which
 * is exactly what a non-intercepting proxy can see. The listener never becomes a
 * system proxy and is never bound beyond loopback.
 * @module @deepseek-ai/dsh-security-proxy-local/chain
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { createServer } from 'node:http';
import { addAbortListener, once } from 'node:events';
import { WebError } from '@deepseek-ai/dsh-web';
import { describeFailure, UpstreamFailure } from "./upstream.js";
/** Request and response bodies larger than this are refused rather than buffered. */
const MAX_FORWARD_BODY_BYTES = 8 * 1_048_576;
/** Header names the chain proxy must not forward to the next hop. */
const HOP_BY_HOP = new Set([
    'proxy-authorization',
    'proxy-connection',
    'connection',
    'keep-alive',
    'transfer-encoding',
    'upgrade',
    'te',
    'trailer',
]);
/**
 * One session's loopback HTTP proxy.
 *
 * `port` is assigned by the operating system on `127.0.0.1`; nothing else on the
 * machine is reconfigured. Disposal destroys open tunnels and closes the server.
 */
export class SessionChainProxy {
    server;
    options;
    sockets = new Set();
    closing = false;
    lifetime = new AbortController();
    pending = new Set();
    disposal;
    /** Port assigned by the operating system on loopback. */
    port = 0;
    constructor(server, options) {
        this.server = server;
        this.options = options;
    }
    /**
     * Bind one listener on loopback and start serving.
     * @param options - session attribution, upstream accessors, and capture.
     * @returns the started listener.
     */
    static async start(options) {
        const server = createServer();
        const proxy = new SessionChainProxy(server, options);
        server.on('request', (request, response) => {
            void proxy.track(proxy.scoped(signal => proxy.forward(request, response, signal))).catch((error) => {
                if (!response.headersSent)
                    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
                response.end(`security proxy forward failed: ${describeFailure(error)}\n`);
            });
        });
        server.on('connect', (request, socket, head) => {
            void proxy.track(proxy.scoped(signal => proxy.tunnel(request, socket, head, signal))).catch(() => { socket.destroy(); });
        });
        server.on('connection', (socket) => {
            proxy.sockets.add(socket);
            socket.once('close', () => { proxy.sockets.delete(socket); });
            socket.on('error', () => { socket.destroy(); });
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
                server.off('error', reject);
                resolve();
            });
        });
        const address = server.address();
        /* v8 ignore next 3 -- listen() succeeded, so the address is an AddressInfo. */
        if (address === null || typeof address === 'string') {
            await proxy.close();
            throw new Error('security proxy: the loopback listener reported no port');
        }
        proxy.port = address.port;
        return proxy;
    }
    /** Close the listener and destroy every socket it still owns. */
    close() {
        this.disposal ??= this.dispose();
        return this.disposal;
    }
    track(operation) {
        const owned = operation.finally(() => { this.pending.delete(owned); });
        this.pending.add(owned);
        return owned;
    }
    scoped(operation) {
        return this.options.executionScope === undefined ? operation() : this.options.executionScope(operation);
    }
    async dispose() {
        this.closing = true;
        this.lifetime.abort(new Error('Security proxy listener is closing.'));
        for (const socket of this.sockets)
            socket.destroy();
        this.sockets.clear();
        const closed = new Promise((resolve) => {
            this.server.close(() => { resolve(); });
        });
        await Promise.allSettled([...this.pending, closed]);
    }
    /** Forward one absolute-form HTTP request through the upstream and capture it. */
    async forward(request, response, sourceSignal) {
        if (this.closing) {
            response.destroy();
            return;
        }
        const started = this.options.now?.() ?? Date.now();
        const startedAt = performance.now();
        const target = request.url ?? '';
        let parsed;
        try {
            parsed = new URL(target);
        }
        catch {
            response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('security proxy: an HTTP proxy request must carry an absolute URL\n');
            return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            response.end(`security proxy: unsupported scheme ${parsed.protocol}\n`);
            return;
        }
        const headers = forwardHeaders(request.headers);
        let body;
        let upstreamResponse;
        let responseBytes = 0;
        let release;
        const disconnected = new AbortController();
        const onClose = () => { if (!response.writableFinished)
            disconnected.abort(new Error('Proxy caller disconnected.')); };
        response.once('close', onClose);
        try {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                release = this.options.retainExecution();
                const signal = AbortSignal.any([this.lifetime.signal, this.options.signal(), disconnected.signal,
                    AbortSignal.timeout(this.options.timeoutMs), ...sourceSignal === undefined ? [] : [sourceSignal]]);
                const _abort = __addDisposableResource(env_1, addAbortListener(signal, () => { request.destroy(new Error('Proxy request cancelled.', { cause: signal.reason })); }), false);
                signal.throwIfAborted();
                body = await readBody(request);
                signal.throwIfAborted();
                const exchange = await this.options.requestHttp(parsed, {
                    method: request.method ?? 'GET',
                    headers,
                    ...body === undefined ? {} : { body: new Uint8Array(body) },
                }, signal);
                upstreamResponse = exchange.response;
                try {
                    const responseHeaders = Object.fromEntries([...upstreamResponse.headers].filter(([name]) => !HOP_BY_HOP.has(name.toLowerCase()) && name.toLowerCase() !== 'content-encoding' && name.toLowerCase() !== 'content-length'));
                    response.writeHead(upstreamResponse.status, responseHeaders);
                    const captured = [];
                    let capturedBytes = 0;
                    const maxCapture = 1_048_576;
                    if (upstreamResponse.body !== null) {
                        const reader = upstreamResponse.body.getReader();
                        try {
                            for (;;) {
                                const chunk = await reader.read();
                                if (chunk.done)
                                    break;
                                const value = chunk.value;
                                if (!(value instanceof Uint8Array))
                                    throw new TypeError('security proxy: response stream must contain bytes');
                                responseBytes += value.byteLength;
                                if (capturedBytes < maxCapture) {
                                    const remaining = maxCapture - capturedBytes;
                                    captured.push(value.byteLength <= remaining ? value : value.subarray(0, remaining));
                                    capturedBytes += Math.min(value.byteLength, remaining);
                                }
                                if (!response.write(value))
                                    await once(response, 'drain', { signal });
                            }
                        }
                        finally {
                            await reader.cancel().catch(() => undefined);
                            reader.releaseLock();
                        }
                    }
                    response.end();
                    this.record({
                        at: started,
                        kind: 'http',
                        origin: 'proxy',
                        sessionId: this.options.sessionId,
                        tool: this.options.tool(),
                        method: request.method ?? 'GET',
                        target: parsed.toString(),
                        status: upstreamResponse.status,
                        durationMs: Math.round(performance.now() - startedAt),
                        requestBytes: body?.byteLength ?? 0,
                        responseBytes,
                        outcome: 'complete',
                        note: null,
                        requestHeaders: Object.entries(headers),
                        responseHeaders: [...upstreamResponse.headers],
                        requestBody: body === undefined ? null : new TextDecoder().decode(body),
                        responseBody: new TextDecoder().decode(concat(captured)),
                        ...responseBytes > capturedBytes ? { responseCaptureLimit: 'relay' } : {},
                        contentType: upstreamResponse.headers.get('content-type'),
                    });
                }
                finally {
                    await exchange.close();
                }
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        }
        catch (error) {
            const failure = error instanceof UpstreamFailure ? error : new UpstreamFailure('unreachable', describeFailure(error), { cause: error });
            this.record({
                ...errorInput(this.options, started, parsed.toString(), request, startedAt, body, failure, error),
                status: upstreamResponse?.status ?? null,
                responseBytes,
                responseHeaders: upstreamResponse === undefined ? [] : [...upstreamResponse.headers],
                contentType: upstreamResponse?.headers.get('content-type') ?? null,
            });
            if (response.headersSent)
                response.destroy();
            else {
                response.writeHead(policyStatus(error), { 'content-type': 'text/plain; charset=utf-8' });
                response.end(`security proxy: ${failure.message}\n`);
            }
        }
        finally {
            response.off('close', onClose);
            release?.();
        }
    }
    /** Tunnel one CONNECT request and record only what the tunnel itself reveals. */
    async tunnel(request, socket, head, sourceSignal) {
        if (this.closing) {
            socket.destroy();
            return;
        }
        const started = this.options.now?.() ?? Date.now();
        const startedAt = performance.now();
        const authority = request.url ?? '';
        const [host, port] = splitAuthority(authority);
        if (host === undefined || port === undefined) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            return;
        }
        let release;
        let upstreamTunnel;
        let bridged = false;
        const disconnected = new AbortController();
        const onClose = () => { if (!bridged)
            disconnected.abort(new Error('Proxy tunnel caller disconnected.')); };
        socket.once('close', onClose);
        try {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                release = this.options.retainExecution();
                const signal = AbortSignal.any([this.lifetime.signal, this.options.signal(), disconnected.signal,
                    ...sourceSignal === undefined ? [] : [sourceSignal]]);
                const _abort = __addDisposableResource(env_2, addAbortListener(signal, () => { socket.destroy(); upstreamTunnel?.socket.destroy(); }), false);
                signal.throwIfAborted();
                if (this.options.inspectTunnel !== undefined) {
                    const inspector = await this.options.inspectTunnel(host, port, signal);
                    signal.throwIfAborted();
                    bridged = true;
                    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                    await inspector.run(socket, head, (incoming, response) => this.forward(incoming, response, sourceSignal), signal);
                    return;
                }
                upstreamTunnel = await this.options.openTunnel(host, port, signal);
                signal.throwIfAborted();
                const remote = upstreamTunnel.socket;
                bridged = true;
                const finished = Promise.withResolvers();
                let sent = head.byteLength;
                let received = 0;
                socket.on('data', (chunk) => { sent += chunk.byteLength; });
                remote.on('data', (chunk) => { received += chunk.byteLength; });
                socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                if (head.byteLength > 0)
                    remote.write(head);
                socket.pipe(remote);
                remote.pipe(socket);
                let recorded = false;
                let failed = false;
                const finish = () => {
                    if (recorded)
                        return;
                    recorded = true;
                    socket.destroy();
                    remote.destroy();
                    this.record({
                        at: started,
                        kind: 'tunnel',
                        origin: 'proxy',
                        sessionId: this.options.sessionId,
                        tool: this.options.tool(),
                        method: 'CONNECT',
                        target: authority,
                        status: null,
                        durationMs: Math.round(performance.now() - startedAt),
                        requestBytes: sent,
                        responseBytes: received,
                        outcome: signal.aborted || failed ? 'error' : 'complete',
                        note: signal.aborted ? 'cancelled' : failed ? 'tunnel-failed' : 'tunnel-metadata-only',
                        requestHeaders: [['host', authority]],
                        responseHeaders: [],
                        requestBody: null,
                        responseBody: null,
                        contentType: null,
                    });
                    finished.resolve(true);
                };
                socket.once('close', finish);
                remote.once('close', finish);
                const failure = () => { failed = true; finish(); };
                socket.once('error', failure);
                remote.once('error', failure);
                if (socket.destroyed || remote.destroyed)
                    finish();
                await finished.promise;
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        }
        catch (error) {
            const failure = error instanceof UpstreamFailure ? error : new UpstreamFailure('unreachable', describeFailure(error), { cause: error });
            this.record(errorInput(this.options, started, authority, request, startedAt, undefined, failure, error));
            if (bridged) {
                socket.destroy();
                return;
            }
            const reply = policyStatus(error) === 403 ? '403 Forbidden' : '502 Bad Gateway';
            await new Promise((resolve) => { socket.end(`HTTP/1.1 ${reply}\r\n\r\n`, () => { resolve(); }); });
        }
        finally {
            socket.off('close', onClose);
            try {
                await Promise.all([closeSocket(socket), ...upstreamTunnel === undefined ? [] : [closeSocket(upstreamTunnel.socket)]]);
            }
            finally {
                release?.();
            }
        }
    }
    /** Append one exchange unless the owner paused capture. */
    record(input) {
        if (this.options.capture === undefined || this.options.paused?.() === true)
            return;
        this.options.capture.append(input);
    }
}
/** Wait for native socket closure before releasing its execution dependencies. */
async function closeSocket(socket) {
    if (socket.closed)
        return;
    await new Promise((resolve) => { socket.once('close', () => { resolve(); }); socket.destroy(); });
}
function policyStatus(error) {
    return error instanceof WebError && (error.code.startsWith('TARGET_') || error.code === 'WEB_TARGET_PROTECTED') ? 403 : 502;
}
/** Synthesize the failed exchange row for one refused request. */
function errorInput(options, at, target, request, startedAt, body, failure, original) {
    return {
        at,
        kind: request.method === 'CONNECT' ? 'tunnel' : 'http',
        origin: 'proxy',
        sessionId: options.sessionId,
        tool: options.tool(),
        method: request.method ?? 'GET',
        target,
        status: null,
        durationMs: Math.round(performance.now() - startedAt),
        requestBytes: body?.byteLength ?? 0,
        responseBytes: 0,
        outcome: 'error',
        note: original instanceof WebError ? original.code : failure.failure,
        requestHeaders: Object.entries(forwardHeaders(request.headers)),
        responseHeaders: [],
        requestBody: body === undefined ? null : new TextDecoder().decode(body),
        responseBody: null,
        contentType: null,
    };
}
/** Convert incoming headers to a plain forwardable record. */
function forwardHeaders(headers) {
    const result = {};
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined)
            continue;
        if (HOP_BY_HOP.has(name.toLowerCase()))
            continue;
        result[name] = Array.isArray(value) ? value.join(', ') : value;
    }
    return result;
}
/** Collect a request body up to {@link MAX_FORWARD_BODY_BYTES}. */
async function readBody(request) {
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
        const buffer = chunk;
        total += buffer.byteLength;
        if (total > MAX_FORWARD_BODY_BYTES)
            throw new Error(`request body exceeds ${String(MAX_FORWARD_BODY_BYTES)} bytes`);
        chunks.push(buffer);
    }
    return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}
/** Concatenate captured chunks without copying twice. */
function concat(chunks) {
    if (chunks.length === 0)
        return new Uint8Array(0);
    if (chunks.length === 1)
        return chunks[0];
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}
/** Split a CONNECT authority into host and port, accepting bracketed IPv6. */
function splitAuthority(authority) {
    const match = /^\[([^\]]+)\]:(\d+)$/.exec(authority) ?? /^([^:]+):(\d+)$/.exec(authority);
    if (match === null)
        return [undefined, undefined];
    const host = match[1];
    const port = Number(match[2]);
    if (host === undefined || !Number.isInteger(port) || port < 1 || port > 65_535)
        return [undefined, undefined];
    return [host, port];
}
//# sourceMappingURL=chain.js.map