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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol';
import { type IndexInjection } from './injections.ts';
export { renderIndexInjections } from './injections.ts';
export type { IndexInjection, IndexInjectionPlacement } from './injections.ts';
/** One application entry URL contributed for startup printing or browser handoff. */
export interface WebEntryUrl {
    /** Output prefix, such as `dsh web`. */
    readonly label: string;
    /** Complete entry URL, including any credentials required by its provider. */
    readonly url: string;
    /** Whether this entry is eligible for the application's automatic browser handoff. */
    readonly open: boolean;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        webServer: WebServer;
    }
    interface Events {
        /**
         * Collect complete entry URLs for an advertised server address.
         * @param baseUrl - advertised server base URL without provider credentials.
         * @param entries - entries appended synchronously in listener order.
         * @mode emit
         */
        'webserver/entry-url'(baseUrl: string, entries: WebEntryUrl[]): void;
        /**
         * Admit a matched request synchronously; the first decision wins.
         * @param request - headers, target, transport, and available cancellation state.
         * @param policy - resolved route policy; deny never emits this event.
         * @mode bail
         */
        'webserver/authorize'(request: WebAuthRequest, policy: WebAuthPolicy): WebAdmission | undefined;
        /**
         * Handle an HTTP request before named-route and fallback dispatch.
         * @param request - original incoming HTTP request.
         * @param response - response owned by the listener or its delegated handler.
         * @param next - dispatch to the next listener or the matching route.
         * @mode waterfall
         */
        'webserver/request'(request: IncomingMessage, response: ServerResponse, next: () => Promise<void>): Promise<void>;
        /**
         * Handle an admitted upgrade before its registered protocol handler.
         * @param request - original upgrade request.
         * @param socket - transport owned by the upgrade.
         * @param head - bytes received after the HTTP headers.
         * @param peer - authenticated identity, absent for anonymous admission.
         * @param next - delegate to the next listener or protocol handler.
         * @mode waterfall
         */
        'webserver/upgrade'(request: IncomingMessage, socket: Duplex, head: Buffer, peer: PeerScope | undefined, next: () => Promise<void>): Promise<void>;
        /**
         * Collect the structured index injection table for the page `peer` speaks
         * for. Emitted on every index render and every worker boot-payload
         * request; listeners push their current rows, so a row's data is read
         * fresh at emit time.
         * @param table - Mutable row table; listeners append in activation order.
         * @param peer - The Peer the rendered page speaks for.
         * @mode emit
         */
        'webserver/index-inject'(table: IndexInjection[], peer: PeerScope): void;
    }
}
/** A route permits anonymous access, requires a live Peer, or refuses all access. */
export type WebAuthPolicy = 'anonymous' | 'required' | 'deny';
/** Authentication inputs shared by socket-backed and synthetic requests. */
export interface WebAuthRequest {
    headers: Headers | Readonly<Record<string, string | readonly string[] | undefined>>;
    method?: string | undefined;
    url: URL;
    transport: 'http' | 'upgrade';
    signal?: AbortSignal | undefined;
    socket?: {
        readonly destroyed: boolean;
    } | undefined;
}
/** Fixed route policy or a synchronous policy selector. */
export type WebAuthenticationRule = WebAuthPolicy | ((request: WebAuthRequest) => WebAuthPolicy);
/** First authorization decision; authenticated access requires a live Peer. */
export type WebAdmission = {
    kind: 'allow';
    peer?: PeerScope;
} | {
    kind: 'deny';
    status: 401 | 403 | 503;
};
/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
export type WebRouteKind = 'exact' | 'prefix';
/** One named route registration. */
export interface WebRoute {
    kind: WebRouteKind;
    /** Absolute pathname, no trailing slash. */
    path: string;
    /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
    handler: (req: IncomingMessage, res: ServerResponse, peer?: PeerScope) => void | Promise<void>;
    /** Defaults to required. Anonymous handlers may receive no Peer. */
    auth?: WebAuthenticationRule;
}
/**
 * Answers one GET or HEAD request with a Fetch response and its admitted Peer.
 * Anonymous HTTP admission may omit the Peer; an in-process
 * {@link WebServer.readResource} read passes the Peer its caller admitted.
 */
