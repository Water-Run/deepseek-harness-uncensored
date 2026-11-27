/** Literal resolver endpoint; DNS transport never resolves its own server name. */
export interface DnsServer {
    host: string;
    port: number;
}
/**
 * Parse Node's configured DNS-server notation.
 * @param value - IP literal, IPv4:port, or [IPv6]:port.
 * @returns Validated literal endpoint.
 */
export declare function parseDnsServer(value: string): DnsServer;
/**
 * Read one matching UDP reply, retrying over TCP only for truncation.
 * @param query - Encoded query with its randomized transaction identity.
 * @param server - Operator-selected resolver endpoint.
 * @param signal - Timeout and cancellation; every socket closes before settlement.
 * @returns Full encoded DNS response for validation by the resolver.
 */
export declare function exchangeDns(query: Buffer, server: DnsServer, signal: AbortSignal): Promise<Buffer>;
//# sourceMappingURL=dns-transport.d.ts.map