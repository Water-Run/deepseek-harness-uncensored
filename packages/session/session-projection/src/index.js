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
import { Service } from '@deepseek-ai/cordis';
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session';
/**
 * Narrow one key selection to the set a read loop consults. A caller that
 * already holds a set (such as `summaryKeys()`) is served without a copy; only
 * an explicit list allocates.
 * @param keys - the caller's selection, or `undefined` for every key.
 * @returns the selection as a set, or `undefined` when no selection was given.
 */
function selectedKeys(keys) {
    if (keys === undefined)
        return undefined;
    return keys instanceof Set ? keys : new Set(keys);
}
/** Convert a log offset to the inclusive cursor immediately before it. */
function cursorBefore(offset) {
    return offset === 0 ? -1 : SessionSeq(offset - 1);
}
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
export class SessionProjectionRegistry extends Service {
    registrations = new Map();
    /** Stable summary key set; dropped whenever the key table changes. */
    summaryKeySet;
    listeners = new Set();
    eventListeners = new Set();
    /** Keys whose deprecated registry-level read has already been reported. */
    deprecatedStateOfKeys = new Set();
    /**
     * Create and install the registry as `ctx.sessionProjections`.
     * @param ctx - Cordis context that owns the service.
     */
    constructor(ctx) {
        super(ctx, 'sessionProjections');
        ctx.on('session/created', (session) => {
            if (session.seq !== 0)
                return;
            for (const registration of this.registrations.values()) {
                if (registration.refs === 0)
                    continue;
                if (registration.cells.has(session))
                    continue;
                registration.cells.set(session, {
                    state: registration.def.init(session.header, session.inheritedEventCount),
                    observedSeq: -1,
                    views: [undefined, undefined],
                });
            }
        });
        ctx.on('session/event', (session, event) => {
            this.drive(session, event);
        });
    }
    /** Legacy runtime behavior: [plugin compatibility](../README.md#deprecated-plugin-compatibility). */
    register(definition) {
        const owner = this.ctx;
        // Replaced by the effect disposer unless registration fails before its effect exists.
        let dispose = () => Promise.resolve();
        const ready = this.acquire(definition, (release) => { dispose = release; });
        let observed = false;
        // A legacy caller may never observe the result. Report its rejection instead of leaving an
        // unhandled rejection once the current macrotask and its microtasks have had a chance to
        // observe it; an owner that is no longer loading or active cannot use the handle, so its
        // rejection is dropped.
        void ready.catch((error) => {
            setImmediate(() => {
                if (observed)
                    return;
                if (owner.fiber.state !== 1 /* FiberState.LOADING */ && owner.fiber.state !== 2 /* FiberState.ACTIVE */)
                    return;
                owner.logger.error(error);
            });
        });
        const promise = {
            then(onFulfilled, onRejected) {
                observed = true;
                return ready.then(onFulfilled, onRejected);
            },
            catch(onRejected) {
                observed = true;
                return ready.catch(onRejected);
            },
            finally(onFinally) {
                observed = true;
                return ready.finally(onFinally);
            },
            [Symbol.toStringTag]: 'Promise',
        };
        // Return the effect disposer itself, as the synchronous API did, so a composing effect adopts it.
        // The assigned then() replaces the disposer's own awaitable disposal: awaiting yields the handle.
        // The toStringTag completes the Promise members, so Object.prototype.toString reports a Promise.
        return Object.assign(dispose, promise);
    }
    /** Install one unit; `onEffect` receives its release before the asynchronous handoff. */
    async acquire(definition, onEffect) {
        const wire = definition.wire;
        const erased = {
            key: definition.key,
            stateSchema: definition.stateSchema,
            init: (header, inheritedEventCount) => definition.init(header, inheritedEventCount),
            apply: (state, event) => definition.apply(state, event),
            // The summary mark has no runtime representation: `wire.view` and
            // `viewSchema` are already typed with the mark stripped, so this erase
            // only widens the state type. `summary` carries the declared membership
            // into the erased unit, where the key set reads it.
            wire: wire === undefined
                ? undefined
                : { viewSchema: wire.viewSchema, view: state => wire.view(state), summary: wire.summary !== false },
            stateVersion: definition.stateVersion,
        };
        if (!Number.isSafeInteger(definition.stateVersion) || definition.stateVersion < 0) {
            throw new Error(`session projection ${JSON.stringify(definition.key)} stateVersion must be a non-negative integer, got ${String(definition.stateVersion)}`);
        }
        let registration;
        const dispose = this.ctx.effect(() => {
            const key = erased.key;
            const existing = this.registrations.get(key);
            if (existing === undefined || existing.refs === 0) {
                registration = { def: erased, cells: new WeakMap(), refs: 1 };
                this.registrations.set(key, registration);
                this.summaryKeySet = undefined;
            }
            else {
                if (existing.def.stateVersion !== erased.stateVersion) {
                    throw new Error(`session projection key ${JSON.stringify(key)} is already registered at stateVersion ${String(existing.def.stateVersion)}; refusing to share it with stateVersion ${String(erased.stateVersion)}`);
                }
                if (existing.def.wire?.summary !== erased.wire?.summary) {
                    throw new Error(`session projection key ${JSON.stringify(key)} is already registered with summary=${String(existing.def.wire?.summary)}; refusing to share it with summary=${String(erased.wire?.summary)}`);
                }
                existing.refs += 1;
                registration = existing;
            }
            return () => {
                registration.refs -= 1;
                if (registration.refs === 0) {
                    this.summaryKeySet = undefined;
                }
            };
        }, 'sessionProjections.register()');
        onEffect(dispose);
        // Observe disposal during the asynchronous registration handoff before exposing a reader.
        await Promise.resolve();
        this.ctx.fiber.assertActive();
        const handle = {
            async dispose() {
                await dispose();
            },
            stateOf: (session) => {
                return this.cellFor(registration, session).state;
            },
            readerFor: session => () => handle.stateOf(session),
        };
        return handle;
    }
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
    stateOf(session, key) {
        if (!this.deprecatedStateOfKeys.has(key)) {
            this.deprecatedStateOfKeys.add(key);
            this.ctx.logger.warn(`sessionProjections.stateOf(session, ${JSON.stringify(key)}) is deprecated; read handle.stateOf(session) from an awaited registration, or use the owning domain service`);
        }
        const registration = this.registrations.get(key);
        if (registration === undefined || registration.refs === 0)
            return undefined;
        this.materializeCells(session);
        return this.cellFor(registration, session).state;
    }
    /**
     * Subscribe to the change feed. The registration is an effect on the
     * calling context's fiber.
     * @param listener - called once per client-visible unit whose raw view changed by `Object.is`, per committed event.
     * @returns the exact disposer that unsubscribes.
     */
    onChanged(listener) {
        const dispose = this.ctx.effect(() => {
            this.listeners.add(listener);
            return () => {
                this.listeners.delete(listener);
            };
        }, 'sessionProjections.onChanged()');
        return () => void dispose();
    }
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
    onEventChanged(listener) {
        const dispose = this.ctx.effect(() => {
            this.eventListeners.add(listener);
            return () => {
                this.eventListeners.delete(listener);
            };
        }, 'sessionProjections.onEventChanged()');
        return () => void dispose();
    }
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
    snapshot(session, keys) {
        const values = {};
        const selected = selectedKeys(keys);
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            if (registration.def.wire === undefined)
                continue;
            if (selected !== undefined && !selected.has(registration.def.key))
                continue;
            const cell = this.cellFor(registration, session);
            values[registration.def.key] = this.viewCell(registration, cell);
        }
        return { asOfSeq: cursorBefore(session.seq), values };
    }
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
    cachedSnapshot(session, keys) {
        const values = {};
        let asOfSeq;
        const selected = selectedKeys(keys);
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            if (registration.def.wire === undefined)
                continue;
            if (selected !== undefined && !selected.has(registration.def.key))
                continue;
            const cell = registration.cells.get(session);
            if (cell === undefined)
                continue;
            values[registration.def.key] = this.viewCell(registration, cell);
            if (asOfSeq === undefined || cell.observedSeq < asOfSeq) {
                asOfSeq = cell.observedSeq;
            }
        }
        return asOfSeq === undefined ? undefined : { asOfSeq, values };
    }
    /**
     * The keys a Session summary carries: every registered client-visible key
     * whose unit does not declare `summary: false`. The returned set is stable —
     * the same instance on every call — until a registration or its disposal
     * changes the key table, so a consumer may hold it across rows. Callers pass
     * it to a key-taking read face such as `snapshot(session, summaryKeys())`
     * or `viewCheckpoint(rows, summaryKeys())`; those faces use the set as-is.
     * @returns the current summary key set; do not mutate it.
     */
    summaryKeys() {
        this.summaryKeySet ??= this.deriveSummaryKeys();
        return this.summaryKeySet;
    }
    /** Rebuild the summary key set from the current registrations. */
    deriveSummaryKeys() {
        const keys = new Set();
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            if (registration.def.wire === undefined || !registration.def.wire.summary)
                continue;
            keys.add(registration.def.key);
        }
        return keys;
    }
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
    checkpoint(session) {
        const rows = {};
        for (const registration of this.registrations.values()) {
            const cell = registration.refs === 0
                ? registration.cells.get(session)
                : this.cellFor(registration, session);
            if (cell === undefined)
                continue;
            rows[registration.def.key] = {
                ver: registration.def.stateVersion,
                seq: cell.observedSeq,
                val: structuredClone(cell.state),
            };
        }
        return rows;
    }
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
    restoreFloor(checkpoint) {
        let floor;
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            const row = checkpoint[registration.def.key];
            const need = row !== undefined && row.ver === registration.def.stateVersion
                ? Math.max(row.seq + 1, 0)
                : 0;
            floor = floor === undefined ? need : Math.min(floor, need);
        }
        return floor === undefined ? undefined : SessionLogOffset(Math.max(floor - 1, 0));
    }
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
    viewCheckpoint(checkpoint, keys) {
        const values = {};
        const selected = selectedKeys(keys);
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            const def = registration.def;
            if (def.wire === undefined)
                continue;
            if (selected !== undefined && !selected.has(def.key))
                continue;
            const row = checkpoint[def.key];
            if (row === undefined || row.ver !== def.stateVersion)
                continue;
            let state;
            try {
                state = def.stateSchema.parse(row.val);
            }
            catch {
                continue;
            }
            values[def.key] = def.wire.viewSchema.parse(def.wire.view(state));
        }
        return values;
    }
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
    restore(checkpoint, events, baseSeq, header, inheritedEventCount) {
        const endSeq = events.at(-1)?.seq ?? cursorBefore(baseSeq);
        const beforeBase = cursorBefore(baseSeq);
        const values = {};
        const refreshed = {};
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            const def = registration.def;
            const row = checkpoint[def.key];
            const usable = row !== undefined
                && row.ver === def.stateVersion
                && row.seq >= beforeBase
                && row.seq <= endSeq;
            if (!usable && baseSeq > 0) {
                throw new Error(`session projection ${JSON.stringify(def.key)} cannot restore from seq ${baseSeq}: `
                    + 'its checkpoint row is missing, version-mismatched, or beyond the supplied log end; re-read from seq 0');
            }
            let state = usable
                ? def.stateSchema.parse(row.val)
                : def.init(header, inheritedEventCount);
            const from = usable ? row.seq : beforeBase;
            const startIndex = from - baseSeq + 1;
            for (let index = startIndex; index < events.length; index++) {
                const event = events[index];
                const expectedSeq = SessionSeq(baseSeq + index);
                if (event === undefined || event.seq !== expectedSeq) {
                    throw new Error(`session projection ${JSON.stringify(def.key)} cannot restore across missing seq ${String(expectedSeq)}`);
                }
                state = def.apply(state, event);
            }
            if (def.wire !== undefined)
                values[def.key] = def.wire.viewSchema.parse(def.wire.view(state));
            refreshed[def.key] = { ver: def.stateVersion, seq: endSeq, val: state };
        }
        return {
            snapshot: { asOfSeq: endSeq, values: values },
            checkpoint: refreshed,
        };
    }
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
    hydrate(session, checkpoint, events, baseSeq) {
        const endSeq = events.at(-1)?.seq ?? cursorBefore(baseSeq);
        let complete = true;
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            const current = registration.cells.get(session);
            if (current?.observedSeq !== endSeq) {
                complete = false;
                break;
            }
        }
        if (complete) {
            const values = {};
            for (const registration of this.registrations.values()) {
                if (registration.refs === 0)
                    continue;
                if (registration.def.wire === undefined)
                    continue;
                const current = registration.cells.get(session);
                values[registration.def.key] = this.viewCell(registration, current);
            }
            return { asOfSeq: endSeq, values };
        }
        const restored = this.restore(checkpoint, events, baseSeq, session.header, session.inheritedEventCount);
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            const row = restored.checkpoint[registration.def.key];
            /* v8 ignore next -- restore() writes a row for every registration in the same synchronous pass. */
            if (row === undefined)
                continue;
            const current = registration.cells.get(session);
            if (current !== undefined && current.observedSeq > row.seq)
                continue;
            registration.cells.set(session, {
                state: row.val,
                observedSeq: row.seq,
                views: [undefined, undefined],
            });
        }
        return restored.snapshot;
    }
    /** Materialize every registered unit cell at the Session's current cursor. */
    materializeCells(session) {
        for (const registration of this.registrations.values()) {
            if (registration.refs === 0)
                continue;
            this.cellFor(registration, session);
        }
    }
    /** Fold one unit from init over `events`, producing a cell watermarked at the last folded event. */
    buildCell(def, header, inheritedEventCount, events) {
        let state = def.init(header, inheritedEventCount);
        for (const event of events)
            state = def.apply(state, event);
        return { state, observedSeq: (events.at(-1)?.seq ?? -1), views: [undefined, undefined] };
    }
    /** Read (or lazily build, folding the full in-memory log) one unit's cell. */
    cellFor(registration, session) {
        let cell = registration.cells.get(session);
        if (cell === undefined) {
            cell = this.buildCell(registration.def, session.header, session.inheritedEventCount, 
            // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
            session.snapshotEvents());
            registration.cells.set(session, cell);
        }
        else {
            this.advanceCell(registration.def, cell, session, cursorBefore(session.seq));
        }
        return cell;
    }
    /** Advance one existing cell through a contiguous Session prefix. */
    advanceCell(def, cell, session, throughSeq) {
        if (cell.observedSeq >= throughSeq)
            return;
        for (let seq = cell.observedSeq + 1; seq <= throughSeq; seq++) {
            // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
            const event = session.eventAt(SessionSeq(seq));
            /* v8 ignore next 3 -- throughSeq never exceeds the committed log, whose seqs are contiguous by the Session invariant. */
            if (event === undefined || event.seq !== seq) {
                throw new Error(`session projection ${JSON.stringify(def.key)} cannot advance across missing seq ${String(seq)}`);
            }
            const next = def.apply(cell.state, event);
            if (!Object.is(next, cell.state)) {
                cell.views[0] = cell.views[1];
                cell.views[1] = undefined;
            }
            cell.state = next;
            cell.observedSeq = SessionSeq(seq);
        }
    }
    /**
     * Eager drive: pass one committed event through every unit; notify per-key
     * listeners on each changed raw view reference, then event listeners once.
     * When a unit or a per-key listener throws, event listeners still receive
     * the changes collected before the throw, and the error then propagates.
     */
    drive(session, event) {
        const observed = this.listeners.size > 0 || this.eventListeners.size > 0;
        const changes = [];
        try {
            for (const registration of this.registrations.values()) {
                if (registration.refs === 0)
                    continue;
                let cell = registration.cells.get(session);
                if (cell !== undefined && cell.observedSeq >= event.seq)
                    continue;
                if (cell === undefined) {
                    // Late build mid-stream: fold history before this event (seq = log
                    // index, so the prefix slice is exact), then take the normal gate.
                    cell = this.buildCell(registration.def, session.header, session.inheritedEventCount, 
                    // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
                    session.snapshotEvents(SessionLogOffset(0), SessionLogOffset(event.seq)));
                    registration.cells.set(session, cell);
                }
                else {
                    this.advanceCell(registration.def, cell, session, event.seq === 0 ? -1 : SessionSeq(event.seq - 1));
                }
                const previousState = cell.state;
                const next = registration.def.apply(previousState, event);
                const changed = !Object.is(next, previousState);
                cell.state = next;
                cell.observedSeq = event.seq;
                const wire = registration.def.wire;
                if (changed && wire !== undefined) {
                    const views = cell.views;
                    views[0] = views[1];
                    if (observed) {
                        views[1] = wire.view(next);
                        if (!Object.is(views[0], views[1])) {
                            const key = registration.def.key;
                            const value = wire.viewSchema.parse(views[1]);
                            changes.push({ key, val: value });
                            for (const listener of this.listeners) {
                                listener(session, key, value, event.seq);
                            }
                        }
                    }
                    else {
                        views[1] = undefined;
                    }
                }
                // An unchanged state keeps its current view as the valid comparison
                // value for the next state change.
            }
        }
        finally {
            if (changes.length > 0) {
                for (const listener of this.eventListeners) {
                    listener(session, changes, event.seq);
                }
            }
        }
    }
    /** Return one schema-validated wire value. */
    viewCell(registration, cell) {
        const wire = registration.def.wire;
        /* v8 ignore next -- every caller filters to units with wire before calling viewCell. */
        if (wire === undefined)
            throw new Error(`session projection ${JSON.stringify(registration.def.key)} has no wire view`);
        return wire.viewSchema.parse(wire.view(cell.state));
    }
}
export default SessionProjectionRegistry;
//# sourceMappingURL=index.js.map