import type { TargetPreferences, TargetSnapshot } from './types.ts';
/** On-disk format; successors must use a larger value. */
export declare const SCHEMA_VERSION = 3;
/** One database owner. Reads return newly parsed committed state rather than a process-local cache. */
export declare class TargetStore {
    private readonly db;
    private readonly memory;
    private closed;
    private transactionActive;
    private leases;
    private constructor();
    /**
     * Open an explicitly selected store. Only an empty database is initialized.
     * @param filename - Deployment-owned registry path or :memory: for tests.
     * @param busyTimeoutMs - Bounded SQLite lock wait in milliseconds.
     * @returns Owned store, or an error without resetting existing settings.
     */
    static open(filename: string, busyTimeoutMs: number): Promise<TargetStore>;
    private transaction;
    private assertOpen;
    /**
     * Read the latest committed revision and validate every stored rule.
     * @returns A fresh settings value; failures never produce default allow rules.
     */
    snapshot(): TargetSnapshot;
    private readSnapshot;
    private readPreferences;
    /**
     * Validate and atomically replace the settings after a revision check.
     * @param preferences - Complete owner-selected rules.
     * @param expectedRevision - Revision read by the editing caller.
     * @returns The committed successor; concurrent or invalid changes do not overwrite settings.
     */
    configure(preferences: TargetPreferences, expectedRevision: number): TargetSnapshot;
    /**
     * Hold a committed policy revision through an executor's final effect.
     * @param expectedRevision - Revision that authorized the operation.
     * @returns Idempotent release; other writers cannot commit until it is called.
     */
    retainSnapshot(expectedRevision: number): () => void;
    private snapshotRelease;
    /** Release the SQLite handle; an active execution snapshot must be released first. Repeated closure is harmless. */
    close(): void;
}
//# sourceMappingURL=store.d.ts.map