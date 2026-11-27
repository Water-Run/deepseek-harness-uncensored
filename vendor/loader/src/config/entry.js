import { Context, ValidationError } from '@deepseek-ai/cordis';
import { deepEqual, isNullable, updateVolatile, volatileEntries } from '@deepseek-ai/cosmokit';
import { EntryTree, ModuleNotFoundError } from "./tree.js";
import { evaluate, formatIssues, formatLocation, isJsExpr, relocate } from "./utils.js";
import { equalExceptVolatile } from "./diff.js";
function takeEntries(object, keys) {
    const result = [];
    for (const key of keys) {
        if (!(key in object))
            continue;
        result.push([key, object[key]]);
        delete object[key];
    }
    return result;
}
function sortKeys(object, prepend = ['id', 'name'], append = ['config']) {
    const part1 = takeEntries(object, prepend);
    const part2 = takeEntries(object, append);
    const rest = takeEntries(object, Object.keys(object)).sort(([a], [b]) => a.localeCompare(b));
    return Object.assign(object, Object.fromEntries([...part1, ...rest, ...part2]));
}
/** One configured plugin node inside an `EntryTree`. */
export class Entry {
    loader;
    static key = Symbol.for('cordis.entry');
    ctx;
    fiber;
    /** Raw import result before export normalization; HMR updates it after a successful reload. */
    moduleNamespace;
    parent;
    // safety: call `entry.update()` immediately after creating an entry
    options = {};
    subgroup;
    subtree;
    _initTask;
    constructor(loader) {
        this.loader = loader;
        this.ctx = loader.ctx.extend({ [Entry.key]: this });
        this.context.emit('loader/entry-init', this);
    }
    /**
     * Merge partial options into `target`; a nullish value deletes its key.
     * @param target - Options to modify in place.
     * @param options - Changes to apply.
     * @returns `target`.
     */
    static merge(target, options) {
        for (const [key, value] of Object.entries(options)) {
            if (isNullable(value)) {
                delete target[key];
            }
            else {
                target[key] = value;
            }
        }
        return target;
    }
    get context() {
        return this.ctx;
    }
    get id() {
        let id = this.options.id;
        if (this.parent.tree.ctx.fiber.entry) {
            id = this.parent.tree.ctx.fiber.entry.id + EntryTree.sep + id;
        }
        return id;
    }
    /** True when this entry or any owning parent entry is disabled. */
    get disabled() {
        // group is always enabled
        if (this.options.group)
            return false;
        let entry = this;
        do {
            if (this._resolveDisabled(entry.options))
                return true;
            entry = entry.parent.ctx.fiber.entry;
        } while (entry);
        return false;
    }
    /**
     * Effective disabled state: a `!!js` expression evaluates against the loader
     * context. The raw node stays in the options, so write-back keeps the form.
     */
    _resolveDisabled(options) {
        return isJsExpr(options.disabled)
            ? Boolean(this.evaluate(options.disabled.__jsExpr))
            : Boolean(options.disabled);
    }
    evaluate(expr) {
        return evaluate(this.ctx, expr);
    }
    async _patchContext(diff) {
        await this.context.waterfall('loader/patch-context', this, async () => {
            Object.setPrototypeOf(this.ctx, this.parent.ctx);
            if (this.fiber?.uid && (diff.includes('config') || this.options.group)) {
                // A simultaneous context/config edit must restart against the new dependencies.
                const fiber = this.fiber.ctx.fiber;
                for (const name of Object.keys(fiber.inject))
                    fiber._checkImpl(name);
                await fiber.update(this.options.config, true);
            }
        });
    }
    async refresh() {
        if (this.fiber)
            return;
        if (this.disabled)
            return;
        await this.init();
    }
    /** Merge new options, restart as needed, and persist through the parent tree. */
    async update(options, create = false, force = false) {
        const legacy = { ...this.options };
        // step 1: update options
        if (create) {
            this.options = options;
        }
        else {
            Entry.merge(this.options, options);
        }
        sortKeys(this.options);
        // step 2: execute
        if (this.disabled) {
            await this.fiber?.dispose();
            return;
        }
        // step 3: check if options are changed
        if (this.fiber?.uid) {
            const changes = Object.keys({ ...this.options, ...legacy })
                .filter(key => !deepEqual(this.options[key], legacy[key], key === 'config'));
            // Only an active fiber in an unchanged context takes volatile-only config changes without a remount.
            const volatileOnly = changes.length === 1 && changes[0] === 'config'
                && this.fiber.state === 2 /* FiberState.ACTIVE */ && Object.getPrototypeOf(this.ctx) === this.parent.ctx
                && equalExceptVolatile(legacy.config, this.options.config, this.fiber.runtime?.Config);
            if (volatileOnly)
                this.fiber.rawConfig = this.options.config;
            const pending = volatileOnly && this._commitVolatile() ? [] : changes;
            if (!pending.length && !force)
                return;
            this.context.emit('loader/partial-dispose', this, legacy, true);
            await this._patchContext(pending);
        }
        else {
            await this.init();
        }
    }
    /**
     * Parse a volatile-only raw config change and commit its values into the running fiber's references.
     * An invalid candidate is logged and leaves the running references unchanged; the raw config stays retained for the next activation.
     * @returns `false` when an ordinary effective value changed, so the caller applies the ordinary update lifecycle.
     */
    _commitVolatile() {
        const fiber = this.fiber.ctx.fiber;
        const refs = volatileEntries(fiber.effectiveConfig);
        if (!refs.length)
            return true;
        const raw = this.options.config;
        let candidate;
        try {
            candidate = fiber.resolveConfig(raw);
        }
        catch (error) {
            this.ctx.logger.warn('volatile config update failed for %C', this.options.id);
            this.ctx.logger.warn(error);
            return true;
        }
        if (!deepEqual(fiber.effectiveConfig, candidate, true)) {
            this.ctx.logger.debug('ordinary config values of %C changed with its volatile values; applying the ordinary update', this.options.id);
            return false;
        }
        const paths = refs.flatMap(({ path, ref }) => {
            const source = path.reduce((value, key) => Reflect.get(value, key), candidate);
            if (deepEqual(ref.get(), source.get(), true))
                return [];
            updateVolatile(ref, source);
            return [path];
        });
        if (!paths.length)
            return true;
        const self = Object.create(fiber.ctx);
        self[Context.filter] = (owner) => owner.fiber === fiber;
        try {
            fiber.ctx.emit(self, 'loader/volatile-update', paths);
        }
        catch (error) {
            // A listener failure must not fail the entry update; every value is already committed.
            this.ctx.logger.warn(error);
        }
        return true;
    }
    /**
     * Where a value of this entry's options is written.
     * @param path - Path inside the entry options; empty for the entry itself.
     * @returns The source position, or undefined when the tree has no source.
     */
    getLocation(path = []) {
        return this.parent.tree.getLocation(this.options.id, path);
    }
    /** Stack frames from this entry out through its owning entries, each with its source position when known. */
    getOuterStack = () => this.parent.getOuterStack(this.options.id);
    /**
     * Rewrite a config validation error to list each issue with its source position, when this entry has a source.
     * @param error - Error to rewrite in place.
     */
    traceValidation(error) {
        const frames = this.getOuterStack();
        // an entry outside any source has nothing to point to
        if (!frames.length)
            return;
        const issues = error.issues.map(({ message, path }) => ({ message, path: ValidationError.normalizePath(path) }));
        const locate = (path) => this.getLocation(['config', ...path]);
        relocate(error, formatIssues('invalid config', issues, locate), frames);
    }
    _reportImport(error) {
        if (error instanceof ModuleNotFoundError) {
            const location = this.getLocation(['name']);
            if (location) {
                // before Node's hints
                const [first, ...hints] = error.message.split('\n');
                relocate(error, [`${first} (at name, ${formatLocation(location)})`, ...hints].join('\n'), this.getOuterStack());
            }
        }
        this.ctx.logger.error(error);
    }
    /** Import and start the configured plugin if it is not already running. */
    async init() {
        try {
            await (this._initTask ??= this._init());
        }
        finally {
            this._initTask = undefined;
        }
        this.fiber?.await().catch(() => { }).finally(() => {
            if (this.loader.getTasks().length)
                return;
            this.ctx.reflect.notify(['loader']);
        });
    }
    async _init() {
        let moduleNamespace;
        try {
            moduleNamespace = await this.parent.tree.import(this.options.name, this.getOuterStack);
        }
        catch (error) {
            this._reportImport(error);
            return;
        }
        const plugin = this.loader.unwrapExports(moduleNamespace);
        await this._patchContext([]);
        this.loader.showLog(this, 'apply');
        this.fiber = this.ctx.registry.plugin(plugin, this.options.config, this.getOuterStack);
        this.moduleNamespace = moduleNamespace;
    }
}
//# sourceMappingURL=entry.js.map