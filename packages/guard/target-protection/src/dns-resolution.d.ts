/** Resolver inputs, fixed by the deployment before resolving a request. */
export interface TargetDnsOptions {
    /** Empty follows the current OS-configured DNS servers. */
    servers: readonly string[];
    /** Empty disables hosts-file lookup; an explicit path is read before DNS. */
    hostsFile: string;
    queryTimeoutMs: number;
    maxCnameDepth: number;
    maxRecords: number;
    maxHostsBytes: number;
}
/** Verified names and addresses from one resolution; no unrelated answer records are included. */
export interface TargetDnsResolution {
    hostname: string;
    /** The requested hostname comes first, followed by verified aliases. */
    names: readonly string[];
    addresses: readonly {
        address: string;
        family: 4 | 6;
    }[];
    source: 'literal' | 'localhost' | 'hosts' | 'dns';
}
/**
 * Select the platform's ordinary hosts file without changing OS configuration.
 * @returns The Windows or POSIX hosts-file path.
 */
export declare function systemHostsFile(): string;
/**
 * Resolve a target with its names and pinned addresses from hosts data or complete DNS packets.
 * @param hostname - URL hostname; IP literals require no DNS traffic.
 * @param options - Explicit resolver limits and source selection.
 * @param signal - Complete resolution deadline and cancellation.
 * @returns Complete evidence for both address families; uncertainty rejects the operation.
 */
export declare function resolveTargetDns(hostname: string, options: TargetDnsOptions, signal: AbortSignal): Promise<TargetDnsResolution>;
//# sourceMappingURL=dns-resolution.d.ts.map