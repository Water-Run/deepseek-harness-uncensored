/** Cordis-owned script-environment providers, independent from module placement. */
import { Service } from '@deepseek-ai/cordis';
/** Failure of one execution-environment operation. */
export class ScriptRealmError extends Error {
    /** Realm operation that failed. */
    stage;
    /** Environment in which the operation failed. */
    realmId;
    /** Requested script URL when the failure concerns script execution. */
    url;
    constructor(options) {
        super(options.message, { cause: options.cause });
        this.name = 'ScriptRealmError';
        this.stage = options.stage;
        this.realmId = options.realmId;
        if (options.url !== undefined)
            this.url = options.url;
    }
}
/** Registers provider factories through their calling plugin's effect lifetime. */
export class ScriptRealmRegistry extends Service {
    factories = new Map();
    constructor(ctx) {
        super(ctx, 'scriptRealms');
    }
    /**
     * Register one provider without creating any environment.
     * @param name - Exact provider name.
     * @param factory - Environment factory retained until the registration is disposed.
     * @returns The caller-owned registration disposer; duplicate names reject.
     */
    register(name, factory) {
        return this.ctx.effect(() => {
            if (this.factories.has(name))
                throw new Error(`script-realms: provider ${JSON.stringify(name)} is already registered`);
            this.factories.set(name, factory);
            return () => {
                this.factories.delete(name);
            };
        }, `scriptRealms.register(${JSON.stringify(name)})`);
    }
    /**
     * Create an environment through an already registered provider.
     * @param name - Exact provider name.
     * @param options - Instance identity and cancellation; the caller owns the returned instance.
     * @returns The provider's ready environment; unknown providers reject.
     */
    async create(name, options) {
        const factory = this.factories.get(name);
        if (factory === undefined) {
            throw new ScriptRealmError({ stage: 'create', realmId: options.id,
                message: `script-realms: provider ${JSON.stringify(name)} is not registered` });
        }
        options.signal.throwIfAborted();
        return await factory.create(options);
    }
}
export default ScriptRealmRegistry;
//# sourceMappingURL=index.js.map