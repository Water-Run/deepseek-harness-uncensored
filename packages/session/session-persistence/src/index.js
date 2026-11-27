/**
 * Durable session-persistence Service Definition (`ctx.sessionPersistence`). Backends store
 * {@link SessionEvent}s as the event-sourced log and carry non-replayable
 * {@link SessionHeader} metadata separately; callers address one stored
 * session through a {@link SessionHandle} obtained from `create`/`open`.
 * @module @deepseek-ai/dsh-session-persistence
 */
import { Service } from '@deepseek-ai/cordis';
import { SessionDeletionUnsupportedError } from "./errors.js";
export { SessionPersistenceRevision } from "./revision.js";
export { SessionAlreadyExistsError, SessionAlreadyOwnedError, SessionFormatUnsupportedError, SessionHandleClosedError, SessionOwnershipLostError, SessionPersistenceCorruptionError, SessionDeletionUnsupportedError, SessionDeletionIncompleteError, SessionPersistenceNotFoundError, SessionReadOnlyError, sessionFormatVersionRefusal, } from "./errors.js";
export { assertContiguous, assertStoredId, assertVersion, materializeAppendBatch, materializeCreateHeader, validateStoredEvents, } from "./storage-contract.js";
/**
 * Durable append-only session storage addressed through per-session handles.
 *
 * Storage semantics shared by every backend: events are contiguous from seq 0
 * and never rewritten; a torn physical tail is never returned to a reader and
 * is truncated by the write path before its first append; reads validate
 * current-format records only and refuse unknown vocabulary fail-closed.
 * `append` persists best-effort; `flush` — per handle or service-wide — is
 * the durability barrier.
 *
 * Visibility: a created session is observable through `stat`/`list`/`open`
 * in this process from the moment `create` resolves, even while a backend
 * defers physical materialization (a pure optimization); other processes see
 * the session only once it materializes, and a session that never
 * materialized before a crash never existed. `SessionHandle.flush` forces
 * materialization.
 *
 * Freshness: once an `append` or `flush` resolves, reads started afterwards
 * on this backend instance observe at least that prefix.
 */
export class SessionPersistence extends Service {
    /** Process-local instance identity, stable through Context proxies and distinct after service replacement. */
    identity = Symbol('sessionPersistence');
    constructor(ctx) {
        super(ctx, 'sessionPersistence');
    }
    /** Whether this provider can permanently delete a group after acquiring all of its writers. */
    get supportsDeletion() { return false; }
    /**
     * Serialize native child publication and conversation-family deletion across processes sharing this storage.
     * Callers must materialize new children before returning; nested calls are unsupported.
     * Providers without deletion support need no exclusion and run the operation directly.
     * @param _sessionId - Conversation identity used for contention errors.
     * @param operation - Entire discovery/publication or deletion transaction.
     * @returns The operation result after releasing exclusion.
     */
    withCatalogMutation(_sessionId, operation) { return operation(); }
    /**
     * List permanently retired identities for idempotent derived-index cleanup after restart.
     * These records contain only identities, never conversation content.
     * @returns Durable deletion identities; empty for providers without deletion support.
     */
    deletedSessionIds() { return Promise.resolve([]); }
    /**
     * Permanently delete Sessions after their live owners have released the writers.
     * Providers without deletion reject explicitly. A successful delete leaves no readable Session
     * or Session-owned files. Providers acquire every target's writer exclusion before removing any target.
     * Already absent identities are omitted. Workspace files are never included.
     * @param ids - Session identities, in the desired deletion order.
     * @returns Identities whose stored or retired files were removed.
     * @throws SessionAlreadyOwnedError while a writer still holds the Session.
     * @throws SessionDeletionIncompleteError after catalog removal if retired-file cleanup fails; retry is safe.
     */
    deleteSessions(ids) {
        if (ids.length === 0)
            return Promise.resolve([]);
        return Promise.reject(new SessionDeletionUnsupportedError(ids[0]));
    }
}
export default SessionPersistence;
//# sourceMappingURL=index.js.map