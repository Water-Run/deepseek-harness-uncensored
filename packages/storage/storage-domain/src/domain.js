/**
 * Runtime of one open domain: authoritative in-memory state, the single
 * per-domain write chain, and change-event emission. Reads are synchronous
 * from memory; every write queues on the chain, awaits backend durability
 * FIRST, then mutates memory, then emits `domain/changed` — a rejected
 * backend write leaves memory untouched (no divergence between reads and the
 * medium) unless the backend reports `unknown-state`, which quarantines the
 * domain: reads and later writes reject until close. Events carry values that
 * equal the in-memory state at emission, in write order.
 * @module @deepseek-ai/dsh-storage-domain/src/domain
 */
import { StorageError } from '@deepseek-ai/dsh-storage';
import { DomainError } from "./error.js";
const noop = () => { };
/**
 * The single domain implementation behind the {@link Domain} interface. The
 * facility constructs it from a validated `loadAll` snapshot and erases it to
 * `Domain<S>`; nothing outside this package constructs one.
 */
export class DomainImpl {
    ctx;
    unit;
    onClosed;
    /** Domain name from the spec. */
    name;
    tables = new Map();
    globalValue;
    globalHandle;
    /** Tail of the write chain; every link settles (rejections are observed by the caller's slice). */
    chain = Promise.resolve();
    /** Set when close begins: new writes reject while already-queued writes drain. */
    disposing = false;
    /** Set when the unit reports `unknown-state`: reads and writes reject with it. */
    failure;
    /** Set when close finishes (chain drained, unit closed): reads reject from here on. */
    closed = false;
    disposal;
    /**
     * @param ctx - Context that carries `domain/changed` emissions.
     * @param spec - The domain declaration.
     * @param unit - The opened backend unit; this instance owns its lifecycle.
     * @param records - Validated records from the unit's `loadAll`, one entry
     * per declared table (empty maps included) — the facility builds it from
     * the spec, so the entry set IS the table set.
     * @param globalValue - Validated stored global, or the spec's `initial`
     * when the medium held none; `undefined` when the spec declares no global.
     * @param onClosed - Facility hook run once after teardown completes; frees
     * the domain name for a later open.
     */
    constructor(ctx, spec, unit, records, globalValue, onClosed) {
        this.ctx = ctx;
        this.unit = unit;
        this.onClosed = onClosed;
        this.name = spec.name;
        const host = {
            domainName: spec.name,
            unit,
            enqueue: job => this.enqueue(job),
            assertReadable: () => { this.assertReadable(); },
            emitChanged: (change) => { this.emitChanged(change); },
        };
        for (const [table, tableRecords] of records) {
            this.tables.set(table, new KvTableImpl(host, table, tableRecords));
        }
        if (spec.global !== undefined) {
            this.globalValue = globalValue;
            this.globalHandle = {
                get: () => {
                    this.assertReadable();
                    return this.globalValue;
                },
                set: value => this.enqueue(async () => {
                    await this.unit.setGlobal(value);
                    this.globalValue = value;
                    this.emitChanged({ domain: this.name, table: '', key: '', operation: 'put', value });
                }),
            };
        }
    }
    /** Global singleton handle; accessing it on a spec that declares no global is a caller bug and throws. */
    get global() {
        if (this.globalHandle === undefined) {
            throw new Error(`domain '${this.name}' declares no global`);
        }
        return this.globalHandle;
    }
    /**
     * Resolve one declared table handle; an undeclared name is a caller bug
     * and throws.
     * @param name - Declared table name.
     * @returns the stable table handle.
     */
    table(name) {
        const table = this.tables.get(name);
        if (table === undefined) {
            throw new Error(`domain '${this.name}' declares no table '${name}'`);
        }
        return table;
    }
    /**
     * Close this domain: reject new writes immediately, drain already-queued
     * writes (their events still emit), close the unit, then free the name via
     * the facility hook. Idempotent — repeated calls share one teardown.
     * @returns resolution after the unit is released.
     */
    close() {
        this.disposal ??= this.runClose();
        return this.disposal;
    }
    async runClose() {
        this.disposing = true;
        // Chain links never reject (each is settled via then(noop, noop)), so
        // this await is a pure drain barrier.
        await this.chain;
        await this.unit.close();
        this.closed = true;
        this.onClosed();
    }
    /**
     * Dispatch one post-durability change notification, containing observer
     * failures: the write is already committed (medium and memory both hold
     * the new state), so a throwing listener must not retroactively reject it.
     */
    emitChanged(change) {
        try {
            this.ctx.emit('domain/changed', change);
        }
        catch (error) {
            // Swallows synchronous observer exceptions only: emit dispatches
            // listeners inline and nothing else runs in the try. The event is a
            // notification, not a transaction participant — the commit point has
            // passed, so containment (with a log) is the only correct outcome.
            this.ctx.logger.warn(`domain '${this.name}': domain/changed listener failed: ${String(error)}`);
        }
    }
    enqueue(job) {
        if (this.disposing) {
            return Promise.reject(new DomainError('closed', `domain '${this.name}' is closed`));
        }
        const run = async () => {
            // A poisoned unit makes in-memory state unverifiable: reject before the
            // job runs, including jobs queued before the failure surfaced.
            if (this.failure !== undefined)
                throw this.failure;
            try {
                return await job();
            }
            catch (error) {
                if (error instanceof StorageError && error.code === 'unknown-state')
                    this.failure = error;
                throw error;
            }
        };
        const result = this.chain.then(run);
        this.chain = result.then(noop, noop);
        return result;
    }
    assertReadable() {
        // Close wins: the KvUnit contract reports `closed` for calls after teardown.
        if (this.closed) {
            throw new DomainError('closed', `domain '${this.name}' is closed`);
        }
        if (this.failure !== undefined)
            throw this.failure;
    }
}
/** Table handle bound to one in-memory record map and its domain's write chain. */
class KvTableImpl {
    host;
    tableName;
    records;
    constructor(host, tableName, records) {
        this.host = host;
        this.tableName = tableName;
        this.records = records;
    }
    get(key) {
        this.host.assertReadable();
        return this.records.get(key);
    }
    entries() {
        this.host.assertReadable();
        return [...this.records.entries()][Symbol.iterator]();
    }
    keys() {
        this.host.assertReadable();
        return [...this.records.keys()][Symbol.iterator]();
    }
    get size() {
        this.host.assertReadable();
        return this.records.size;
    }
    put(key, value) {
        return this.host.enqueue(async () => {
            await this.host.unit.putRecord(this.tableName, key, value);
            this.records.set(key, value);
            this.emitPut(key, value);
        });
    }
    delete(key) {
        return this.host.enqueue(async () => {
            // Existence is decided at this job's chain slot, not at call time: an
            // earlier queued put of the same key makes this delete observe it.
            if (!this.records.has(key))
                return false;
            await this.host.unit.deleteRecord(this.tableName, key);
            this.records.delete(key);
            this.emitDeleted(key);
            return true;
        });
    }
    deleteMany(keys) {
        return this.host.enqueue(async () => {
            // Existence and the backend write happen at this job's chain slot, so an
            // earlier queued put of a key is observed and the batch is one unit call.
            const present = [...new Set(keys)].filter(key => this.records.has(key));
            if (present.length === 0)
                return 0;
            await this.host.unit.deleteRecords(this.tableName, present);
            // Memory reaches the committed batch state before the first listener runs,
            // so every `domain/changed` observes the same removed set as the medium.
            for (const key of present)
                this.records.delete(key);
            for (const key of present)
                this.emitDeleted(key);
            return present.length;
        });
    }
    update(key, fn) {
        return this.host.enqueue(async () => {
            if (!this.records.has(key)) {
                throw new DomainError('missing-key', `domain '${this.host.domainName}' table '${this.tableName}' has no record '${key}' to update`);
            }
            const next = fn(this.records.get(key));
            await this.host.unit.putRecord(this.tableName, key, next);
            this.records.set(key, next);
            this.emitPut(key, next);
            return next;
        });
    }
    emitPut(key, value) {
        this.host.emitChanged({
            domain: this.host.domainName,
            table: this.tableName,
            key,
            operation: 'put',
            value,
        });
    }
    emitDeleted(key) {
        this.host.emitChanged({
            domain: this.host.domainName,
            table: this.tableName,
            key,
            operation: 'deleted',
        });
    }
}
//# sourceMappingURL=domain.js.map