export type WebResource = (request: Request, peer?: PeerScope) => Promise<Response>;
/** One named route answered by a resource instead of a handler. */
export interface WebResourceRoute {
    kind: WebRouteKind;
    /** Absolute pathname, no trailing slash. */
    path: string;
    /** Answers HTTP GET and HEAD requests and in-process reads. */
    resource: WebResource;
    /** Defaults to required; in-process reads still enforce deny. */
    auth?: WebAuthenticationRule;
}
/** The unmatched-request responder; omitted auth requires authentication. */
export type WebFallback = Pick<WebRoute, 'handler' | 'auth'> | Pick<WebResourceRoute, 'resource' | 'auth'>;
/** One exact-path HTTP upgrade registration. */
export interface WebUpgradeRoute {
    /** Absolute pathname, no trailing slash. */
    path: string;
    /** Owns protocol negotiation and the upgraded socket after dispatch. */
    handler: (req: IncomingMessage, socket: Duplex, head: Buffer, peer?: PeerScope) => void | Promise<void>;
    /** Defaults to required. Anonymous handlers may receive no Peer. */
    auth?: WebAuthenticationRule;
}
/**
 * TLS material for the HTTPS listener: one certificate chain file and the
 * private key file it pairs with. Both hold PEM text and both resolve against
 * the process working directory.
 */
export interface TlsConfig {
    /** Certificate chain file, leaf certificate first, PEM, no passphrase. */
    certFile: string;
    /** Private key file for the chain's leaf certificate; unencrypted PEM. */
    keyFile: string;
}
/** Web server listen, TLS, and response-compression config. */
export interface Config {
    /**
     * Listen address: a concrete IPv4 or IPv6 literal of one local interface,
     * for example the container's own Pod address from `hostname -i`. A loopback
     * literal (any address in 127/8, `::1`, or a mapped form of either) keeps the
     * server on this machine; any other literal serves the network that address
     * belongs to, over plain HTTP unless `tls` is set. The unspecified address —
     * IPv4 any, IPv6 any, and the IPv4-mapped forms of IPv4 any — is rejected at
     * load: it would expose the port on every interface at once.
     */
    host: string;
    /** Listen port; zero requests an OS-assigned port. */
    port: number;
    /**
     * Serve HTTPS with this certificate and key instead of plain HTTP. Both files
     * are read once, before the listener binds: an unreadable or empty file,
     * invalid PEM, or a key that does not match the certificate rejects
     * initialization rather than falling back to HTTP. The material is never
     * re-read, so replacing a certificate takes a reload. Omitted or null listens
     * over plain HTTP.
     */
    tls?: TlsConfig;
    /** Response compression for socket-backed HTTP requests. @default 'none' */
    compression?: 'none' | 'gzip';
    /** Gzip DEFLATE level from 0 through 9. @default 1 */
    compressionLevel?: number;
    /** Minimum known response length eligible for gzip; unknown-length streams are eligible. @default 1024 */
    compressionThresholdBytes?: number;
}
/**
 * Whether a bind address requests every interface at once.
 * @param host - bind address from configuration.
 * @returns true for IPv4 any, IPv6 any, and an IPv4-mapped form of IPv4 any.
 */
export declare function isWildcardHost(host: string): boolean;
/**
 * Whether a bind address names the local loopback authority.
 * @param host - bind address from configuration.
 * @returns true for any address in 127/8, `::1`, and their IPv4-mapped forms.
 */
export declare function isLoopbackHost(host: string): boolean;
/**
 * Canonical text of the address a bind literal names: IPv4 and IPv4-mapped
 * literals read as dotted quad, every other literal as its compressed IPv6
 * value. The text names the address `listen` binds, so `::0.0.0.1` reads as
 * `::1`. A `%zone` selects an interface and never appears in the text.
 * @param host - concrete IPv4 or IPv6 literal, with or without a zone.
 * @returns the address text, ready to be a URL host.
 * @throws when `host` is no concrete IPv4 or IPv6 address literal.
 */
export declare function normalizeBindAddress(host: string): string;
/**
 * The URL host form of a bind address. Loopback addresses use their canonical
 * text, so browsers treat them as local, trustworthy origins: a mapped literal
 * such as `::ffff:127.0.0.1` reads as `127.0.0.1`, and `::0.0.0.1` reads as
 * `::1`. A redundant loopback zone is dropped; other addresses keep their text,
 * and IPv6 text is bracketed.
 * @param host - concrete IPv4 or IPv6 bind literal.
 * @returns the URL host, or `undefined` when a non-loopback interface zone id makes the address inexpressible in a URL.
 */
export declare function bindUrlHost(host: string): string | undefined;
/**
 * The browser HTTP carrier service. Activation loads any configured TLS
 * material, then listens immediately; a material or listen failure rejects
 * initialization, and the boot process reports the failed fiber. Route
 * registration order does not affect requests because configured named routes
 * must be distinct, and a request no named route matches is answered 404
 * until the fallback owner registers. HTTP and upgrade admission refusals
 * carry `Cache-Control: no-store`.
 */
