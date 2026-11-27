/** One freshly resolved host-local path, including a prospective file under existing parents. */
export interface LocalPathIdentity {
    path: string;
    canonical: string;
    /** Full-precision native volume/file identifiers; absent for a missing file or unavailable identity. */
    fileId?: string;
    /** Whether the final entry exists, independently of ancestor existence or identity support. */
    exists: boolean;
    multipleLinks: boolean;
    directory: boolean;
    /** Complete verified hard-link names, when the executor can enumerate them. */
    aliases?: readonly string[];
}
/** @param identity - Resolved file or directory. @returns Logical, canonical and verified alias names. */
export declare function localIdentityPaths(identity: LocalPathIdentity): readonly string[];
/**
 * Include SQLite companion names beside each verified identity of a database file.
 * @param identity - The database file identity used to admit the main file.
 * @returns Distinct companion paths. Directory rules already include their descendants.
 */
export declare function localDatabaseCompanionPaths(identity: LocalPathIdentity): string[];
/**
 * Validate an absolute host path without resolving links. Windows device, UNC and alternate streams are refused.
 * @param value - Owner or executor path in the host filesystem.
 * @returns Normalized absolute path preserving the spelling used for filesystem I/O.
 */
export declare function canonicalLocalPath(value: string): string;
/**
 * Compare canonical local paths by complete components.
 * @param parent - Canonical resource root.
 * @param child - Canonical candidate.
 * @returns Whether the candidate is the root or a descendant.
 */
export declare function localPathContains(parent: string, child: string): boolean;
/**
 * Resolve links and the deepest existing ancestor; broken links and failed metadata cannot become absent files.
 * @param value - Absolute local path to inspect without reading content.
 * @param signal - Cancellation checked around each filesystem query.
 * @returns Canonical path and native file identity when the file exists.
 */
export declare function resolveLocalPathIdentity(value: string, signal: AbortSignal): Promise<LocalPathIdentity>;
//# sourceMappingURL=file-identity.d.ts.map