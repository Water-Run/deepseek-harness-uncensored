import { Service } from '@deepseek-ai/cordis';
import { isNullable } from '@deepseek-ai/cosmokit';
import { Entry } from "./entry.js";
import { EntryTree } from "./tree.js";
import { EntryValidationError, formatIssues, formatLocation, relocate, validateOptions } from "./utils.js";
/** Runtime owner for a list of child loader entries. */
export class EntryGroup {
    ctx;
    tree;
    static key = Symbol.for('cordis.group');
    data = [];
    constructor(ctx, tree) {
        this.ctx = ctx;
        this.tree = tree;
        const entry = ctx.fiber.entry;
        if (entry)
            entry.subgroup = this;
    }
    get context() {
        return this.ctx;
    }
    /**
     * Create or replace the entry for `options`. Invalid options reject with `EntryValidationError` and dispose any entry already registered under their id.
     * @returns The full entry id.
     */
    async create(options) {
        const issues = validateOptions(options, EntryTree.sep);
        if (issues.length)
            throw this._reject(options, issues);
        const id = this.tree.ensureId(options);
        const entry = this.tree.store[id] ??= new Entry(this.ctx.loader);
        // Entry may be moved from another group,
        // so we need to update the parent reference.
        entry.parent = this;
        // Use `create: true` to replace existing entry.options.
        await entry.update(options, true, true);
        return entry.id;
    }
    /**
     * Stack frames for an entry of this group, followed by those of the owning entries.
     * @param id - Tree-local entry id.
     * @returns Frames that point at the entries' source positions.
     */
    getOuterStack(id) {
        const location = this.tree.getLocation(id, []);
        const frames = location ? [`    at ${id} (${formatLocation(location)})`] : [];
        return [...frames, ...this.ctx.fiber.entry?.getOuterStack() ?? []];
    }
    _reject(options, issues) {
        const error = new EntryValidationError(issues);
        const id = options?.id;
        if (isNullable(id))
            return error;
        // unregistered first, so the disposal is not taken for a self-dispose
        const entry = this.tree.store[id];
        if (entry) {
            delete this.tree.store[id];
            entry.fiber?.dispose();
            this.context.emit('loader/partial-dispose', entry, entry.options, false);
        }
        const frames = this.getOuterStack(id);
        if (!frames.length)
            return error;
        const locate = (path) => this.tree.getLocation(id, path);
        relocate(error, formatIssues('invalid entry options', issues, locate), frames);
        return error;
    }
    unlink(options) {
        const config = this.data;
        const index = config.indexOf(options);
        if (index >= 0)
            config.splice(index, 1);
    }
    remove(id, isDispose = false) {
        const entry = this.tree.store[id];
        if (!entry || entry.parent !== this)
            return;
        // Unregister before disposal so Loader can distinguish removal from self-disposal.
        delete this.tree.store[id];
        entry.fiber?.dispose();
        if (!isDispose) {
            this.unlink(entry.options);
        }
        this.context.emit('loader/partial-dispose', entry, entry.options, false);
    }
    async update(config) {
        const oldConfig = this.data;
        this.data = config;
        const oldMap = Object.fromEntries(oldConfig.map(options => [options?.id, options]));
        // non-objects are rejected by `create`
        const newMap = Object.fromEntries(config.map(options => [options?.id ?? Symbol('anonymous'), options]));
        // update inner plugins
        const ids = Reflect.ownKeys({ ...oldMap, ...newMap });
        await Promise.all(ids.map(async (id) => {
            if (newMap[id]) {
                await this.create(newMap[id]).catch((error) => {
                    this.ctx.logger.error(error);
                });
            }
            else {
                this.remove(id);
            }
        }));
    }
    stop() {
        for (const options of this.data) {
            this.remove(options.id, true);
        }
    }
}
/** Plugin that mounts a nested loader entry group. */
export class Group extends EntryGroup {
    ctx;
    config;
    static initial = [];
    static [EntryGroup.key] = true;
    constructor(ctx, config) {
        super(ctx, ctx.fiber.entry.parent.tree);
        this.ctx = ctx;
        this.config = config;
        ctx.on('internal/update', config => this.update(config));
    }
    async *[Service.init]() {
        yield () => this.stop();
        await this.update(this.config);
    }
}
//# sourceMappingURL=group.js.map