export declare class WebServer extends Service {
    private config;
    static Config: z<Config>;
    private readonly exact;
    private readonly prefixes;
    private readonly upgrades;
    private readonly upgradedSockets;
    /**
     * Raw connections of a TLS listener, held until they close. A TLS connection
     * joins closeAllConnections()'s table only once its handshake completes, so a
     * socket still handshaking — or one whose peer never sends a ClientHello —
     * would otherwise keep `close()` waiting on the TLS handshake timeout. Empty
     * for the plain listener, whose connections closeAllConnections() reaches.
     */
    private readonly tlsConnections;
    private readonly indexTaps;
    private fallback;
    private server;
    private listenedPort;
    private readonly gzip;
    private readonly tlsConfig;
    constructor(ctx: Context, config: Config);
    /** The listening port (the OS-assigned value when config.port is 0), or `undefined` before `listen` binds. */
    get port(): number | undefined;
    /** The configured bind address (one concrete local interface). */
    get host(): Config['host'];
    /**
     * The protocol the listener speaks: `'https:'` when `tls` is configured. The
     * value follows configuration, never a socket or a request header, so a
     * consumer reads it before any request and no proxy can change it.
     */
    get protocol(): 'http:' | 'https:';
    /**
     * The root URL local clients use to reach the bound listener: the protocol,
     * the {@link bindUrlHost} form of the bind address, and the listening port.
     * @returns the origin, for example `http://127.0.0.1:3080`.
     * @throws before `listen` binds a port, or when the bind address has no URL form.
     */
    getOrigin(): string;
    /**
     * Register a named route. Duplicate (kind, path) throws — route patterns are
     * a composition-level contract, so a collision is a misconfiguration.
     * @param route - kind, path, and the owning handler or resource.
     * @returns the disposer removing the route.
     */
    register(route: WebRoute | WebResourceRoute): () => void;
    /**
     * Register an exact-path HTTP upgrade route. Duplicate paths throw because
     * one socket can have only one protocol owner.
     * @param route - pathname and handler owning negotiation plus socket use.
     * @returns the disposer removing the route.
     */
    registerUpgrade(route: WebUpgradeRoute): () => void;
    /**
     * Claim the fallback seat: the handler or resource answering every request
     * no named route matches (the SPA dist server in the shipped Web
     * composition). One owner only — a second registration throws, because two
     * fallbacks cannot compose.
     * @param fallback - a handler owning the full response lifecycle of
     * unmatched requests, or an object declaring `handler` or `resource` and auth.
     * @returns the disposer releasing the seat.
     */
    registerFallback(fallback: WebRoute['handler'] | WebFallback): () => void;
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
    readResource(request: Request, peer: PeerScope): Promise<Response>;
    /**
     * Register a raw-HTML index transform, the escape hatch for markup no
     * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
     * registration order after rendering the structured rows.
     * @param transform - pure html-to-html function.
     * @returns the disposer removing the transform.
     */
    tapIndex(transform: (html: string) => string): () => void;
    /** Listen; resolves once the socket is bound (rejection = FAILED fiber). */
    [Service.init](): Promise<void>;
    /**
     * The responder for one request path, shared by HTTP requests and
     * {@link readResource}: the matched named route, otherwise the fallback.
     */
    private responderFor;
    private authPolicy;
    private authorize;
    /** Longest-prefix-wins over the prefix table after an exact-table miss. */
    private match;
    /**
     * Answer one HTTP exchange from a resource. Only GET and HEAD reach it;
     * any other method receives 405 and its request body is never read. The
     * request becomes a Fetch `Request` whose URL is the request
     * target resolved against a placeholder origin, as the match reads it; the
     * client's authority stays only in the `host` header. The connection
     * closing before this method ends the response aborts the request signal
     * and cancels the response body.
     */
    private serveResource;
    /**
     * Run an index.html body through the registered taps in registration order
     * — called by the fallback owner on every index response it renders.
     * @param html - the raw index.html body.
     * @returns the transformed body.
     */
    applyIndexTaps(html: string): string;
    /**
     * Gather the structured injection table for one Peer: one
     * `webserver/index-inject` emit, every subscriber pushes its current rows.
     * Fresh per call, so subscribers read live state (module graph, theme
     * preference, the Peer's access) at emit time.
     * @param peer - the Peer the page speaks for.
     * @returns rows in subscriber activation order.
     */
    collectIndexInjections(peer: PeerScope): IndexInjection[];
    /**
     * Render one index.html body for one Peer: the structured injection table
     * first, then the raw `tapIndex` transforms over the result.
     * @param html - the raw index.html body.
     * @param peer - the Peer the page speaks for.
     * @returns the transformed body.
     */
    renderIndex(html: string, peer: PeerScope): string;
}
export default WebServer;
//# sourceMappingURL=index.d.ts.map