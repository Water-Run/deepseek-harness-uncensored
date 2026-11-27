/** Independently reloadable local country data; losing it leaves target enforcement active. @module */
import { Context, Service } from '@deepseek-ai/cordis';
import schema from '@deepseek-ai/schemastery';
import { type CountryDatabaseStatus } from './country.ts';
/** Deployment-owned local country source and resource bounds. */
export interface Config {
    /** Empty uses the pinned bundled DB-IP Lite database. */
    path?: string;
    /** Maximum file and decompressed bytes, default 32 MiB. */
    maxBytes?: number;
    /** Maximum database age in days, default 45. */
    maxAgeDays?: number;
    /** Dedicated directory for owner-triggered updates of the bundled DB-IP source. */
    cacheDirectory?: string;
    /** Download and validation deadline, default 60 seconds. */
    updateTimeoutMs?: number;
}
type ResolvedConfig = Required<Config>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        targetCountryData: TargetCountryData;
    }
    interface Events {
        /**
         * Invalidate operations using a country-data generation when it activates or is withdrawn.
         * @mode emit
         */
        'target-country/changed'(): void;
    }
}
/** Country data is independent of the durable target-rule owner and never supplies a permissive fallback. */
export default class TargetCountryData extends Service {
    static Config: schema<Config, ResolvedConfig>;
    private readonly config;
    private readonly lifetime;
    private database;
    private readonly cachePath;
    private updating;
    /**
     * @param ctx - Country-data provider owner.
     * @param config - Local database selection, size and age policy.
     */
    constructor(ctx: Context, config?: Config);
    /** Validate and load data before the provider becomes available. */
    protected [Service.init](): Promise<void>;
    private notify;
    private readCache;
    /**
     * Report whether the Host can check for a managed DB-IP update.
     * @returns Whether this active provider has an owner-managed DB-IP cache.
     */
    canUpdate(): boolean;
    /**
     * Acquire a newer official dataset and atomically replace the managed cache after validation.
     * @param caller - Owner request cancellation.
     * @returns Status of the currently accepted database, including when it is already current.
     */
    update(caller: AbortSignal): Promise<CountryDatabaseStatus>;
    private replaceCache;
    /**
     * Read current freshness and attribution for management and audit.
     * @returns The actual local source status; a disposed provider throws.
     */
    status(): CountryDatabaseStatus;
    /**
     * Identify the local source that guarded file executors must preserve.
     * @returns The configured or bundled source and, when present, the managed cache directory.
     */
    sourcePaths(): readonly string[];
    /**
     * Classify actual pinned addresses without a remote geolocation request.
     * @param addresses - Every address the transport may connect to.
     * @returns CN, outside or unknown; disposal and expired data return unknown.
     */
    mainland(addresses: readonly string[]): 'yes' | 'no' | 'unknown';
}
export {};
//# sourceMappingURL=country-provider.d.ts.map