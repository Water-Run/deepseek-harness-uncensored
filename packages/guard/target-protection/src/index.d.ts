/** Durable target rules and network admission; no model assessment grants permission. @module */
import { Context, Service } from '@deepseek-ai/cordis';
import schema from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { ProxyExecutionScope } from '@deepseek-ai/dsh-security-proxy-local';
import type { HttpFetchDestination, PublicAddress, ResolvedSocketAddress } from '@deepseek-ai/dsh-web-fetch-http';
import { type TargetDnsResolution } from './dns-resolution.ts';
import { type LocalTargetOperation } from './file-rules.ts';
import type { TargetDecision, TargetEffect, TargetPreferences, TargetSnapshot, TargetSshCoverage, TargetRuleId } from './types.ts';
import { type DatabaseResourceBinding } from './database-resources.ts';
import type { NativeFileConstraints } from './native-file-policy.ts';
import { type TargetAuditHistory } from './audit.ts';
export type * from './types.ts';
export type { DatabaseResourceBinding } from './database-resources.ts';
export { TargetProtectionError, TargetAuditError } from './errors.ts';
export { canonicalTargetHost, parseTargetPreferences, TargetRules, expandTargetRules } from './rules.ts';
export { TargetStore } from './store.ts';
/** Deployment-owned store and bounded resolution. */
export interface Config {
    /** Registry file belonging only to target protection. */
    path: string;
    /** Separate local audit store; empty disables admission recording. */
    auditPath?: string;
    /** Maximum retained decisions in the audit store. */
    auditLimit?: number;
    /** SQLite lock wait in milliseconds, default 1000. */
    busyTimeoutMs?: number;
    /** Deadline for one address-aware check, default 5000 milliseconds. */
    checkTimeoutMs?: number;
    /** Maximum rechecks after a concurrent settings change, default 3. */
    maxRechecks?: number;
    /** Empty follows the OS-configured DNS servers; explicit entries are literal IP[:port] endpoints. */
    dnsServers?: string[];
    /** Hosts file used before DNS; empty disables it, omission uses the system file. */
    hostsFile?: string;
    /** Per-server DNS exchange timeout in milliseconds, default 1500. */
    dnsQueryTimeoutMs?: number;
    /** Maximum accepted CNAME depth, default 8. */
    dnsMaxCnameDepth?: number;
    /** Maximum names or addresses retained from a resolution, default 256. */
    dnsMaxRecords?: number;
    /** Hosts-file byte bound, default 1 MiB. */
    hostsMaxBytes?: number;
    /** Additional owner-only configuration and credential files; all Agent access is refused. */
    ownerPaths?: string[];
    /** Additional local data sources that Agents may read but must not change. */
    readOnlyPaths?: string[];
}
type ResolvedConfig = Required<Config>;
/** Name evidence and policy-validated addresses from the same resolution. */
export interface TargetHttpResolution extends Omit<TargetDnsResolution, 'addresses'> {
    addresses: readonly PublicAddress[];
}
/** Connection-owner DNS evidence, including private addresses and discovered translation aliases. */
export interface TargetConnectionResolution extends Omit<TargetDnsResolution, 'addresses'> {
    addresses: readonly ResolvedSocketAddress[];
}
/** Fixed SSH destination and the rule revision installed by its trusted file executor. */
export interface RemoteFilesystemBinding {
    /** Revision retained until the verified helper and its I/O close. */
    readonly revision: number;
    /** Active production path resources represented by the remote helper's rules. */
    readonly ruleIds: readonly TargetRuleId[];
    /** Original configured SSH hostname. */
    readonly hostname: string;
    /** Actual SSH service port. */
    readonly port: number;
    /** Exact DNS and literal-peer evidence selected for this connection. */
    readonly resolution: TargetConnectionResolution;
    /** Owning SSH lifetime; withdrawal invalidates this binding. */
    readonly signal: AbortSignal;
}
/** Host-only admission for one helper; activating requires its acknowledged rule installation. */
export interface RemoteFilesystemPolicy {
    /** Mark the authenticated helper's requested path rules as installed. */
    activate(): void;
    /** @param signal - Fixed-helper startup cancellation. @returns Current destination admission before model operations exist. */
    checkHelper(signal: AbortSignal): Promise<TargetDecision>;
    /** @param effect - Effect guaranteed by the structured file operation. @param signal - Operation cancellation.
     * @returns Admission only after helper acknowledgement and while the retained revision is current. */
    checkFile(effect: 'observe' | 'mutate', signal: AbortSignal): Promise<TargetDecision>;
}
/** File identity and policy revision selected for the executing local provider. */
export interface LocalFileAdmission {
    path: string;
    revision: number;
    decision: TargetDecision;
}
/** Session attribution captured by a trusted local request or listener owner. */
export interface TargetAuditExecution extends ProxyExecutionScope {
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        targetProtection: TargetProtection;
    }
    interface Events {
        /**
         * Notify status consumers after a rule revision is committed.
         * @mode emit
         */
        'target-protection/changed'(): void;
    }
}
/** Root owner; the HTTP consumer requires this service and cannot fall back after its removal. */
export default class TargetProtection extends Service {
    static Config: schema<Config, ResolvedConfig>;
    private readonly config;
    private readonly ready;
    private opened;
    private readonly lifetime;
    private generation;
    private readonly checking;
    private readonly nativeExecutions;
    private readonly sshConnections;
    private updates;
    private nativeTransition;
    private audit;
    private auditFailed;
    private auditInitiator;
    private readonly auditSessionScope;
    /** Plain holder keeps listener ownership at the provider when Cordis traces a borrowed service. */
    private readonly auditOwner;
    /**
     * @param ctx - Service owner whose lifetime contains all pending checks.
     * @param config - Explicit path and deployment limits.
     */
    constructor(ctx: Context, config: Config);
    /** Refuse activation when durable settings cannot be validated. */
    protected [Service.init](): Promise<void>;
    private registryPaths;
    /**
     * Retain one verified SSH connection in the owner's coverage summary.
     * @param pathRules - Whether the helper accepted remote path protection.
     * @returns Idempotent removal, owned by the connection and called when it stops accepting requests.
     */
    registerSshCoverage(pathRules: boolean): () => void;
    private notifyExecutionChanged;
    /**
     * Read verified SSH coverage retained by this policy owner.
     * @returns Connection counts, including the subset with remote path rules.
     */
    sshCoverage(): TargetSshCoverage;
    private recordAudit;
    private auditSession;
    private auditScopeClosed;
    /**
     * Read a live initiating Agent for Host callbacks, including Worker message handlers.
     * Explicit audit scopes can suppress inherited identity but cannot establish an Agent.
     * @returns The exact registered Agent, or undefined for Host and audit-only calls.
     * @throws When the inherited Agent or its Session has been withdrawn or replaced.
     */
    currentExecutionAgent(): Agent | undefined;
    /**
     * Capture the current audit Session before work enters a background preparation queue.
     * @returns Its ID, or null when audit recording or conversation attribution is absent.
     */
    currentAuditSessionId(): SessionId | null;
    /**
     * Bind trusted listener ownership for admission logging, without granting target access.
     * An enabled audit refuses a missing or replaced Session before running the operation.
     * @param sessionId - Owner-established Session identity; undefined clears inherited attribution for Host checks.
     * @returns A request runner retaining the exact Session and checking its membership on each invocation.
     */
    bindAuditSession(sessionId: SessionId | undefined): TargetAuditExecution;
    private recordDecision;
    private recordFailure;
    private audited;
    /**
     * Read audit write availability without loading stored decisions.
     * @returns Off for unconfigured auditing, or the current writer state.
     */
    auditWriteState(): TargetAuditHistory['state'];
    /**
     * Read the local protection admission log without exposing raw targets or the fingerprint key.
     * @returns The audit state and up to 100 newest accepted records.
     * @throws When the stored records cannot be read or validated.
     */
    auditHistory(): TargetAuditHistory;
    /**
     * Record a guarded remote file request after its validated result or refusal, retaining its exact audit owner through cleanup.
     * Connection admission must still succeed and persist before I/O; resource IDs must come from verified helper matches.
     * @param identity - Executor-selected SSH destination and requested file identities; only their keyed fingerprint is stored.
     * @param effect - Effect selected by the structured protocol method.
     * @param signal - Request cancellation.
     * @param execute - Guarded executor observing the supplied lifetime and reporting resources matched by its verified helper.
     * @returns The validated result; executor failures retain their original identity and never imply rollback.
     * @throws TARGET_AUDIT_UNCONFIRMED if the executor returned but its final audit acknowledgement failed; verify files before retrying.
     */
    auditRemoteFile<T>(identity: readonly (string | number | undefined)[], effect: 'observe' | 'mutate', signal: AbortSignal, execute: (signal: AbortSignal, reportMatches: (ids: readonly TargetRuleId[]) => void) => Promise<T>): Promise<T>;
    /**
     * Admit only executions whose effects are bounded by a structured adapter. Arbitrary code cannot establish a target set.
     * @returns Denial while any production or mainland rule is active; otherwise permission.
     * @throws When initialization, durable settings or the service lifetime is unavailable.
     */
    checkUnconfined(): TargetDecision;
    private unconfinedDecision;
    /**
     * Check a host-local operation against current path rules and protected owner files.
     * @param path - Absolute path supplied by the local executing provider.
     * @param operation - Actual operation implemented by that provider.
     * @param signal - Operation lifetime, including policy-change cancellation.
     * @returns The checked canonical path, current revision and decision; unavailable identity rejects.
     */
    checkLocalFile(path: string, operation: LocalTargetOperation, signal: AbortSignal): Promise<LocalFileAdmission>;
    private checkFile;
    /**
     * Read current committed settings; shutdown never supplies empty defaults.
     * @returns The latest durable revision and rule values.
     */
    snapshot(): Promise<TargetSnapshot>;
    /**
     * Read the active registry for synchronous runtime status consumers.
     * @returns The committed preferences and revision; unavailable before readiness or after withdrawal.
     */
    currentSnapshot(): TargetSnapshot;
    /**
     * Read the file restrictions a native executor must expand before launch.
     * @returns One committed rule revision and immutable owner/production paths, without runtime grants.
     */
    nativeFileConstraints(): Promise<NativeFileConstraints>;
    /**
     * Save owner-selected preferences after a revision check.
     * @param preferences - Complete normalized rules.
     * @param expectedRevision - The caller's previously read revision.
     * @param signal - Optional cancellation checked before any durable commit.
     * @returns Committed successor settings.
     */
    configure(preferences: TargetPreferences, expectedRevision: number, signal?: AbortSignal): Promise<TargetSnapshot>;
    private savePreferences;
    private invalidate;
    /**
     * Capture cancellation for one operation using the current policy and country-data generation.
     * @returns A signal aborted on local configuration change, country-source replacement or shutdown.
     */
    executionSignal(): AbortSignal;
    /**
     * Retain rule resources for an executing adapter until its native I/O and cleanup have settled.
     * @returns An idempotent release function; obtain it before starting I/O and release it in finally.
     * @throws When protection is closing and cannot admit another operation.
     */
    retainExecution(): () => void;
    /**
     * Retain the checked revision and prevent policy writers during a final executor commit.
     * @param revision - Revision returned by completed target checks.
     * @returns Idempotent release, required after native execution and cleanup settle.
     */
    retainSnapshot(revision: number): () => void;
    /**
     * Retain a native command's immutable policy until its entire process range and transport have closed.
     * @param revision - Revision used to construct the command's native policy.
     * @param stop - Idempotent cancellation; rejection without a physical-closure acknowledgement disables new admission.
     * @returns Idempotent release. Call only after physical shutdown is confirmed, including startup failure cleanup.
     */
    retainNativeExecution(revision: number, stop: () => Promise<void>): () => void;
    /**
     * Check the actual HTTP destination. Ordinary GET is treated as an unverified effect.
     * @param destination - Authority and pinned-address facts from the HTTP transport.
     * @param signal - Request cancellation and deadline.
     * @param resolution - Name evidence produced by the actual address-pinning resolver, when available.
     * @returns Stable rule decision; unavailable stores reject rather than granting permission.
     */
    checkHttp(destination: HttpFetchDestination, signal: AbortSignal, resolution?: TargetHttpResolution): Promise<TargetDecision>;
    /**
     * Resolve names and addresses together, retaining the shared public-address and NAT64 protections.
     * @param hostname - URL hostname to resolve.
     * @param signal - Request cancellation and deadline.
     * @returns Bound DNS evidence and the exact validated address set for connection pinning.
     */
    resolveHttpTarget(hostname: string, signal: AbortSignal): Promise<TargetHttpResolution>;
    /**
     * Resolve an owner-configured endpoint in the current client's network, without relaxing anonymous HTTP SSRF checks.
     * @param hostname - Explicit deployment target; never an arbitrary fetch URL.
     * @param signal - Connection cancellation and deadline.
     * @returns Names and literal addresses that the connection consumer must authorize and pin.
     */
    resolveConnectionTarget(hostname: string, signal: AbortSignal): Promise<TargetConnectionResolution>;
    private resolveConnection;
    /**
     * Check a pinned connection or an operation on its authenticated peer.
     * @param hostname - Original configured host.
     * @param port - Known service port; omission requires decisions without a verified port scope.
     * @param resolution - Actual pinned address evidence; omission performs only pre-resolution checks.
     * @param scope - Whether effects stay on one port, use a native database protocol, or may access the peer filesystem.
     * @param effect - Effect guaranteed by the protocol executor, not supplied by the model.
     * @param signal - Operation cancellation and deadline.
     * @param database - Executor-selected protocol database, verified before application queries; omission leaves database scope unknown.
     * @param foldDatabaseCase - Treat database names that differ only in case as possible aliases.
     * @param databaseResources - Associations for database scope; path-only production resources without a known endpoint remain unverified.
     * @returns A current rule decision; unavailable identity and registry failures never authorize fallback.
     * @throws TARGET_IDENTITY_UNVERIFIED when an associated resource is missing or is a domain resource.
     */
    checkConnection(hostname: string, port: number | undefined, resolution: TargetConnectionResolution | undefined, scope: 'endpoint' | 'filesystem' | 'database', effect: TargetEffect, signal: AbortSignal, database?: string, foldDatabaseCase?: boolean, databaseResources?: readonly DatabaseResourceBinding[]): Promise<TargetDecision>;
    /**
     * Bind central path resources to one verified SSH executor without changing ordinary connection admission.
     * @param binding - Destination and mapped resource IDs selected by the owner; retain its revision before calling.
     * @returns A prepared policy. Call activate only after the digest-verified helper acknowledges its exact path rules.
     * @throws When a resource is not an active production path, the revision changed or an owner is unavailable.
     */
    bindRemoteFilesystem(binding: RemoteFilesystemBinding): RemoteFilesystemPolicy;
    private auditConnection;
    private connectionDecision;
    private dnsOptions;
    private resolveTarget;
    private check;
    private decideNetwork;
}
//# sourceMappingURL=index.d.ts.map