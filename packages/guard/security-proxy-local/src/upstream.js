/**
 * The configured upstream proxy: its address, its Proxy-Authorization value, the
 * dispatcher every proxied request uses, and the CONNECT primitive the chain
 * proxy and the connection check share.
 *
 * TLS verification is never relaxed here. A `https:` upstream is reached through
 * `node:https` with Node's default trust store, and origin TLS stays end-to-end
 * through the tunnel.
 * @module @deepseek-ai/dsh-security-proxy-local/upstream
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
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { ProxyAgent } from 'undici';
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout';
/** A classified transport failure the settings surface can render without a transport vocabulary. */
export class UpstreamFailure extends Error {
    failure;
    name = 'UpstreamFailure';
    /**
     * @param failure - stable reason the Client localizes.
     * @param detail - unlocalized diagnostic; carries no credential.
     */
    constructor(failure, detail, options) {
        super(detail, options);
        this.failure = failure;
    }
}
/**
 * The proxy URL without credentials, for diagnostics and the dispatcher URI.
 * @param upstream - configured upstream.
 * @returns `protocol://host:port`.
 */
export function proxyUrl(upstream) {
    const host = isIP(upstream.host) === 6 ? `[${upstream.host}]` : upstream.host;
    return `${upstream.protocol}://${host}:${String(upstream.port)}`;
}
/**
 * Resolve the Proxy-Authorization header value.
 * @param upstream - configured upstream.
 * @returns the header value, or undefined when authentication is off.
 * @throws {UpstreamFailure} when authentication is on but no password is stored.
 */
export function proxyAuthorization(upstream) {
    if (upstream.password === undefined && upstream.username === '')
        return undefined;
    if (upstream.password === undefined) {
        throw new UpstreamFailure('auth', 'the upstream proxy password is not configured');
    }
    return `Basic ${Buffer.from(`${upstream.username}:${upstream.password}`).toString('base64')}`;
}
/**
 * Build the dispatcher for this upstream. One dispatcher serves every request for
 * one settings value; a settings change closes it and builds the next.
 * @param upstream - configured upstream.
 * @returns the dispatcher to hand to `fetch`.
 */
export function createDispatcher(upstream) {
    const token = proxyAuthorization(upstream);
    // proxy-exempt: this explicitly configured Security proxy has credentials and routing independent of the global proxy.
    return new ProxyAgent({
        uri: proxyUrl(upstream),
        ...token === undefined ? {} : { token },
    });
}
/**
 * The innermost transport error of one failure chain. `fetch` reports a bare
 * `TypeError('fetch failed')` and keeps the socket's `code` on its cause, so the
 * classification must read through the chain rather than the outer message.
 * @param error - the thrown value.
 * @returns the deepest value carrying a Node error code, or the input.
 */
function rootCause(error) {
    let current = error;
    for (let depth = 0; depth < 4; depth += 1) {
        const cause = current?.cause;
        if (cause === undefined || cause === current)
            return current;
        current = cause;
    }
    return current;
}
/**
 * Map a transport error to a stable failure reason.
 * @param error - the thrown value, possibly wrapping its own cause.
 * @returns the reason the settings surface renders.
 */
export function classifyFailure(error) {
    if (error instanceof UpstreamFailure)
        return error.failure;
    const deepest = rootCause(error);
    const code = deepest?.code
        ?? error?.code
        ?? '';
    const name = deepest?.name ?? error?.name ?? '';
    if (code === 'ERR_PROXY_AUTH' || code === 'ERR_INVALID_PROXY')
        return 'auth';
    if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || name === 'AbortError' || name === 'TimeoutError')
        return 'timeout';
    if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || code.includes('SELF_SIGNED') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT')
        return 'tls';
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH')
        return 'unreachable';
    return 'unknown';
}
/**
 * Explain one failure without repeating a secret.
 * @param error - the thrown value.
 * @returns an unlocalized diagnostic; carries no credential.
 */
