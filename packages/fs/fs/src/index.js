/**
 * Filesystem Service Definition for one execution world. Backends own stable target
 * identity, process paths and file URIs, containment, text reads, decoding,
 * binary rejection, atomic content writes, and structured file removal and renaming. Read windows and
 * observed-state policy stay in consumer and policy plugins; `editText`
 * remains here so version check, literal match, and rewrite share one critical
 * section.
 * @module @deepseek-ai/dsh-fs
 */
import { Service } from '@deepseek-ai/cordis';
import { FsError } from "./types.js";
export { fsErrorFromErrno } from "./errno.js";
export { FS_ERROR_CODES, FsError, FsTargetKey, FsVersion, } from "./types.js";
/**
 * Abstract filesystem provider. Targets must preserve identity across aliases;
 * reads expose regular UTF-8 text or typed errors, listings are stable and
 * content-free, and single-file publication is atomic. Moves can retain their
 * source after publishing the destination. Optional guards add stale protection
 * without changing the unguarded provider contract.
 */
export class FileSystem extends Service {
    constructor(ctx) {
        super(ctx, 'fs');
    }
    /**
     * Delete one regular file, never a directory or a symbolic-link entry.
     * @param target - Resolved file; providers reject a final symbolic link in either path representation.
     * @param expected - Required observed source version; stale sources remain untouched.
     * @param signal - Cancels before the deletion syscall; committed deletion remains successful.
     * @param sandboxPolicy - Per-call mutation policy; omission uses the provider default.
     * @returns Completion after deletion; unsupported providers reject without effects.
     */
    removeFile(target, expected, signal, sandboxPolicy) {
        void target;
        void expected;
        void sandboxPolicy;
        signal?.throwIfAborted();
        return Promise.reject(new FsError('File deletion is not supported by this provider.', 'FS_IO_ERROR'));
    }
    /**
     * Move one regular file to an absent destination on the same filesystem, without overwriting.
     * Local providers publish an exclusive hard link before unlinking the source. If source removal
     * fails after publication, FS_PARTIAL_MUTATION reports that both names may remain; inspect both
     * paths before retrying. Directories, final symbolic links and cross-filesystem moves are refused.
     * @param source - Resolved source file.
     * @param destination - Resolved absent destination; its parent must already exist.
     * @param expected - Required observed source version; checks are serialized with provider mutations.
     * @param signal - Cancels before publication; after publication the committed move finishes source removal.
     * @param sandboxPolicy - Per-call policy applied to both paths; omission uses the provider default.
     * @returns Completion after both names have reached the requested state.
     */
    renameFile(source, destination, expected, signal, sandboxPolicy) {
        void source;
        void destination;
        void expected;
        void sandboxPolicy;
        signal?.throwIfAborted();
        return Promise.reject(new FsError('File renaming is not supported by this provider.', 'FS_IO_ERROR'));
    }
    /**
     * Observe one file or a directory's direct entries in this provider's execution world.
     * @param target - resolved file or directory, including an absent path to observe for creation.
     * @param changed - invalidation callback; errors can be reported during or after initialization.
     * @param signal - cancels watcher initialization; the caller closes an initialized watcher.
     * @returns a promise resolving once observation is active, with an asynchronous close function.
     * @throws when the provider does not support watching or cannot initialize the watcher.
     */
    watch(target, changed, signal) {
        void target;
        void changed;
        signal.throwIfAborted();
        return Promise.reject(new FsError('Filesystem watching is not supported by this provider.', 'FS_IO_ERROR'));
    }
    /**
     * The sandbox mode this backend enforces on mutations BY DEFAULT, or
     * `undefined` when it does not confine at all — the capability fact the tool
     * layer reads to advertise the escalation fields honestly (mirrors
     * `ShellExecutor.sandboxMode`). The base class and the bare local backend
     * report `undefined`; a sandboxing backend (`@deepseek-ai/dsh-fs-sandbox`)
     * overrides it with the deployment default. A session override may make the
     * effective mode narrower or wider, so strict escalation widening is checked
     * per call rather than encoded in this default-relative fact.
     * @returns the configured default mode of a sandboxing backend; `undefined`
     *   for a backend that never confines.
     */
    get sandboxMode() {
        return undefined;
    }
    /**
     * Map an absolute path from the harness host into this filesystem's
     * execution world when both paths identify the same file. The base provider
     * exposes no mapping; host-backed or explicitly shared backends override it.
     * @param hostPath - absolute path in the harness host filesystem.
     * @returns the process path for the same file, or undefined when this
     *   execution world cannot read that host file.
     */
    processPathFromHostPath(hostPath) {
        void hostPath;
        return undefined;
    }
}
export default FileSystem;
//# sourceMappingURL=index.js.map