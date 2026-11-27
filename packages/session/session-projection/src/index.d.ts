/**
 * Service Definition and drive registry for the session-projection capability seam: the merge-extensible client-view type
 * table, the `ProjectionDefinition` state-driven computation unit contract,
 * and the `ctx.sessionProjections` registry that DRIVES every registered unit
 * forward eagerly over committed session events. Domain host plugins
 * contribute pure folds and optional client views; the framework owns the
 * subscription, the per-session watermark cache, and change notification;
 * carriers consume the snapshot read face and the change feed. Neither side
 * knows the other
 * (capability-seam three-way split). Design authority: the session-projection
 * RFC (.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md).
 *
 * Whole-value event rule (load-bearing): a state-carrying log event MUST
 * carry the complete post-change state, never a bare delta — it keeps every
 * unit's transition trivially cheap and every served value self-describing.
 *
 * @module @deepseek-ai/dsh-session-projection
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { ZodType } from 'zod';
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session';
import type { Session, SessionEvent, SessionHeader, SessionSeqCursor } from '@deepseek-ai/dsh-session';
declare module '@deepseek-ai/cordis' {
    interface Context {
        sessionProjections: SessionProjectionRegistry;
    }
}
import type { SessionProjectionMap, SessionProjectionViewValue } from './types.ts';
export type { SessionProjectionMap, SessionProjectionSummaryExcluded, SessionProjectionSummaryExcludedKey, SessionProjectionSummaryValues, SessionProjectionViewValue, SessionProjectionViewValues, } from './types.ts';
/** An effect-owned registration with a reader retained independently of registration. */
export interface ProjectionHandle<S> {
    /**
     * Read the current state, including after unregistering, by folding new
     * Session events with this handle's original unit. Do not mutate the live value.
     * After the final release, a read also advances the released cell that
     * `checkpoint(session)` serves, until the key registers again.
     * @param session - Session whose committed events are folded.
     * @returns the projection state at the Session's current cursor.
     */
    stateOf(session: Session): S;
    /**
     * Create a reader for one exact Session without reading state or preparing it.
     * The reader retains this unit after unregistration and owns no disposal.
     * @param session - Session whose committed events the bound reader folds.
     * @returns a synchronous callback with the same state and failures as `stateOf(session)`.
     */
    readerFor(session: Session): () => S;
    /**
     * Unregister from global drives and snapshots without invalidating this reader.
     * @returns a promise that resolves when this registration is released.
     */
    dispose(): Promise<void>;
}
/**
 * One domain's state-driven computation unit: a pure synchronous fold plus
 * declarations and an optional client view — never an opaque getter. The framework drives
 * `apply` on every committed session event; the domain holds no
 * subscriptions and owns only the computation. All functions MUST be
 * synchronous (an async unit would tear the carriers' consistency cut), and
 * `state` MUST be plain JSON (the persisted-cache precondition).
 */
