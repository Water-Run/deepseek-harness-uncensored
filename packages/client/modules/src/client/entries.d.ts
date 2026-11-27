import type { Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { BootManifest, ClientModuleLoader } from './manifest.ts';
import { type ClientReleaseChange } from './release-change.ts';
/** Page-local failures do not change the Host's bundle enablement. */
export interface ClientEntryState {
    /** True while a snapshot, retry or code replacement is being applied. */
    readonly syncing: boolean;
    /** Package ids and errors from the latest reconciliation. */
    readonly failures: readonly {
        readonly id: string;
        readonly message: string;
    }[];
}
/** Module-table capabilities used within serialized entry operations. */
interface ModuleIndex {
    update(manifest: BootManifest, managed: Iterable<string>): void;
    /** Reset a package's code while its previous records stay active for the runtime that is still running. */
    invalidateForReplacement(id: string, rev: string): void;
    /** Release the previous records once the replaced runtime has been torn down. */
    releaseReplaced(id: string): void;
    prune(roots: Iterable<string>): void;
}
/** Manages only entries created from the Host manifest; other Loader contributors retain ownership. */
export declare class ClientEntries {
    private readonly modules;
    private readonly index;
    /** Stable observable consumed by page diagnostics through the renderer's injected hook. */
    readonly state: ObservableSnapshot<ClientEntryState>;
    private snapshot;
    private readonly listeners;
    /** Admits only Host graphs of the page's boot release. */
    private readonly release;
    private readonly managed;
    /** Latest synced values per package that has appeared in the graph, and the Config object of its current activation. */
    private readonly synced;
    private readonly revisions;
    private loader;
    private queue;
    private desired;
    private generation;
    private stopped;
    /**
     * Construct the page controller before Cordis boot.
     * @param modules - Module arrival and materialization owner.
     * @param index - Private descriptor replacement and unused-module cleanup.
     */
    constructor(modules: ClientModuleLoader, index: ModuleIndex);
    /** Host release change to announce; undefined while the Host serves the page's boot release or a dismissed one. */
    get releaseChange(): ObservableSnapshot<ClientReleaseChange | undefined>;
    /** Stop announcing the connected Host's release; updates stay paused until the Host returns to the boot release or the page reloads. */
    dismissRelease(): void;
    /**
     * Create the initial roster and retain its entry identities for subsequent reconciliation.
     * As the Host Loader group does, a row whose creation rejects (for example a module that exports no
     * plugin) is logged and stays an inactive entry, so one row cannot abort startup before the boot audit.
     * @param loader - Page Loader, already configured with the module system.
     * @param manifest - Initial roster audited by the boot caller.
     * @returns after initial entries and their activation settle; boot owns its activation audit.
     */
    start(loader: Loader, manifest: BootManifest): Promise<void>;
    /**
     * Validate and apply the latest full Host graph. Changed targets cancel obsolete mounts; identical targets share pending loads.
     * The release is compared before the rest of the graph is validated: a graph of another release, including one whose
     * format this page cannot read, is not applied and {@link releaseChange} announces it.
     * @param graph - JSON-decoded graph received from the Host.
     * @returns after the queued reconciliation, or at once for another release; per-package failures remain available in {@link state}.
     */
    sync(graph: unknown): Promise<void>;
    /**
     * Retry failed entries against the latest graph, including an unchanged revision.
     * @returns after retry settlement, with remaining errors in {@link state}.
     */
    retry(): Promise<void>;
    /**
     * Replace one entry's code in the same queue as graph updates; duplicate revisions are ignored.
     * Entries missing after a failed import are reconciled; bootstrap replacement fails before teardown.
     * Ignored while the connected Host serves another release than the page's boot release.
     * @param id - Package id from a rebuilt frame.
     * @param rev - Opaque revision selecting the rebuilt artifact.
     * @returns after queued work; replacement errors reject, while per-package reconciliation errors remain in {@link state}.
     */
    reload(id: string, rev: string): Promise<void>;
    /**
     * The synced Config object of a package's current plugin activation, as that activation's `apply` received it.
     * Each activation receives a new object, so the result changes when the plugin is replaced.
     * @param packageName - graph row id.
     * @returns the object, or undefined while no activation of the package is running.
     */
    resolveConfigByPackage(packageName: string): object | undefined;
    /** An activation's teardown begins: like a Host fiber that is no longer active, it receives no later values. */
    private releaseConfig;
    /**
     * Write each row's values into its package's current activation. A row absent from the graph keeps its values: its
     * entry is being removed, and removal releases the activation without writing to it.
     */
    private applyConfig;
    private publish;
    private enqueue;
    private current;
    /** Keep ownership even when Loader rejects a module's plugin exports after inserting its entry. */
    private create;
    private replace;
    private reconcile;
}
export {};
//# sourceMappingURL=entries.d.ts.map