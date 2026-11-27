/** One forwarded request the upstream proxy carried. */
export interface ProxiedRequest {
    readonly method: string;
    readonly url: string;
    readonly authorization: string | undefined;
}
/** One tunnel the upstream proxy opened. */
export interface ProxiedTunnel {
    readonly authority: string;
}
/** A local upstream proxy with switchable authentication and tunnel policy. */
export interface LocalProxy {
    readonly port: number;
    readonly requests: ProxiedRequest[];
    readonly tunnels: ProxiedTunnel[];
    /** Require this basic credential for both forwarding and CONNECT. */
    setCredentials(credentials: {
        readonly user: string;
        readonly pass: string;
    } | null): void;
    /** Refuse every CONNECT with this status; 0 restores normal tunneling. */
    setTunnelStatus(status: number): void;
    close(): Promise<void>;
}
/** Destinations an isolated proxy fixture owns. */
export interface LocalProxyTargets {
    readonly origins: ReadonlySet<string>;
    readonly tunnels: ReadonlySet<string>;
    /** Map an allowed host and port to the fixture's actual listener. */
    readonly aliases?: ReadonlyMap<string, string>;
}
/**
 * Start the upstream proxy on loopback.
 * @param targets - Optional restriction to explicitly owned HTTP and CONNECT fixtures.
 * @returns The listener and its recorded requests.
 */
export declare function startLocalProxy(targets?: LocalProxyTargets): Promise<LocalProxy>;
/** One plain HTTP target. */
export interface LocalTarget {
    readonly port: number;
    readonly url: string;
    close(): Promise<void>;
}
/** Start the HTTP target with a fixed text body and a secret-bearing cookie. */
export declare function startLocalTarget(body?: string): Promise<LocalTarget>;
/** One TCP echo target for CONNECT tests. */
export interface LocalTcpTarget {
    readonly port: number;
    close(): Promise<void>;
}
/** Start a loopback TCP echo server. */
export declare function startTcpEcho(): Promise<LocalTcpTarget>;
//# sourceMappingURL=local-proxy.d.ts.map