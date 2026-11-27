var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
/** Independently reloadable local country data; losing it leaves target enforcement active. @module */
import { Service } from '@deepseek-ai/cordis';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { deadline } from '@deepseek-ai/dsh-timeout';
import schema from '@deepseek-ai/schemastery';
import { CountryDatabase } from "./country.js";
import { TargetProtectionError } from '@deepseek-ai/dsh-target-protection';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { BUNDLED_COUNTRY_SOURCE } from "./country-source.js";
import { downloadCountry } from "./country-download.js";
import { readLocalSource } from "./local-source.js";
/** Country data is independent of the durable target-rule owner and never supplies a permissive fallback. */
export default class TargetCountryData extends Service {
    static Config = schema.object({
        path: schema.string().default(''), maxBytes: schema.natural().min(1024).max(268435456).default(33554432),
        maxAgeDays: schema.natural().min(1).max(366).default(45),
        cacheDirectory: schema.string().default(''), updateTimeoutMs: schema.natural().min(1).max(300000).default(60000),
    });
    config;
    lifetime = new AbortController();
    database;
    cachePath;
    updating;
    /**
     * @param ctx - Country-data provider owner.
     * @param config - Local database selection, size and age policy.
     */
    constructor(ctx, config = {}) {
        super(ctx, 'targetCountryData');
        this.config = TargetCountryData.Config(config);
        if (this.config.path !== '' && this.config.cacheDirectory !== '') {
            throw new TargetProtectionError('invalid', 'An owner-provided country file cannot use the managed DB-IP cache.');
        }
        this.cachePath = this.config.cacheDirectory === '' ? undefined : join(resolve(this.config.cacheDirectory), 'dbip-country-lite.mmdb.gz');
        ctx.effect(() => async () => {
            this.lifetime.abort();
            if (this.updating !== undefined)
                await Promise.allSettled([this.updating]);
            this.database = undefined;
            this.notify();
        }, 'target-country-data.lifetime');
    }
    /** Validate and load data before the provider becomes available. */
    async [Service.init]() {
        const signal = this.lifetime.signal;
        const bundled = await CountryDatabase.open(this.config, signal);
        const cached = this.cachePath === undefined ? undefined : await this.readCache(this.cachePath, signal);
        signal.throwIfAborted();
        this.database = cached !== undefined && cached.status(Date.now()).builtAt > bundled.status(Date.now()).builtAt ? cached : bundled;
        this.notify();
    }
    notify() {
        try {
            this.ctx.emit('target-country/changed');
        }
        catch (error) {
            this.ctx.logger.warn('A country data observer failed.', error);
        }
    }
    async readCache(path, signal) {
        try {
            const bytes = await readLocalSource(path, this.config.maxBytes, signal);
            const database = await CountryDatabase.decode(bytes, this.config, false, signal);
            const status = database.status(Date.now());
            if (status.databaseType !== 'DBIP-Country-Lite' || status.state === 'future')
                throw new Error('Unsupported cached country data.');
            return database;
        }
        catch (error) {
            signal.throwIfAborted();
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
                this.ctx.logger.warn('The managed DB-IP country cache could not be validated.');
            }
            return undefined;
        }
    }
    /**
     * Report whether the Host can check for a managed DB-IP update.
     * @returns Whether this active provider has an owner-managed DB-IP cache.
     */
    canUpdate() { return this.cachePath !== undefined && this.database !== undefined && !this.lifetime.signal.aborted; }
    /**
     * Acquire a newer official dataset and atomically replace the managed cache after validation.
     * @param caller - Owner request cancellation.
     * @returns Status of the currently accepted database, including when it is already current.
     */
    async update(caller) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            if (!this.canUpdate() || this.cachePath === undefined) {
                throw new TargetProtectionError('unavailable', 'Managed country updates are unavailable.');
            }
            if (this.updating !== undefined)
                throw new TargetProtectionError('busy', 'A country update is already running.');
            const signal = AbortSignal.any([caller, this.lifetime.signal]);
            const bounded = __addDisposableResource(env_1, deadline(signal, this.config.updateTimeoutMs, 'TARGET_COUNTRY_UPDATE_TIMEOUT'), false);
            const operation = this.replaceCache(this.cachePath, bounded.signal);
            this.updating = operation;
            try {
                return await operation;
            }
            catch (error) {
                signal.throwIfAborted();
                if (error instanceof TargetProtectionError)
                    throw error;
                throw new TargetProtectionError('unavailable', 'The DB-IP country update did not complete. Refresh to check the active data.', { cause: error });
            }
            finally {
                this.updating = undefined;
            }
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    async replaceCache(path, signal) {
        const { bytes, month } = await downloadCountry(Date.now(), this.config.maxBytes, signal);
        const candidate = await CountryDatabase.decode(bytes, this.config, false, signal);
        const status = candidate.status(Date.now());
        if (status.state !== 'ready' || status.databaseType !== 'DBIP-Country-Lite' || !status.builtAt.startsWith(`${month}-`)) {
            throw new TargetProtectionError('unavailable', 'DB-IP returned an unexpected or expired country database.');
        }
        signal.throwIfAborted();
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        return await withFileLock(path, async () => {
            const cached = await this.readCache(path, signal);
            const active = this.status();
            const cachedDate = cached?.status(Date.now()).builtAt ?? '';
            signal.throwIfAborted();
            if (status.builtAt > active.builtAt && status.builtAt > cachedDate) {
                await writeFileAtomic(path, bytes, { mode: 0o600 });
                this.database = candidate;
                this.notify();
                return status;
            }
            if (cached !== undefined && cachedDate > active.builtAt) {
                this.database = cached;
                this.notify();
                return cached.status(Date.now());
            }
            return active;
        }, { signal });
    }
    /**
     * Read current freshness and attribution for management and audit.
     * @returns The actual local source status; a disposed provider throws.
     */
    status() {
        if (this.database === undefined || this.lifetime.signal.aborted)
            throw new TargetProtectionError('unavailable', 'Country data is unavailable.');
        return this.database.status(Date.now());
    }
    /**
     * Identify the local source that guarded file executors must preserve.
     * @returns The configured or bundled source and, when present, the managed cache directory.
     */
    sourcePaths() {
        const source = this.config.path ? resolve(this.config.path)
            : fileURLToPath(new URL(`./assets/${BUNDLED_COUNTRY_SOURCE.filename}`, import.meta.resolve('@deepseek-ai/dsh-target-protection/package.json')));
        return this.cachePath === undefined ? [source] : [source, dirname(this.cachePath)];
    }
    /**
     * Classify actual pinned addresses without a remote geolocation request.
     * @param addresses - Every address the transport may connect to.
     * @returns CN, outside or unknown; disposal and expired data return unknown.
     */
    mainland(addresses) {
        if (this.database === undefined || this.lifetime.signal.aborted)
            return 'unknown';
        return this.database.mainland(addresses, Date.now());
    }
}
//# sourceMappingURL=country-provider.js.map