export interface ProjectionDefinition<K extends string, S> {
    /** The projection key this unit owns. */
    key: K;
    /** Validates persisted state before it seeds a fold. */
    stateSchema: ZodType<S>;
    /**
     * State for the empty log and its immutable Session metadata.
     * @param header - immutable metadata for the Session being projected.
     * @param inheritedEventCount - exact fork-inherited prefix length.
     * @returns the initial state.
     */
    init(header: SessionHeader, inheritedEventCount: SessionLogOffset): NoInfer<S>;
    /**
     * Pure transition: previous state + one committed event → next state. A
     * unit uninterested in an event MUST return the same state reference — an
     * unchanged reference (`Object.is`) produces zero downstream work.
     * @param state - the state covering all prior events.
     * @param event - the next committed session event.
     * @returns the next state (same reference when the event is not the unit's).
     */
    apply(state: NoInfer<S>, event: SessionEvent): NoInfer<S>;
    /** Client view. Omit for host-only units. */
    wire?: K extends keyof SessionProjectionMap ? {
        /** Validates the wire payload before it leaves the host. */
        viewSchema: ZodType<SessionProjectionViewValue<SessionProjectionMap[K]>>;
        /**
         * State → wire payload (the read-side projection). The live drive keeps
         * the two latest raw results and compares them with `Object.is`; an
         * object-valued view must reuse its reference to suppress publication
         * across internal-only state changes.
         * @param state - the current state.
         * @returns the whole current value for this unit's key.
         */
        view(state: NoInfer<S>): SessionProjectionViewValue<SessionProjectionMap[K]>;
        /**
         * Whether a Session summary carries this unit; omitted means `true`.
         * Declare `false` on a key whose map entry carries the
         * `SessionProjectionSummaryExcluded` mark: the runtime key set follows this
         * field, while the client view type follows the mark.
         * @default true
         */
        summary?: boolean;
    } : never;
    /**
     * Non-negative persisted-cache invalidation version. Bump when state fields or fold
     * semantics change, except for optional additions whose absence preserves historical
     * meaning and whose old-checkpoint suffix replay matches full replay. Test that
     * equivalence before retaining a version; schema acceptance alone is insufficient.
     */
    stateVersion: number;
}
/**
 * Change-feed listener: one unit's raw `view` result changed by `Object.is`
 * for one session. `value` is the schema-validated output; `seq` is the
 * unit's watermark at emission (the seq of the event that caused the change).
 */
export type ProjectionChangeListener = (session: Session, key: Extract<keyof SessionProjectionMap, string>, value: unknown, seq: SessionSeq) => void;
/**
 * Event-level change-feed listener: one committed event changed the raw `view`
 * result of at least one client-visible unit by `Object.is` for one session.
 * `changes` holds one entry per such unit in registration order, each with the
 * unit's `key` and its schema-validated view as `val`; `seq` is the seq of the
 * causing event.
 */
export type ProjectionEventChangeListener = (session: Session, changes: readonly {
    readonly key: Extract<keyof SessionProjectionMap, string>;
    readonly val: unknown;
}[], seq: SessionSeq) => void;
/**
 * One read's client-visible key selection: an explicit key list, or a derived
 * set such as {@link SessionProjectionRegistry.summaryKeys}. A set is used as
 * given; only a list is copied into one.
 */
export type ProjectionKeySelection = readonly Extract<keyof SessionProjectionMap, string>[] | ReadonlySet<Extract<keyof SessionProjectionMap, string>>;
/**
 * One consistent read cut over every registered client-visible unit for one session.
 * `asOfSeq` is the shared watermark — the seq of the last event every value
 * reflects (`-1` for an empty log).
 */
export interface ProjectionSnapshot {
    /** Seq of the last event the values reflect; -1 for an empty log. */
    asOfSeq: SessionSeqCursor;
    /** Whole current client value per registered key. */
    values: Partial<SessionProjectionMap>;
}
/**
 * One unit's checkpoint: its internal state (plain JSON by the unit
 * contract), the seq of the last event folded into it, and the unit
 * `stateVersion` that produced it — the persisted projection-cache row
 * `(sessionId, key, ver, seq, val)` minus the two outer keys. A row is
 * never authoritative, only a fold shortcut: `restore` discards it on a
 * version mismatch or when it claims events past the stored log end.
 */
export interface ProjectionCheckpointRow {
    /** The registering unit's `stateVersion` at fold time. */
    ver: number;
    /** Seq of the last event folded into `val`; -1 for the empty log. */
    seq: SessionSeqCursor;
    /** The unit's internal state — plain JSON per the unit contract. */
    val: unknown;
}
/** Checkpoint rows keyed by projection key (one session's persisted cache value). */
export type ProjectionCheckpoint = Record<string, ProjectionCheckpointRow>;
/**
 * `ctx.sessionProjections`: the projection unit table and its drive. The
 * service subscribes to `session/event` once; every committed event passes
 * every registered unit's `apply` (eager drive). A changed state reference
 * computes the next client view; the change feed is notified only when its
 * raw result changes by `Object.is`.
 * Cells build lazily — a unit registered after events flowed, or a session
 * older than the registry, folds `init` over the in-memory log on first
 * touch (event or read). Consumers declare `sessionProjections` as a required
 * injection, await registration during activation, and retain its ready handle.
 * Registrants sharing a key share one unit and are counted. The last release
 * removes the unit from live drives, restores, and client snapshots, while
 * checkpoints keep each Session's last cell of it until the key registers
 * again and the new unit refolds the log; retained handles still fold new
 * events on demand using the original unit.
 */
