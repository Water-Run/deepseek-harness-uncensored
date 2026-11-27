import type { SyncedConfigValues } from '@deepseek-ai/dsh-client-config/types';
/** Latest synced values of one package and the Config object of its current plugin activation. */
export declare class SyncedConfigEntry {
    private values;
    private current;
    /** @param values - Host-validated values; they are frozen and not checked against any schema. */
    constructor(values: SyncedConfigValues);
    /** Whether no field currently has a value. */
    get empty(): boolean;
    /** The current activation's Config object; undefined between a teardown and the next activation. */
    get config(): object | undefined;
    /**
     * Start an activation: a new Config object holding the latest values; the previous activation stops receiving writes.
     * @returns the object to hand to the activation's `apply`.
     */
    activate(): object;
    /**
     * An activation's teardown has begun; later values wait for the next activation.
     * @param config - the ending activation's object; omitted, the current activation ends.
     */
    release(config?: object): void;
    /**
     * Replace the values; the current activation receives the changed fields, if one is running.
     * @param values - the package's complete values; absent fields read undefined.
     */
    update(values: SyncedConfigValues): void;
}
//# sourceMappingURL=synced-config.d.ts.map