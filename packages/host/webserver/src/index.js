/**
 * @deepseek-ai/dsh-host-webserver — node:http route registration — node:https
 * when `tls` names a certificate and key — with optional gzip, index injection
 * for the Peer a page speaks for, and one fallback seat. It serves no files;
 * the composing application owns dist serving. Electron uses file:// plus IPC
 * instead, and this package never prints the URL.
 * Route handlers retain direct response ownership; a route or the fallback may
 * instead give a resource, which maps a Fetch `Request` to a `Response` and
 * also answers in-process reads.
 * WebServer events use the instance as their subject: ordinary listeners follow
 * its webServer isolation, while explicitly global listeners receive every instance.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import compressionMiddleware from 'compression';
import ipaddr from 'ipaddr.js';
import Negotiator from 'negotiator';
import { renderIndexInjections } from "./injections.js";
export { renderIndexInjections } from "./injections.js";
const DEFAULT_COMPRESSION = 'none';
const DEFAULT_COMPRESSION_LEVEL = 1;
const DEFAULT_COMPRESSION_THRESHOLD_BYTES = 1024;
/** Dotted-quad tail of the IPv6 mixed notation: `::0.0.0.1`, `1:2:3:4:5:6:127.0.0.1`. */
const IPV4_TAIL = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
/**
 * Rewrite a dotted-quad tail as the two hex groups holding the same bytes.
 * ipaddr.js 2.5.0 reads an all-zero prefix plus a quad (`::0.0.0.1`) as the
 * IPv4-mapped form `::ffff:0:1`, while `getaddrinfo` — and so `listen` — reads
 * that tail as the low 32 bits of the address itself, which makes `::0.0.0.1`
 * the loopback literal `::1`. Parsing the rewritten text keeps the parsed value
 * equal to the value the socket binds.
 */
function withHexTail(host) {
    const tail = IPV4_TAIL.exec(host);
    if (tail === null)
        return host;
    const [, head = '', a = '', b = '', c = '', d = ''] = tail;
    const high = ((Number(a) << 8) | Number(b)).toString(16);
    const low = ((Number(c) << 8) | Number(d)).toString(16);
    return `${head}${high}:${low}`;
}
/**
 * Parse a concrete IP literal, normalizing IPv4-mapped IPv6 to IPv4.
 * `node:net` decides what a value must look like for `listen` to accept it, and
 * a trailing `%zone` (a local interface selector, never address text) comes off
 * before parsing; the value handed to `listen` keeps its zone.
 */
function parseIpLiteral(host) {
    if (isIP(host) === 0)
        return undefined;
    const zoneAt = host.indexOf('%');
    const parsed = ipaddr.parse(withHexTail(zoneAt === -1 ? host : host.slice(0, zoneAt)));
    return parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress() ? parsed.toIPv4Address() : parsed;
}
/** Rejection for a bind address that is no concrete IP literal. */
function notLiteralError(value) {
    return new Error(`webserver: host ${JSON.stringify(value)} is not a concrete IPv4 or IPv6 address literal`);
}
/** ipaddr's IPv4 unspecified range covers all of 0/8; only the all-zero address binds every interface. */
function isWildcardAddress(parsed) {
    const parts = parsed instanceof ipaddr.IPv4 ? parsed.octets : parsed.parts;
    return parts.every(part => part === 0);
}
/**
 * Whether a bind address requests every interface at once.
 * @param host - bind address from configuration.
 * @returns true for IPv4 any, IPv6 any, and an IPv4-mapped form of IPv4 any.
 */
export function isWildcardHost(host) {
    const parsed = parseIpLiteral(host);
    return parsed !== undefined && isWildcardAddress(parsed);
}
/**
 * Whether a bind address names the local loopback authority.
 * @param host - bind address from configuration.
 * @returns true for any address in 127/8, `::1`, and their IPv4-mapped forms.
 */
export function isLoopbackHost(host) {
    const parsed = parseIpLiteral(host);
    return parsed !== undefined && parsed.range() === 'loopback';
}
/**
 * Canonical text of the address a bind literal names: IPv4 and IPv4-mapped
 * literals read as dotted quad, every other literal as its compressed IPv6
 * value. The text names the address `listen` binds, so `::0.0.0.1` reads as
 * `::1`. A `%zone` selects an interface and never appears in the text.
 * @param host - concrete IPv4 or IPv6 literal, with or without a zone.
 * @returns the address text, ready to be a URL host.
 * @throws when `host` is no concrete IPv4 or IPv6 address literal.
 */