export function describeFailure(error) {
    const deepest = rootCause(error);
    const code = deepest?.code;
    if (error instanceof Error) {
        const message = deepest instanceof Error ? deepest.message : error.message;
        return code === undefined ? message : `${code}: ${message}`;
    }
    return String(error);
}
/**
 * Open one CONNECT tunnel through the upstream.
 *
 * The request goes to the proxy itself (TLS-verified when the upstream is
 * `https:`), asks for `host:port`, and resolves only after the proxy answers
 * `2xx`. A `407` is classified as an authentication failure; any other non-2xx
 * is a proxy refusal.
 * @param upstream - configured upstream.
 * @param host - target host the proxy should reach.
 * @param port - target port the proxy should reach.
 * @param timeoutMs - whole-handshake budget.
 * @param signal - caller cancellation.
 * @returns the connected socket and the proxy's status.
 */
export async function connectThrough(upstream, host, port, timeoutMs, signal) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const authorization = proxyAuthorization(upstream);
        signal?.throwIfAborted();
        const authority = `${isIP(host) === 6 ? `[${host}]` : host}:${String(port)}`;
        const bounded = __addDisposableResource(env_1, deadline(signal ?? AbortSignal.any([]), timeoutMs, 'SECURITY_PROXY_CONNECT_TIMEOUT'), false);
        return await new Promise((resolve, reject) => {
            let outcome;
            const send = upstream.protocol === 'https' ? httpsRequest : httpRequest;
            const request = send({
                host: upstream.host,
                port: upstream.port,
                method: 'CONNECT',
                path: authority,
                headers: {
                    host: authority,
                    ...authorization === undefined ? {} : { 'proxy-authorization': authorization },
                },
                agent: false,
                signal: bounded.signal,
            });
            request.once('connect', (response, socket, head) => {
                if (outcome !== undefined || bounded.signal.aborted) {
                    socket.destroy();
                    request.destroy();
                    return;
                }
                if (response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300) {
                    // The consumer installs its handlers after this promise resumes; retain errors during that interval on the socket.
                    socket.on('error', () => { socket.destroy(); });
                    if (head.length > 0)
                        socket.unshift(head);
                    outcome = { socket, status: response.statusCode };
                    resolve(outcome);
                    return;
                }
                outcome = new UpstreamFailure(response.statusCode === 407 ? 'auth' : 'unreachable', `the upstream proxy refused CONNECT ${authority} with HTTP ${String(response.statusCode)}`);
                socket.destroy();
                request.destroy();
            });
            request.once('error', (error) => {
                outcome ??= timeoutOf(bounded.signal, 'SECURITY_PROXY_CONNECT_TIMEOUT') !== undefined
                    ? new UpstreamFailure('timeout', `the upstream proxy did not answer CONNECT within ${timeoutMs} ms`, { cause: error })
                    : error instanceof UpstreamFailure ? error
                        : new UpstreamFailure(classifyFailure(error), describeFailure(error), { cause: error });
                request.destroy();
            });
            request.once('close', () => {
                if (outcome instanceof UpstreamFailure)
                    reject(outcome);
                else if (outcome === undefined)
                    reject(new UpstreamFailure('unreachable', 'the upstream closed before CONNECT completed'));
            });
            request.end();
        });
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        __disposeResources(env_1);
    }
}
/**
 * Run one real proxy-path check: a CONNECT tunnel to the configured target,
 * opened and closed. Nothing about TLS trust is relaxed, and no target body is
 * requested.
 * @param upstream - configured upstream.
 * @param host - check target host.
 * @param port - check target port.
 * @param timeoutMs - whole-check budget.
 * @returns the handshake latency in milliseconds.
 * @throws {UpstreamFailure} when the check fails.
 */
export async function checkUpstream(upstream, host, port, timeoutMs) {
    const started = performance.now();
    const tunnel = await connectThrough(upstream, host, port, timeoutMs);
    tunnel.socket.destroy();
    return Math.round(performance.now() - started);
}
//# sourceMappingURL=upstream.js.map