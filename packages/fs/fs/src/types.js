/**
 * Vocabulary for the filesystem Service Definition (`ctx.fs`): the opaque target/version
 * identities, the metadata `stat` returns, the write-intent and outcome shapes, the
 * literal-edit request/outcome, and the typed error taxonomy.
 * @module @deepseek-ai/dsh-fs/types
 */
import { HarnessError } from '@deepseek-ai/dsh-llm';
/**
 * Brand a string as an {@link FsTargetKey}. For backend use only — a consumer
 * never manufactures a key, it receives one from `resolve()`.
 * @param key - the backend's raw key string (the local backend passes a realpath).
 * @returns the same string, branded; no validation is performed.
 */
export function FsTargetKey(key) {
    return key;
}
/**
 * Brand a string as an {@link FsVersion}. For backend use only — a consumer
 * never manufactures a version, it receives one from `stat`/write/edit outcomes.
 * @param v - the backend's raw version string.
 * @returns the same string, branded; no validation is performed.
 */
export function FsVersion(v) {
    return v;
}
/** Stable filesystem failure codes shared by providers, consumers, and wire validators. */
export const FS_ERROR_CODES = [
    'FS_PARTIAL_MUTATION',
    'FS_ALREADY_EXISTS',
    'FS_NOT_FOUND',
    'FS_NOT_DIRECTORY',
    'FS_NOT_TEXT',
    'FS_NOT_REGULAR_FILE',
    'FS_TOO_LARGE',
    'FS_PERMISSION_DENIED',
    'FS_SANDBOX_DENIED',
    'FS_IO_ERROR',
    'FS_STALE_VERSION',
    'FS_NOT_OBSERVED',
    'FS_AMBIGUOUS_EDIT',
    'FS_EDIT_NOT_FOUND',
    'FS_ABORTED',
    'FS_PATCH_MISMATCH',
    'FS_SAME_TARGET',
    'FS_ALREADY_EXISTS',
];
/**
 * Typed filesystem error. Extends {@link HarnessError} so it carries a stable
 * {@link FsErrorCode} and chains `cause`. `dsh-fs` owns this vocabulary so
 * backends and the policy layer raise the same codes instead of each inventing
 * message strings.
 */
export class FsError extends HarnessError {
    code;
    constructor(message, code, options) {
        super(message, code, options);
        this.name = 'FsError';
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map