export function normalizeBindAddress(host) {
    const parsed = parseIpLiteral(host);
    if (parsed === undefined)
        throw notLiteralError(host);
    return parsed.toString();
}
/**
 * The URL host form of a bind address. Loopback addresses use their canonical
 * text, so browsers treat them as local, trustworthy origins: a mapped literal
 * such as `::ffff:127.0.0.1` reads as `127.0.0.1`, and `::0.0.0.1` reads as
 * `::1`. A redundant loopback zone is dropped; other addresses keep their text,
 * and IPv6 text is bracketed.
 * @param host - concrete IPv4 or IPv6 bind literal.
 * @returns the URL host, or `undefined` when a non-loopback interface zone id makes the address inexpressible in a URL.
 */
export function bindUrlHost(host) {
    const zoneAt = host.indexOf('%');
    const bare = zoneAt === -1 ? host : host.slice(0, zoneAt);
    if (!isLoopbackHost(bare) && zoneAt !== -1)
        return undefined;
    const text = isLoopbackHost(bare) ? normalizeBindAddress(bare) : host;
    return isIP(text) === 6 ? `[${text}]` : text;
}
function createGzipMiddleware(config) {
    // `compression` is typed for Express, but its runtime uses only the
    // node:http request and response members supplied here.
    const middleware = compressionMiddleware({
        level: config.compressionLevel,
        threshold: config.compressionThresholdBytes,
        filter(request, response) {
            if (response.getHeader('content-range') !== undefined)
                return false;
            const contentType = response.getHeader('content-type');
            if (typeof contentType === 'string' && contentType.toLowerCase().startsWith('text/event-stream'))
                return false;
            if (typeof contentType === 'string' && /^multipart\/form-data(?:;|$)/i.test(contentType))
                return true;
            return compressionMiddleware.filter(request, response);
        },
    });
    return (req, res, next) => {
        // The Web Worker tunnel has no socket and transfers identity bytes.
        if (res.socket === undefined) {
            next();
            return;
        }
        const encoding = new Negotiator(req).encoding(['gzip', 'identity']);
        const gzipRequest = Object.create(req);
        Object.defineProperty(gzipRequest, 'headers', {
            value: { ...req.headers, 'accept-encoding': encoding === 'gzip' ? 'gzip' : 'identity' },
        });
        middleware(gzipRequest, res, next);
    };
}
/**
 * Read one TLS material file for activation. The error names the config field
 * and the resolved path; empty content is rejected here because node:tls
 * silently accepts it, which would bind a listener that can never complete a
 * handshake.
 * @param field - the config field being read, for the diagnostic.
 * @param path - absolute path to read.
 * @returns the file's text.
 */
