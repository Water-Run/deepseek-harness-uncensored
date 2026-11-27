import { parseBootManifest, readRelease } from "./manifest.js";
import { ReleaseChangeGate } from "./release-change.js";
import { notifySubscribers } from "./notify.js";
import { tearDownEntryFiber } from "./entry-lifecycle.js";
import { SyncedConfigEntry } from "./synced-config.js";
/** Numeric values mirror Cordis's const enum, which bundle loaders cannot import as a runtime object. */
const ACTIVE = 2;
const FAILED = 3;
/** Revisions and requests identify desired code; URLs only select its immutable delivery resource. */
function entryTargets(manifest) {
    return JSON.stringify(manifest.modules.map(row => [row.id, row.rev, row.inject, row.external]));
}
/** Manages only entries created from the Host manifest; other Loader contributors retain ownership. */
export class ClientEntries {
    modules;
    index;
    /** Stable observable consumed by page diagnostics through the renderer's injected hook. */
    state = {
        getSnapshot: () => this.snapshot,
        subscribe: (listener) => {
            this.listeners.add(listener);
            return () => { this.listeners.delete(listener); };
        },
    };
    // The modules bootstrap factory cannot request platform libraries before the shell supplies its seed.
    snapshot = { syncing: false, failures: [] };
    listeners = new Set();
    /** Admits only Host graphs of the page's boot release. */
    release;
    managed = new Map();
    /** Latest synced values per package that has appeared in the graph, and the Config object of its current activation. */
    synced = new Map();
    revisions = new Map();
    loader;
    queue = Promise.resolve();
    desired;
    generation = 0;
    stopped = false;
    /**
     * Construct the page controller before Cordis boot.
     * @param modules - Module arrival and materialization owner.
     * @param index - Private descriptor replacement and unused-module cleanup.
     */
    constructor(modules, index) {
        this.modules = modules;
        this.index = index;
        this.desired = modules.manifest;
        this.release = new ReleaseChangeGate(modules.manifest.release);
    }
    /** Host release change to announce; undefined while the Host serves the page's boot release or a dismissed one. */
    get releaseChange() {
        return this.release.change;
    }
    /** Stop announcing the connected Host's release; updates stay paused until the Host returns to the boot release or the page reloads. */
    dismissRelease() {
        this.release.dismiss();
    }
    /**
     * Create the initial roster and retain its entry identities for subsequent reconciliation.
     * As the Host Loader group does, a row whose creation rejects (for example a module that exports no
     * plugin) is logged and stays an inactive entry, so one row cannot abort startup before the boot audit.
     * @param loader - Page Loader, already configured with the module system.
     * @param manifest - Initial roster audited by the boot caller.
     * @returns after initial entries and their activation settle; boot owns its activation audit.
     */
    start(loader, manifest) {
        if (this.loader !== undefined)
            throw new Error('client-modules: entries already started');
        this.loader = loader;
        this.desired = manifest;
        this.applyConfig(manifest);
        // Prepended so the Loader's interpolation runs inside this listener and cannot copy the returned object.
        loader.ctx.on('internal/config', (fiber, next) => {
            const config = next();
            // As the Loader's own listener does, skip fibers that are not an entry's root plugin (a child plugin inherits
            // its parent's entry) and keep their explicit config.
            if (fiber.entry === undefined || fiber.parent.fiber.entry === fiber.entry)
                return config;
            const id = fiber.entry.options.name;
            const synced = this.synced.get(id);
            if (synced === undefined)
                return config;
            // A Client face with its own schema keeps Cordis's ordinary configuration; it must not also receive synced values.
            if (fiber.runtime?.Config === undefined) {
                // Resolving a candidate for the running instance (as `fiber.update()` does) keeps its object, as the Host keeps
                // an active instance's volatile references; only an activation receives a new one.
                if (synced.config !== undefined && fiber.effectiveConfig === synced.config)
                    return synced.config;
                const activation = synced.activate();
                // However the instance unloads (replacement, removal, a withdrawn dependency), its object stops receiving values.
                fiber.ctx.effect(() => () => { synced.release(activation); }, 'client-modules: synced configuration activation');
                return activation;
            }
            if (synced.empty)
                return config;
            throw new Error(`client-modules: the Client face of ${id} exports a Config schema; synced configuration requires the Host schema alone`);
        }, { prepend: true });
        loader.ctx.effect(() => () => {
            this.stopped = true;
            this.generation++;
            return this.queue;
        }, 'client-modules: entry reconciliation');
        return this.enqueue(async () => {
            await Promise.all(this.desired.plugins.map(async ({ id }) => {
                await this.create(loader, id).catch((error) => { loader.ctx.logger.error(error); });
            }));
            await loader.await();
            for (const row of this.modules.manifest.modules)
                this.revisions.set(row.id, row.rev);
        });
    }
    /**
     * Validate and apply the latest full Host graph. Changed targets cancel obsolete mounts; identical targets share pending loads.
     * The release is compared before the rest of the graph is validated: a graph of another release, including one whose
     * format this page cannot read, is not applied and {@link releaseChange} announces it.
     * @param graph - JSON-decoded graph received from the Host.
     * @returns after the queued reconciliation, or at once for another release; per-package failures remain available in {@link state}.
     */
    sync(graph) {
        if (!this.release.observe(readRelease(graph)))
            return Promise.resolve();
        const manifest = parseBootManifest(graph);
        if (entryTargets(manifest) !== entryTargets(this.desired))
            this.generation++;
        this.desired = manifest;
        // Configuration is not code: it applies at once, before queued entry work creates or replaces any entry.
        if (this.loader !== undefined)
            this.applyConfig(manifest);
        const generation = this.generation;
        return this.enqueue(() => this.reconcile(generation));
    }
    /**
     * Retry failed entries against the latest graph, including an unchanged revision.
     * @returns after retry settlement, with remaining errors in {@link state}.
     */
    retry() {
        const generation = ++this.generation;
        return this.enqueue(() => this.reconcile(generation));
    }
    /**
     * Replace one entry's code in the same queue as graph updates; duplicate revisions are ignored.
     * Entries missing after a failed import are reconciled; bootstrap replacement fails before teardown.
     * Ignored while the connected Host serves another release than the page's boot release.
     * @param id - Package id from a rebuilt frame.
     * @param rev - Opaque revision selecting the rebuilt artifact.
     * @returns after queued work; replacement errors reject, while per-package reconciliation errors remain in {@link state}.
     */
    reload(id, rev) {
        if (!this.release.matches)
            return Promise.resolve();
        this.desired = {
            ...this.desired,
            modules: this.desired.modules.map(row => row.id === id ? { ...row, rev } : row),
        };
        return this.enqueue(async () => {
            const desired = this.desired.modules.find(row => row.id === id);
            if (this.stopped || desired === undefined)
                return;
            const entry = this.managed.get(id);
            if (entry === undefined) {
                this.modules.invalidate(id, desired.rev);
                await this.reconcile(this.generation);
                return;
            }
            if (this.revisions.get(id) === rev)
                return;
            this.publish({ syncing: true, failures: this.snapshot.failures.filter(failure => failure.id !== id) });
            await this.replace(entry, id, rev, this.generation);
            this.publish({ syncing: false, failures: this.snapshot.failures });
        }, id);
    }
    /**
     * The synced Config object of a package's current plugin activation, as that activation's `apply` received it.
     * Each activation receives a new object, so the result changes when the plugin is replaced.
     * @param packageName - graph row id.
     * @returns the object, or undefined while no activation of the package is running.
     */
    resolveConfigByPackage(packageName) {
        return this.synced.get(packageName)?.config;
    }
    /** An activation's teardown begins: like a Host fiber that is no longer active, it receives no later values. */
    releaseConfig(id) {
        this.synced.get(id)?.release();
    }
    /**
     * Write each row's values into its package's current activation. A row absent from the graph keeps its values: its
     * entry is being removed, and removal releases the activation without writing to it.
     */
    applyConfig(manifest) {
        for (const row of manifest.plugins) {
            const values = row.config ?? {};
            const synced = this.synced.get(row.id);
            if (synced === undefined)
                this.synced.set(row.id, new SyncedConfigEntry(values));
            else
                synced.update(values);
        }
    }
    publish(snapshot) {
        this.snapshot = snapshot;
        notifySubscribers(this.listeners, 'synchronization');
    }
    enqueue(task, subject = 'graph') {
        const run = this.queue.then(task);
        // Each operation reports its own failure; later operations must still run.
        this.queue = run.then(() => undefined, (error) => {
            this.publish({ syncing: false, failures: [
                    ...this.snapshot.failures.filter(failure => failure.id !== subject),
                    { id: subject, message: String(error) },
                ] });
        });
        return run;
    }
    current(generation) {
        return !this.stopped && generation === this.generation;
    }
    /** Keep ownership even when Loader rejects a module's plugin exports after inserting its entry. */
    async create(loader, id) {
        const options = { name: id };
        const entryId = loader.ensureId(options);
        try {
            await loader.create(options);
        }
        finally {
            this.managed.set(id, loader.resolve(entryId));
        }
    }
    async replace(entry, id, rev, generation) {
        this.index.invalidateForReplacement(id, rev);
        await this.modules.prefetch(id);
        if (!this.current(generation))
            return;
        this.releaseConfig(id);
        await tearDownEntryFiber(entry);
        this.index.releaseReplaced(id);
        if (!this.current(generation))
            return;
        await this.modules.import(id, '', {});
        if (!this.current(generation))
            return;
        await entry.refresh();
        await entry.fiber?.await();
        if (entry.fiber === undefined)
            throw new Error(`client-modules: ${id} import failed (see console)`);
        this.revisions.set(id, rev);
    }
    async reconcile(generation) {
        if (!this.current(generation))
            return;
        const loader = this.loader;
        if (loader === undefined)
            throw new Error('client-modules: entries have not started');
        const manifest = this.desired;
        this.publish({ syncing: true, failures: [] });
        const failures = [];
        this.index.update(manifest, this.managed.keys());
        const wanted = new Set(manifest.plugins.map(row => row.id));
        for (const [id, entry] of this.managed) {
            if (wanted.has(id))
                continue;
            const fiber = entry.fiber;
            this.releaseConfig(id);
            loader.remove(entry.id);
            this.managed.delete(id);
            this.revisions.delete(id);
            // Removed fibers no longer appear in Loader.getTasks().
            while (fiber?.inertia !== undefined)
                await fiber.inertia;
        }
        for (const row of manifest.modules) {
            if (!this.current(generation))
                break;
            try {
                const entry = this.managed.get(row.id);
                if (entry === undefined) {
                    await this.modules.prefetch(row.id);
                    if (!this.current(generation))
                        break;
                    await this.modules.import(row.id, '', {});
                    if (!this.current(generation))
                        break;
                    await this.create(loader, row.id);
                    this.revisions.set(row.id, row.rev);
                }
                else if (this.revisions.get(row.id) !== row.rev) {
                    await this.replace(entry, row.id, row.rev, generation);
                }
                else if (entry.fiber === undefined) {
                    await this.replace(entry, row.id, row.rev, generation);
                }
                else if (entry.fiber.state === FAILED) {
                    // A retry with unchanged config is not a configuration change to persist.
                    await entry.fiber.update(entry.options.config, true);
                }
            }
            catch (error) {
                failures.push({ id: row.id, message: String(error) });
            }
        }
        await loader.await();
        for (const [id, entry] of this.managed) {
            if (failures.some(failure => failure.id === id))
                continue;
            if (entry.fiber?.state === ACTIVE)
                continue;
            try {
                if (entry.fiber === undefined)
                    throw new Error(`client-modules: ${id} import failed (see console)`);
                await entry.fiber.await();
                failures.push({ id, message: `client-modules: ${id} is waiting for activation` });
            }
            catch (error) {
                failures.push({ id, message: String(error) });
            }
        }
        this.index.prune([...loader.entries()].map(entry => entry.options.name));
        if (this.current(generation))
            this.publish({ syncing: false, failures });
    }
}
//# sourceMappingURL=entries.js.map