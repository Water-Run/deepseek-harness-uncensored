import { applyChanges, detach, flatten, place } from "./journal.js";
function randomId(used) {
    let id;
    do {
        id = Math.random().toString(16).slice(2, 10);
    } while (used(id));
    return id;
}
/** Give every entry (nested groups included) an id, in place. */
export function ensureIds(entries, used) {
    for (const entry of entries) {
        if (!entry.id)
            entry.id = randomId(used);
        if (entry.group && Array.isArray(entry.config))
            ensureIds(entry.config, used);
    }
}
/** Runtime changes are routed back to an inserted entry by its id, so every insert needs one. */
export function ensureInsertIds(patches, used) {
    for (const patch of patches ?? []) {
        if (patch.insert)
            ensureIds(patch.insert, used);
    }
}
const FILE = { type: 'file' };
/** Where every entry and key of a patched tree comes from. */
export class PatchIndex {
    owners;
    keys;
    constructor(owners, keys) {
        this.owners = owners;
        this.keys = keys;
    }
    /** Owner of the entry as a whole. */
    entry(id) {
        if (id === null)
            return FILE;
        return this.owners.get(id) ?? FILE;
    }
    /** Owner of one key of an entry. */
    key(id, key) {
        const index = this.keys.get(id)?.get(key);
        return index === undefined ? this.entry(id) : { type: 'patch', index };
    }
    fileOwned(id, key) {
        return (key === null ? this.entry(id) : this.key(id, key)).type === 'file';
    }
}
/**
 * Overlay `patches` onto a fresh clone of `data`. Entry lists from patches
 * are cloned too, so the tree owns every entry it mounts. The index is built
 * in the same pass, so a patch that does not apply owns nothing.
 */
export function applyPatches(data, patches, warn = () => { }) {
    data = structuredClone(data);
    const entries = new Map();
    const owners = new Map();
    const keys = new Map();
    const mount = (list, owner) => {
        for (const options of list) {
            if (options.id) {
                entries.set(options.id, options);
                owners.set(options.id, owner);
                // earlier overrides were aimed at the entry this one replaces
                keys.delete(options.id);
            }
            if (options.group && Array.isArray(options.config))
                mount(options.config, owner);
        }
    };
    const unmount = (list) => {
        for (const options of list) {
            if (options.id) {
                entries.delete(options.id);
                owners.delete(options.id);
                keys.delete(options.id);
            }
            if (options.group && Array.isArray(options.config))
                unmount(options.config);
        }
    };
    mount(data, FILE);
    patches?.forEach((patch, index) => {
        const { id, insert, name, ...overrides } = patch;
        const target = id ? entries.get(id) : undefined;
        if (insert) {
            if (id && !target)
                return warn('patch insert: entry %C not found', id);
            if (target && !target.group)
                return warn('patch insert: entry %C is not a group', id);
            const clone = structuredClone(insert);
            if (target) {
                if (!Array.isArray(target.config))
                    target.config = [];
                target.config.push(...clone);
            }
            else {
                data.push(...clone);
            }
            mount(clone, { type: 'embedded', index, key: 'insert' });
            return;
        }
        if (!id)
            return warn('patch: id is required for non-insert patches');
        if (!target)
            return warn('patch: entry %C not found', id);
        if (name && name !== target.name) {
            return warn('patch: name mismatch for %C (expected %C, got %C), skipping', id, target.name, name);
        }
        // the entries of a group config the patch replaces go away with it
        if ('config' in overrides && target.group && Array.isArray(target.config)) {
            unmount(target.config);
        }
        const overridden = keys.get(id) ?? new Map();
        keys.set(id, overridden);
        for (const [key, value] of Object.entries(overrides)) {
            target[key] = value;
            overridden.set(key, index);
        }
        // entries of a group config the patch supplies can be patched in turn
        if ('config' in overrides && target.group && Array.isArray(target.config)) {
            // ids go on the patch itself, before the tree takes its own copy
            ensureIds(target.config, id => entries.has(id));
            target.config = structuredClone(target.config);
            mount(target.config, { type: 'embedded', index, key: 'config' });
        }
    });
    return { data, index: new PatchIndex(owners, keys) };
}
/**
 * Route a journal to its owners: file-owned changes are applied to `data`,
 * patch-owned ones to `patches`. Both are mutated in place, so pass clones.
 * Returns whether any patch changed.
 */
export function routeJournal(journal, data, patches, warn) {
    let { index } = applyPatches(data, patches);
    let patched = false;
    // entries that move, appear or go away change the owners of later records
    const reindex = () => {
        index = applyPatches(data, patches).index;
    };
    // the list an entry is written in, and the group its top level belongs to
    const container = (owner) => {
        if (owner.type === 'file')
            return { list: data, parent: null };
        const patch = patches[owner.index];
        return { list: patch[owner.key], parent: patch.id ?? null };
    };
    // the list holding the entries of a group, when a patch supplies them
    const children = (parent) => {
        const owner = index.key(parent, 'config');
        if (owner.type === 'file')
            return;
        if (owner.type === 'patch') {
            const config = patches[owner.index].config;
            return Array.isArray(config) ? config : undefined;
        }
        const found = flatten(container(owner).list).get(parent);
        return found && (found.options.config ??= []);
    };
    const placeAt = (options, parent, position) => {
        const list = parent === null ? undefined : children(parent);
        if (list) {
            list.splice(Math.min(position, list.length), 0, options);
            patched = true;
        }
        else if (!place(data, options, parent, position)) {
            warn('cannot place entry %C: group %C not found', options.id, parent);
        }
    };
    for (const [id, record] of journal) {
        const owner = index.entry(id);
        const { list, parent: base } = container(owner);
        const embedded = owner.type === 'embedded';
        if (record.kind === 'remove') {
            detach(list, id);
            patched ||= embedded;
            reindex();
            continue;
        }
        const current = flatten(list).get(id);
        if (!current) {
            const options = { id };
            applyChanges(options, record.changes);
            placeAt(options, record.parent ?? null, record.position);
            reindex();
            continue;
        }
        // an entry at the top of a patch list belongs to the group the patch targets
        if (record.parent !== undefined && (current.parent ?? base) !== record.parent) {
            // moving across owners: carry the full options over
            detach(list, id);
            patched ||= embedded;
            applyChanges(current.options, record.changes);
            placeAt(current.options, record.parent, record.position);
            reindex();
            continue;
        }
        const patchChanges = {};
        applyChanges(current.options, record.changes, (key) => {
            const keyOwner = index.key(id, key);
            if (keyOwner.type !== 'patch')
                return true;
            (patchChanges[keyOwner.index] ??= {})[key] = record.changes[key];
            return false;
        });
        patched ||= embedded;
        for (const [i, changes] of Object.entries(patchChanges)) {
            applyChanges(patches[i], changes);
            patched = true;
        }
    }
    return patched;
}
//# sourceMappingURL=patch.js.map