async function readTlsFile(field, path) {
    let content;
    try {
        content = await readFile(path, 'utf8');
    }
    catch (error) {
        throw new Error(`webserver: cannot read tls.${field} ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (content.trim().length === 0) {
        throw new Error(`webserver: tls.${field} ${path} is empty`);
    }
    return content;
}
/** Methods a resource answers; any other method receives 405. */
const RESOURCE_METHODS = 'GET, HEAD';
/** Fetch response headers as node:http headers; each `set-cookie` value stays a separate line. */
function nodeHeaders(headers) {
    const out = Object.fromEntries(headers);
    const cookies = headers.getSetCookie();
    if (cookies.length > 0)
        out['set-cookie'] = cookies;
    return out;
}
/**
 * Write a Fetch response's status, headers, and body to a node:http exchange,
 * respecting backpressure; the caller ends the response. A HEAD request and a
 * null body write no body bytes; the abort signal, raised when the client
 * closes the connection, cancels the body.
 */
async function writeResponse(res, response, head, signal) {
    res.writeHead(response.status, nodeHeaders(response.headers));
    const body = response.body;
    if (body === null || head) {
        await body?.cancel();
        return;
    }
    // Send the status and headers before the first body chunk arrives. The Web
    // Worker tunnel has no socket and sends them with the first chunk.
    if (res.socket !== undefined)
        res.flushHeaders();
    const reader = body.getReader();
    const cancel = () => {
        // A rejected cancel means the body already failed; the pending read rejects with the same error.
        reader.cancel().catch(() => undefined);
    };
    if (signal.aborted)
        cancel();
    else
        signal.addEventListener('abort', cancel, { once: true });
    // One drain/close listener pair per response: the gzip middleware forwards
    // `on('drain')` to its zlib stream but not `off`, so a listener added per
    // backpressure wait would stay on that stream. The `off('drain')` below is
    // likewise a no-op under gzip; the one listener goes with that response's
    // zlib stream.
    let resume;
    const wake = () => {
        const waiting = resume;
        resume = undefined;
        waiting?.();
    };
    res.on('drain', wake);
    res.on('close', wake);
    try {
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            if (!res.write(chunk.value) && !signal.aborted)
                await new Promise((resolve) => { resume = resolve; });
        }
    }
    finally {
        signal.removeEventListener('abort', cancel);
        res.off('drain', wake);
        res.off('close', wake);
    }
}
/**
 * The browser HTTP carrier service. Activation loads any configured TLS
 * material, then listens immediately; a material or listen failure rejects
 * initialization, and the boot process reports the failed fiber. Route
 * registration order does not affect requests because configured named routes
 * must be distinct, and a request no named route matches is answered 404
 * until the fallback owner registers. HTTP and upgrade admission refusals
 * carry `Cache-Control: no-store`.
 */
export class WebServer extends Service {
    config;
    static Config = z.object({
        host: z.transform(z.string(), (value) => {
            const parsed = parseIpLiteral(value);
            if (parsed === undefined)
                throw notLiteralError(value);
            if (isWildcardAddress(parsed)) {
                throw new Error(`webserver: host ${JSON.stringify(value)} is an unspecified (wildcard) address, which is not supported: binding every interface would expose remote code execution to the network; bind one concrete IPv4 or IPv6 address of a local interface instead`);
            }
            return value;
        }).required(),
        port: z.natural().max(65535).required(),
        // An omitted object must not become `{}` and fail the required pair fields.
        tls: z.object({
            certFile: z.string().required(),
            keyFile: z.string().required(),
        }).default(undefined),
        compression: z.union([z.const('none'), z.const('gzip')]).default(DEFAULT_COMPRESSION),
        compressionLevel: z.number().step(1).min(0).max(9).default(DEFAULT_COMPRESSION_LEVEL),
        compressionThresholdBytes: z.natural().default(DEFAULT_COMPRESSION_THRESHOLD_BYTES),
    });
    exact = new Map();
    prefixes = new Map();
    upgrades = new Map();
    upgradedSockets = new Set();
    /**
     * Raw connections of a TLS listener, held until they close. A TLS connection
     * joins closeAllConnections()'s table only once its handshake completes, so a
     * socket still handshaking — or one whose peer never sends a ClientHello —
     * would otherwise keep `close()` waiting on the TLS handshake timeout. Empty
     * for the plain listener, whose connections closeAllConnections() reaches.
     */
    tlsConnections = new Set();
    indexTaps = [];
    fallback;
    server;
    listenedPort;
    gzip;
    tlsConfig;
    constructor(ctx, config) {
        super(ctx, 'webServer');
        this.config = config;
        const resolved = config;
        // Schemastery passes an explicit `tls: null` through; only a real object serves TLS.
        this.tlsConfig = resolved.tls ?? undefined;
        this.gzip = resolved.compression === 'gzip' ? createGzipMiddleware(resolved) : undefined;
    }
    /** The listening port (the OS-assigned value when config.port is 0), or `undefined` before `listen` binds. */
    get port() {
        return this.listenedPort;
    }
    /** The configured bind address (one concrete local interface). */
    get host() {
        return this.config.host;
    }
    /**
     * The protocol the listener speaks: `'https:'` when `tls` is configured. The
     * value follows configuration, never a socket or a request header, so a
     * consumer reads it before any request and no proxy can change it.
     */
    get protocol() {
        return this.tlsConfig === undefined ? 'http:' : 'https:';
    }
    /**
     * The root URL local clients use to reach the bound listener: the protocol,
     * the {@link bindUrlHost} form of the bind address, and the listening port.
     * @returns the origin, for example `http://127.0.0.1:3080`.
     * @throws before `listen` binds a port, or when the bind address has no URL form.
     */
    getOrigin() {
        const host = bindUrlHost(this.config.host);
        if (host === undefined) {
            throw new Error(`webserver: bind address ${JSON.stringify(this.config.host)} carries an interface zone id, which no URL can express`);
        }
        if (this.listenedPort === undefined)
            throw new Error('webserver: origin read before the listener bound a port');
        return `${this.protocol}//${host}:${String(this.listenedPort)}`;
    }
    /**
     * Register a named route. Duplicate (kind, path) throws — route patterns are
     * a composition-level contract, so a collision is a misconfiguration.
     * @param route - kind, path, and the owning handler or resource.
     * @returns the disposer removing the route.
     */
    register(route) {
        const table = route.kind === 'exact' ? this.exact : this.prefixes;
        if (table.has(route.path)) {
            throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
        }
        table.set(route.path, route);
        return () => { table.delete(route.path); };
    }
    /**
     * Register an exact-path HTTP upgrade route. Duplicate paths throw because
     * one socket can have only one protocol owner.
     * @param route - pathname and handler owning negotiation plus socket use.
     * @returns the disposer removing the route.
     */
    registerUpgrade(route) {
        if (this.upgrades.has(route.path)) {
            throw new Error(`webserver: duplicate upgrade route "${route.path}"`);
        }
        this.upgrades.set(route.path, route);
        return () => { this.upgrades.delete(route.path); };
    }
    /**
     * Claim the fallback seat: the handler or resource answering every request
     * no named route matches (the SPA dist server in the shipped Web
     * composition). One owner only — a second registration throws, because two
     * fallbacks cannot compose.
     * @param fallback - a handler owning the full response lifecycle of
     * unmatched requests, or an object declaring `handler` or `resource` and auth.
     * @returns the disposer releasing the seat.
     */
    registerFallback(fallback) {
        if (this.fallback !== undefined) {
            throw new Error('webserver: fallback already registered');
        }
        this.fallback = typeof fallback === 'function' ? { handler: fallback } : fallback;
        return () => { this.fallback = undefined; };
    }
    /**
     * Read the response an HTTP request for the same URL would receive, as the
     * resource computes it for `peer`, without an HTTP exchange. The request
     * path picks the responder by the HTTP match order — exact, longest prefix,
     * then the fallback — and only a resource answers. This method checks no
     * cookie, Host, or Origin: the caller admits the reader before reading.
     * A resolved deny policy returns 403 even for an explicitly admitted Peer.
     * @param request - the read; its URL path selects the responder.
     * @param peer - the Peer the read speaks for, passed to the resource.
     * @returns the resource's response, without a body for HEAD as over HTTP;
     * 405 with `Allow: GET, HEAD` for any other method, checked before matching,
     * where over HTTP a handler route or an unmatched path answers such a
     * method itself; 404 when the path matches a handler route, or reaches the
     * fallback seat while it is unclaimed or holds a handler. A resource that
     * throws rejects the read, where an HTTP request would receive 400.
     */
    async readResource(request, peer) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return new Response(null, { status: 405, headers: { allow: RESOURCE_METHODS } });
        }
        const url = new URL(request.url);
        const responder = this.responderFor(url.pathname);
        if (responder === undefined || !('resource' in responder))
            return new Response(null, { status: 404 });
        if (this.authPolicy(responder.auth, { headers: request.headers, method: request.method, url, transport: 'http', signal: request.signal }) === 'deny') {
            return new Response(null, { status: 403 });
        }
        const response = await responder.resource(request, peer);
        if (request.method === 'GET')
            return response;
        await response.body?.cancel();
        return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    /**
     * Register a raw-HTML index transform, the escape hatch for markup no
     * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
     * registration order after rendering the structured rows.
     * @param transform - pure html-to-html function.
     * @returns the disposer removing the transform.
     */
    tapIndex(transform) {
        this.indexTaps.push(transform);
        return () => {
            const at = this.indexTaps.indexOf(transform);
            if (at !== -1)
                this.indexTaps.splice(at, 1);
        };
    }
    /** Listen; resolves once the socket is bound (rejection = FAILED fiber). */
    async [Service.init]() {
        const handle = async (req, res) => {
            /* v8 ignore next -- `?? '/'` arm: node:http always sets url on server
            requests; the field is only optional on the client-side IncomingMessage type */
            const target = new URL(req.url ?? '/', 'http://x');
            const responder = this.responderFor(target.pathname);
            if (responder === undefined) {
                res.writeHead(404);
                res.end();
                return;
            }
            const abort = new AbortController();
            const cleanup = () => {
                res.off('close', onClose);
                res.off('finish', cleanup);
            };
            const onClose = () => {
                abort.abort();
                cleanup();
            };
            res.once('close', onClose);
            res.once('finish', cleanup);
            try {
                const request = {
                    headers: req.headers, method: req.method, url: target, transport: 'http',
                    signal: abort.signal, socket: req.socket,
                };
                const admission = this.authorize(request, responder.auth);
                if (abort.signal.aborted || request.socket?.destroyed)
                    return;
                if (admission.kind === 'deny') {
                    res.writeHead(admission.status, { 'Cache-Control': 'no-store' });
                    res.end(admission.status === 401 ? 'unauthorized' : admission.status === 503 ? 'authentication unavailable' : 'forbidden');
                    return;
                }
                if ('resource' in responder)
                    await this.serveResource(req, res, target, responder.resource, abort.signal, admission.peer);
                else
                    await responder.handler(req, res, admission.peer);
            }
            finally {
                if (res.writableEnded || abort.signal.aborted)
                    cleanup();
            }
        };
        // Last-resort guard: handle() rejecting would otherwise be an unhandled
        // rejection killing the process on one malformed request (bad %-escape,
        // client dropping mid-body). Per-request failures log and answer 400 —
        // never a process exit.
        const listener = (req, res) => {
            const next = () => {
                const dispatch = async () => { await this.ctx.waterfall(this, 'webserver/request', req, res, () => handle(req, res)); };
                void dispatch().catch((err) => {
                    this.ctx.logger.warn(err instanceof Error ? err : new Error(String(err)));
                    if (res.headersSent) {
                        res.destroy();
                        return;
                    }
                    res.writeHead(400);
                    res.end();
                });
            };
            if (this.gzip === undefined)
                next();
            else
                this.gzip(req, res, next);
        };
        const tls = this.tlsConfig;
        // Disposal waits for in-flight acquisition and closes any listener it produces.
        await this.ctx.effect(async () => {
            if (tls === undefined) {
                this.server = createServer(listener);
            }
            else {
                const certFile = resolve(tls.certFile);
                const keyFile = resolve(tls.keyFile);
                const [cert, key] = await Promise.all([
                    readTlsFile('certFile', certFile),
                    readTlsFile('keyFile', keyFile),
                ]);
                try {
                    this.server = createSecureServer({ cert, key }, listener);
                }
                catch (error) {
                    throw new Error(`webserver: tls.certFile ${certFile} and tls.keyFile ${keyFile} are not a usable certificate and key pair: ${error instanceof Error ? error.message : String(error)}`);
                }
                this.server.on('connection', (socket) => {
                    this.tlsConnections.add(socket);
                    socket.once('close', () => { this.tlsConnections.delete(socket); });
                });
            }
            this.server.on('upgrade', (req, socket, head) => {
                const onError = (error) => {
                    this.ctx.logger.warn(error);
                    socket.destroy();
                };
                socket.on('error', onError);
                socket.once('close', () => {
                    socket.off('error', onError);
                    this.upgradedSockets.delete(socket);
                });
                let route;
                let target;
                try {
                    /* v8 ignore next -- node:http always sets url on server requests. */
                    target = new URL(req.url ?? '/', 'http://x');
                    route = this.upgrades.get(target.pathname);
                }
                catch (error) {
                    this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
                    socket.destroy();
                    return;
                }
                if (route === undefined) {
                    socket.destroy();
                    return;
                }
                this.upgradedSockets.add(socket);
                const abort = new AbortController();
                socket.once('close', () => { abort.abort(); });
                try {
                    const admission = this.authorize({
                        headers: req.headers, method: req.method, url: target, transport: 'upgrade',
                        signal: abort.signal, socket,
                    }, route.auth);
                    if (abort.signal.aborted || socket.destroyed)
                        return;
                    if (admission.kind === 'deny') {
                        const reason = { 401: 'Unauthorized', 403: 'Forbidden', 503: 'Service Unavailable' }[admission.status];
                        const body = reason.toLowerCase();
                        socket.end(`HTTP/1.1 ${String(admission.status)} ${reason}\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${String(Buffer.byteLength(body))}\r\n\r\n${body}`);
                        return;
                    }
                    const dispatch = async () => {
                        await this.ctx.waterfall(this, 'webserver/upgrade', req, socket, head, admission.peer, async () => {
                            if (!socket.destroyed)
                                await route.handler(req, socket, head, admission.peer);
                        });
                    };
                    void dispatch().catch((error) => {
                        this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
                        socket.destroy();
                    });
                }
                catch (error) {
                    this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
                    socket.destroy();
                }
            });
            await new Promise((resolve, reject) => {
                this.server.once('error', reject);
                this.server.listen(this.config.port, this.config.host, () => {
                    this.server.off('error', reject);
                    this.server.on('error', (err) => { this.ctx.logger.error(err); });
                    this.listenedPort = this.server.address().port;
                    resolve();
                });
            });
            // Node does not include upgraded sockets in closeAllConnections(), and a TLS
            // connection joins that table only after its handshake. The service owns both
            // kinds with the other connections, so it tracks and destroys them explicitly.
            return async () => {
                const serverClosed = new Promise((resolve) => {
                    this.server.close(() => { resolve(); });
                });
                this.server.closeAllConnections();
                const socketsClosed = [...this.upgradedSockets, ...this.tlsConnections].map(socket => new Promise((resolve) => {
                    socket.once('close', () => { resolve(); });
                    socket.destroy();
                }));
                await Promise.all([serverClosed, ...socketsClosed]);
            };
        }, 'webServer.listen');
    }
    /**
     * The responder for one request path, shared by HTTP requests and
     * {@link readResource}: the matched named route, otherwise the fallback.
     */
    responderFor(pathname) {
        return this.match(pathname) ?? this.fallback;
    }
    authPolicy(auth, request) {
        return typeof auth === 'function' ? auth(request) : auth ?? 'required';
    }
    authorize(request, auth) {
        const policy = this.authPolicy(auth, request);
        if (policy === 'deny')
            return { kind: 'deny', status: 403 };
        const admission = this.ctx.bail(this, 'webserver/authorize', request, policy)
            ?? (policy === 'anonymous' ? { kind: 'allow' } : { kind: 'deny', status: 503 });
        if (admission.kind === 'allow') {
            if (policy === 'required' && admission.peer === undefined)
                return { kind: 'deny', status: 503 };
            if (admission.peer?.signal.aborted)
                return { kind: 'deny', status: 401 };
        }
        return admission;
    }
    /** Longest-prefix-wins over the prefix table after an exact-table miss. */
    match(pathname) {
        const exact = this.exact.get(pathname);
        if (exact !== undefined)
            return exact;
        let best;
        for (const [prefix, route] of this.prefixes) {
            if (pathname !== prefix && !pathname.startsWith(`${prefix}/`))
                continue;
            if (best === undefined || prefix.length > best.path.length)
                best = route;
        }
        return best;
    }
    /**
     * Answer one HTTP exchange from a resource. Only GET and HEAD reach it;
     * any other method receives 405 and its request body is never read. The
     * request becomes a Fetch `Request` whose URL is the request
     * target resolved against a placeholder origin, as the match reads it; the
     * client's authority stays only in the `host` header. The connection
     * closing before this method ends the response aborts the request signal
     * and cancels the response body.
     */
    async serveResource(req, res, target, resource, signal, peer) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { allow: RESOURCE_METHODS });
            res.end();
            return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
            for (const item of typeof value === 'string' ? [value] : value ?? [])
                headers.append(name, item);
        }
        const response = await resource(new Request(target, { method: req.method, headers, signal }), peer);
        await writeResponse(res, response, req.method === 'HEAD', signal);
        if (!signal.aborted)
            res.end();
    }
    /**
     * Run an index.html body through the registered taps in registration order
     * — called by the fallback owner on every index response it renders.
     * @param html - the raw index.html body.
     * @returns the transformed body.
     */
    applyIndexTaps(html) {
        let out = html;
        for (const transform of this.indexTaps)
            out = transform(out);
        return out;
    }
    /**
     * Gather the structured injection table for one Peer: one
     * `webserver/index-inject` emit, every subscriber pushes its current rows.
     * Fresh per call, so subscribers read live state (module graph, theme
     * preference, the Peer's access) at emit time.
     * @param peer - the Peer the page speaks for.
     * @returns rows in subscriber activation order.
     */
    collectIndexInjections(peer) {
        const table = [];
        this.ctx.emit(this, 'webserver/index-inject', table, peer);
        return table;
    }
    /**
     * Render one index.html body for one Peer: the structured injection table
     * first, then the raw `tapIndex` transforms over the result.
     * @param html - the raw index.html body.
     * @param peer - the Peer the page speaks for.
     * @returns the transformed body.
     */
    renderIndex(html, peer) {
        return this.applyIndexTaps(renderIndexInjections(html, this.collectIndexInjections(peer)));
    }
}
export default WebServer;
//# sourceMappingURL=index.js.map