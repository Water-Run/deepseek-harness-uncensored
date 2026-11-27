import { z } from 'zod';
import { type Branded } from '@deepseek-ai/dsh-brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
declare const recordSchema: z.ZodObject<{
    at: z.ZodNumber;
    revision: z.ZodNullable<z.ZodNumber>;
    operation: z.ZodEnum<{
        connection: "connection";
        http: "http";
        "proxy-http": "proxy-http";
        file: "file";
        unconfined: "unconfined";
        "http-dns": "http-dns";
        "connection-dns": "connection-dns";
    }>;
    effect: z.ZodEnum<{
        unconfined: "unconfined";
        observe: "observe";
        mutate: "mutate";
        unknown: "unknown";
        metadata: "metadata";
        read: "read";
        list: "list";
        watch: "watch";
    }>;
    phase: z.ZodEnum<{
        preflight: "preflight";
        execution: "execution";
    }>;
    fingerprint: z.ZodNullable<z.ZodString>;
    peerFingerprint: z.ZodNullable<z.ZodString>;
    target: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    peers: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    decision: z.ZodEnum<{
        deny: "deny";
        error: "error";
        allow: "allow";
        cancelled: "cancelled";
    }>;
    code: z.ZodNullable<z.ZodEnum<{
        TARGET_FULLY_PROTECTED: "TARGET_FULLY_PROTECTED";
        TARGET_READ_ONLY: "TARGET_READ_ONLY";
        TARGET_IDENTITY_UNVERIFIED: "TARGET_IDENTITY_UNVERIFIED";
        TARGET_MAINLAND_PROTECTED: "TARGET_MAINLAND_PROTECTED";
        TARGET_OWNER_RESOURCE: "TARGET_OWNER_RESOURCE";
        TARGET_EXECUTION_UNCONFINED: "TARGET_EXECUTION_UNCONFINED";
        TARGET_CHECK_CANCELLED: "TARGET_CHECK_CANCELLED";
        TARGET_SETTINGS_CHANGED: "TARGET_SETTINGS_CHANGED";
        TARGET_CHECK_FAILED: "TARGET_CHECK_FAILED";
        TARGET_RESOLUTION_FAILED: "TARGET_RESOLUTION_FAILED";
        TARGET_CHECK_TIMEOUT: "TARGET_CHECK_TIMEOUT";
    }>>;
    ruleIds: z.ZodArray<z.ZodUUID>;
    matchedRules: z.ZodNumber;
    source: z.ZodOptional<z.ZodObject<{
        sessionId: z.ZodType<SessionId, string, z.core.$ZodTypeInternals<SessionId, string>>;
        parentSessionId: z.ZodOptional<z.ZodType<SessionId, string, z.core.$ZodTypeInternals<SessionId, string>>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Typed audit outcome. Both a readable target and a store-keyed fingerprint are recorded. */
export type TargetAuditRecord = z.infer<typeof recordSchema>;
/** Stable row identity within its owning audit database. */
export type TargetAuditId = Branded<'TargetAuditId'>;
/** One persisted check with its database-assigned identity. */
export type TargetAuditEntry = TargetAuditRecord & {
    id: TargetAuditId;
};
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** Execution admission recorded by the optional target audit owner; never model-visible. */
        'target/admission': TargetAuditEntry;
    }
}
/** Latest accepted audit records, newest first. */
export interface TargetAuditHistory {
    state: 'off' | 'ready' | 'unavailable';
    entries: TargetAuditEntry[];
}
/** One internal audit subject. Raw inputs exist only long enough to fingerprint them. */
export interface AuditSubject {
    operation: TargetAuditRecord['operation'];
    effect: TargetAuditRecord['effect'];
    phase: TargetAuditRecord['phase'];
    identity?: readonly (string | number | undefined)[];
    peers?: readonly string[];
}
type Outcome = Pick<TargetAuditRecord, 'revision' | 'decision' | 'code'> & {
    ruleIds: readonly string[];
};
/** Independent SQLite owner so an audit write never upgrades the rule registry's read lease. */
export declare class TargetAuditStore {
    private readonly db;
    private readonly secret;
    private readonly limit;
    private constructor();
    /**
     * Open or initialize a dedicated audit database without overwriting other SQLite files.
     * @param path - Deployment-owned file, separate from the rule registry.
     * @param busyTimeoutMs - Bounded lock wait.
     * @param limit - Maximum records retained across all writers.
     * @returns An owned audit database with its stable fingerprint key.
     */
    static open(path: string, busyTimeoutMs: number, limit: number): Promise<TargetAuditStore>;
    /**
     * Persist one decision and remove records beyond the retention limit in the same transaction.
     * @param subject - Execution stage and identities to record and fingerprint.
     * @param outcome - Stable rule decision or check failure.
     * @param source - Exact initiating Session and its recorded parent; absent for agentless calls.
     * @returns The committed entry, including its database identity.
     */
    append(subject: AuditSubject, outcome: Outcome, source?: TargetAuditRecord['source']): TargetAuditEntry;
    /** @returns Up to 100 verified audit records, newest first. */
    recent(): TargetAuditEntry[];
    /** Release the local SQLite connection. */
    close(): void;
}
export {};
//# sourceMappingURL=audit.d.ts.map