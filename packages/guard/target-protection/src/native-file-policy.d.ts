/** A restriction supplied by the rule owner, never by a command argument. */
export interface NativeFileConstraint {
    path: string;
    access: 'deny' | 'read-only';
    /** Database files include their SQLite-style journal companions. */
    database?: boolean;
}
/** One committed revision and its owner/file restrictions. */
export interface NativeFileConstraints {
    revision: number;
    entries: readonly NativeFileConstraint[];
}
/** Explicit deployment grants and a bounded filesystem scan. */
export interface NativeFileGrants {
    readonlyPaths: readonly string[];
    readwritePaths: readonly string[];
    maxEntries: number;
    maxPaths: number;
}
/** Detached path policy; the caller must retain its revision before native launch. */
export interface NativeFilePolicy {
    revision: number;
    readonlyPaths: string[];
    readwritePaths: string[];
    deniedPaths: string[];
    enumeratePaths: string[];
}
/**
 * Expand restrictions, linked directory contents and hard-link names before native execution.
 * @param constraints - Immutable owner snapshot, including private configuration and data sources.
 * @param grants - Explicit readable/writable deployment roots and positive scan budget.
 * @param signal - Cancels every filesystem phase; no policy is returned after cancellation or incomplete scanning.
 * @returns A native policy with production restrictions taking precedence over writable grants.
 */
export declare function compileNativeFilePolicy(constraints: NativeFileConstraints, grants: NativeFileGrants, signal: AbortSignal): Promise<NativeFilePolicy>;
//# sourceMappingURL=native-file-policy.d.ts.map