export declare class SessionProjectionRegistry extends Service {
    private readonly registrations;
    /** Stable summary key set; dropped whenever the key table changes. */
    private summaryKeySet;
    private readonly listeners;
    private readonly eventListeners;
    /** Keys whose deprecated registry-level read has already been reported. */
    private readonly deprecatedStateOfKeys;
    /**
     * Create and install the registry as `ctx.sessionProjections`.
     * @param ctx - Cordis context that owns the service.
     */
    constructor(ctx: Context);
    /**
     * Register one domain's unit on the calling context's fiber. Fiber or handle
     * disposal releases one reference; the final release removes live participation.
     * Retained handles remain readable after release.
     * Callers must await registration before publishing consumers; registration may perform asynchronous work.
     * @param definition - key, state schema, pure unit functions, and stateVersion.
     * @returns an awaitable yielding a ready handle; the callable runtime value is deprecated.
     */
    register<K extends keyof SessionProjectionMap, S>(definition: Omit<ProjectionDefinition<K, S>, 'wire'> & {
        wire: NonNullable<ProjectionDefinition<K, S>['wire']>;
    }): Promise<ProjectionHandle<S>>;
    /**
     * Register one host-only unit. Its state is omitted from client snapshots
     * and always checkpointed like every other unit.
     * Callers must await registration before publishing consumers; registration may perform asynchronous work.
     * @param definition - key, state schema, pure unit functions, and stateVersion.
     * @returns an awaitable yielding a ready handle; the callable runtime value is deprecated.
     */
    register<K extends string, S>(definition: ProjectionDefinition<K, S> & {
        key: Exclude<K, keyof SessionProjectionMap>;
    }): Promise<ProjectionHandle<S>>;
    /** Install one unit; `onEffect` receives its release before the asynchronous handoff. */
    private acquire;
    /**
     * Read a currently registered unit after materializing every registered
     * unit at the Session cursor. Unrelated wire views are not produced.
     * The returned state is live; do not mutate it. A released key has no value.
     * The first read of each key logs one deprecation warning per registry.
     * @param session - Session whose committed events are folded.
     * @param key - key of the registered projection.
     * @returns the current state, or `undefined` when the unit is not registered.
     * @deprecated Use an awaited registration's `handle.stateOf(session)` or the owning domain service.
     */
    stateOf(session: Session, key: string): unknown;
    /**
     * Subscribe to the change feed. The registration is an effect on the
     * calling context's fiber.
     * @param listener - called once per client-visible unit whose raw view changed by `Object.is`, per committed event.
     * @returns the exact disposer that unsubscribes.
     */
    onChanged(listener: ProjectionChangeListener): () => void;
    /**
     * Subscribe to the event-level change feed. The registration is an effect on
     * the calling context's fiber. The listener runs synchronously inside the
     * committed event's `session/event` handling, once after every unit has been
     * driven and after every {@link onChanged} call for that event. If a unit or
     * an {@link onChanged} listener throws during that drive, the listener still
     * receives the changes made before the throw.
     * @param listener - called once per committed event that changed at least one client-visible unit's raw view by `Object.is`.
     * @returns the exact disposer that unsubscribes.
     */
    onEventChanged(listener: ProjectionEventChangeListener): () => void;
    /**
     * One consistent cut over every registered client-visible unit for one session, read from
     * the watermark cache (missing cells fold lazily over the in-memory log).
     * Only the returned units are computed: other units, including Host-only
     * units without `wire`, are neither folded nor advanced by this read.
     * Fully synchronous — every value and `asOfSeq` reflect the same log
     * position. Each value passes its unit's `viewSchema` before leaving.
     * @param session - the session whose projection values are read.
     * @param keys - optional client-visible outputs; only these units are computed.
     * @returns the snapshot; `values` is empty when no selected client-visible unit is registered.
     */
    snapshot(session: Session, keys?: ProjectionKeySelection): ProjectionSnapshot;
    /**
     * Read only already-materialized client-visible cells without folding history.
     * Values may trail the live Session and are therefore hints, not a complete
     * baseline. Missing cells are omitted.
     * @param session - attached Session whose cached cells are inspected.
     * @param keys - optional wire keys to view.
     * @returns the lowest common cached cut, or `undefined` when no wire cell exists.
     * @deprecated Returns only values another read already computed and may omit keys; never use it to decide behavior.
     *   Use snapshot(session, keys) for complete values, or a retained handle for host state.
     */
    cachedSnapshot(session: Session, keys?: ProjectionKeySelection): ProjectionSnapshot | undefined;
    /**
     * The keys a Session summary carries: every registered client-visible key
     * whose unit does not declare `summary: false`. The returned set is stable —
     * the same instance on every call — until a registration or its disposal
     * changes the key table, so a consumer may hold it across rows. Callers pass
     * it to a key-taking read face such as `snapshot(session, summaryKeys())`
     * or `viewCheckpoint(rows, summaryKeys())`; those faces use the set as-is.
     * @returns the current summary key set; do not mutate it.
     */
    summaryKeys(): ReadonlySet<Extract<keyof SessionProjectionMap, string>>;
    /** Rebuild the summary key set from the current registrations. */
    private deriveSummaryKeys;
    /**
     * State-level checkpoint of every persisted unit for one session, read
     * from the watermark cache (missing cells fold lazily over the in-memory
     * log). This is the write side of the persisted projection cache: the
     * returned rows are the `(key → {ver, seq, val})` part of the durable
     * `(sessionId, key, ver, seq, val)`
     * rows. Every `val` is a DETACHED structured clone — never the live
     * cell reference: the watermark cache is this registry's authoritative
     * mutable state, and a caller reaching the live reference could corrupt
     * every subsequent snapshot and frame through it (plain JSON by the unit
     * contract, so the clone is total).
     * A released unit contributes the Session's last cell. The registry no
     * longer advances that cell, while a retained handle read still advances it
     * forward, so a writer running after a plugin unloads keeps that unit's
     * latest state; a Session that has no cell of it gets no row. {@link restore}
     * folds only live units, so its refreshed rows omit released units.
     * @param session - the session whose unit states are checkpointed.
     * @returns one row per registered key, plus one per released key with a cell for this Session.
     */
    checkpoint(session: Session): ProjectionCheckpoint;
    /**
     * The stored seq a {@link restore} tail read over `checkpoint` must start
     * at: one event BELOW the lowest usable watermark (a row is usable when
     * its `ver` matches the live unit's `stateVersion`; an absent or mismatched row
     * pulls the floor to `0` — that key must refold the full log). The
     * one-below anchor is load-bearing: the tail then proves how far the
     * stored log still extends, so {@link restore} can detect a log that
     * shrank below a row's watermark (crash-repair truncation) instead of
     * serving the stale row as current — an empty tail read from the anchor
     * yields an end below every watermark and the restore rejects for a full
     * re-read.
     * @param checkpoint - persisted rows for one session (possibly stale or empty).
     * @returns the offset for the stored-log suffix read (`SessionHandle.read`),
     *   or `undefined` when no live unit is registered (released predecessors do not count; no read needed —
     *   {@link restore} would serve empty values regardless).
     */
    restoreFloor(checkpoint: ProjectionCheckpoint): SessionLogOffset | undefined;
    /**
     * View a checkpoint's rows without any log read: for every registered
     * client-visible unit whose row's `ver` matches, serve the schema-validated
     * `view` of the schema-validated stored state; mismatched, malformed, or absent rows leave their key
     * absent (a cold or listing consumer treats it as not-yet-available and a
     * fuller read path refolds it). The zero-I/O rung of the read ladder —
     * values are as stale as their rows, never wrong.
     * @param checkpoint - persisted rows for one session (possibly stale or empty).
     * @param keys - optional wire keys to view.
     * @returns whole values per key with a usable row; empty when none.
     */
    viewCheckpoint(checkpoint: ProjectionCheckpoint, keys?: ProjectionKeySelection): Partial<SessionProjectionMap>;
    /**
     * Cold read: fold every persisted unit over a stored log suffix, seeding
     * each from its checkpoint row when usable — the one read recipe (cached
     * state + forward tail replay + `view`) applied without a live `Session`.
     * Call with the stored events at or past `restoreFloor(checkpoint)` (a
     * `SessionHandle.read` slice) and that same floor as
     * `baseSeq`; the floor's one-below anchor makes the supplied end honest,
     * so a shrunk log is detected here. A row is usable iff its
     * `ver` matches the live unit's `stateVersion`, it does not predate `baseSeq`
     * (`seq >= baseSeq - 1`), and it does not claim events past the
     * supplied end (`seq <= endSeq`); an unusable row is discarded
     * and its key refolds from `init` — which is only sound over the full
     * log, so a discarded row with `baseSeq > 0` throws (the caller re-reads
     * from seq 0, e.g. after a crash-repair truncation shrank the log below
     * a row's watermark).
     * @param checkpoint - persisted rows for one session (possibly stale or empty).
     * @param events - the stored events with `seq >= baseSeq`, in seq order.
     * @param baseSeq - the seq `events` starts at (its first event's seq when non-empty).
     * @param header - immutable metadata for the Session being restored.
     * @param inheritedEventCount - exact fork-inherited prefix length supplied to unit initialization.
     * @returns the snapshot cut at the supplied log end (`asOfSeq` is the last
     *   supplied event's seq, `baseSeq - 1` for an empty tail) plus the
     *   refreshed checkpoint rows at that cut, ready for a durable write-back.
     *   The rows cover live units only: a released unit has no cell for a log
     *   folded without a live `Session`, so a write-back of them omits it.
     */
    restore(checkpoint: ProjectionCheckpoint, events: readonly SessionEvent[], baseSeq: SessionLogOffset, header: SessionHeader, inheritedEventCount: SessionLogOffset): {
        snapshot: ProjectionSnapshot;
        checkpoint: ProjectionCheckpoint;
    };
    /**
     * Restore an exact cut and install its states on the supplied prepared Session.
     * A later publication reuses these cells; ordinary live reads and event drive
     * advance any constructor-owned suffix exactly once.
     * @param session - exact prepared Session that owns the restored log prefix.
     * @param checkpoint - persisted rows for this Session lifecycle.
     * @param events - exact events at the observation cut.
     * @param baseSeq - first supplied event sequence.
     * @returns all projection values at the supplied cut.
     */
    hydrate(session: Session, checkpoint: ProjectionCheckpoint, events: readonly SessionEvent[], baseSeq: SessionLogOffset): ProjectionSnapshot;
    /** Materialize every registered unit cell at the Session's current cursor. */
    private materializeCells;
    /** Fold one unit from init over `events`, producing a cell watermarked at the last folded event. */
    private buildCell;
    /** Read (or lazily build, folding the full in-memory log) one unit's cell. */
    private cellFor;
    /** Advance one existing cell through a contiguous Session prefix. */
    private advanceCell;
    /**
     * Eager drive: pass one committed event through every unit; notify per-key
     * listeners on each changed raw view reference, then event listeners once.
     * When a unit or a per-key listener throws, event listeners still receive
     * the changes collected before the throw, and the error then propagates.
     */
    private drive;
    /** Return one schema-validated wire value. */
    private viewCell;
}
export default SessionProjectionRegistry;
//# sourceMappingURL=index.d.ts.map