import { EntryTree, EntryGroup, isJsExpr } from '@deepseek-ai/cordis-plugin-loader';
import { Context, Service } from '@deepseek-ai/cordis';
import { deepEqual } from '@deepseek-ai/cosmokit';
import { basename, dirname, extname, join } from 'node:path';
import { access, constants, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAlias, isMap, isNode, isScalar, isSeq, LineCounter, parseDocument, Scalar, stringify, visit, YAMLError, YAMLParseError, } from 'yaml';
import { stringifyString } from 'yaml/util';
import { applyJournal, flatten, merge, reconcile, record } from "./journal.js";
import { applyPatches, ensureIds, ensureInsertIds, routeJournal } from "./patch.js";
/** Shared patch semantics used by config dumps and mounting. */
export { applyPatches as applyEntryPatches } from "./patch.js";
// A Windows drive-letter path, e.g. `C:\app\cordis.yml` or `C:/app/cordis.yml`.
const driveLetter = /^[A-Za-z]:[\\/]/;
const JsExpr = {
    tag: 'tag:yaml.org,2002:js',
    identify: isJsExpr,
    resolve: (source) => ({ __jsExpr: source }),
    // quoted like any other string
    stringify: (item, ctx, onComment, onChompKeep) => {
        const scalar = new Scalar(item.value.__jsExpr);
        return stringifyString(Object.assign(scalar, { type: item.type }), ctx, onComment, onChompKeep);
    },
};
const yamlOptions = {
    schema: 'core',
    customTags: [JsExpr],
};
/**
 * Parse text in Include's YAML dialect: YAML 1.2 under the core schema, plus `!!js`. A `!!js` scalar becomes a
 * child-owned JavaScript expression node that stays literal until its owning Loader entry evaluates it. Include
 * reads its own file with the same options.
 * @param content - YAML source text.
 * @returns the parsed value, or `undefined` for an empty document.
 * @throws the first parse error, or the first warning such as an unknown tag; {@link entryYamlErrorPosition} reads its location.
 */
export function parseEntryYaml(content) {
    const lines = new LineCounter();
    const document = parseDocument(content, { ...yamlOptions, lineCounter: lines });
    const [error] = [...document.errors, ...document.warnings, ...unresolvedAliases(document)];
    if (error) {
        // Alias errors carry offsets only; the parser's own errors already carry line positions.
        error.linePos ??= [lines.linePos(error.pos[0]), lines.linePos(error.pos[1])];
        throw error;
    }
    return document.contents === null ? undefined : document.toJS();
}
/**
 * Serialize a value in Include's YAML dialect. JavaScript expression nodes are written as `!!js` scalars. The output
 * never contains anchors or aliases: repeated object references are written out in full, and no option changes this.
 * @param value - entry list, patch list, or entry fragment to serialize.
 * @param options - output formatting.
 * @returns YAML text ending with a newline.
 */
export function stringifyEntryYaml(value, options = {}) {
    return stringify(value, { ...yamlOptions, singleQuote: true, aliasDuplicateObjects: false, lineWidth: options.lineWidth ?? 80 });
}
/**
 * Locate a parse error thrown by {@link parseEntryYaml}.
 * @param error - any caught value; only a parse error thrown by {@link parseEntryYaml} yields a position.
 * @returns the one-based line and column of the error, or `undefined` when the error carries no source location.
 */
export function entryYamlErrorPosition(error) {
    if (!(error instanceof YAMLError) || !error.linePos)
        return undefined;
    const [{ line, col }] = error.linePos;
    return { line, column: col };
}
const types = {
    '.json': 'application/json',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
};
function parseSyntax(content) {
    const lines = new LineCounter();
    const document = parseDocument(content, { ...yamlOptions, prettyErrors: false, lineCounter: lines });
    return { document, lines };
}
/**
 * The parser accepts an alias without a preceding anchor, which only fails in
 * `toJS()` with an unlocated `ReferenceError`. Nodes are visited in document
 * order, so an anchor is known exactly when it precedes the alias.
 */
function unresolvedAliases(document) {
    const anchors = new Set();
    const unresolved = [];
    visit(document, (_, node) => {
        if (isAlias(node)) {
            if (!anchors.has(node.source))
                unresolved.push(node);
        }
        else if (isNode(node) && node.anchor) {
            anchors.add(node.anchor);
        }
    });
    // every anchor is known once the scan ends
    return unresolved.map((node) => {
        const [start, end] = node.range;
        const message = anchors.has(node.source)
            ? `Alias *${node.source} must follow its anchor`
            : `Unresolved alias: *${node.source}`;
        return new YAMLParseError([start, end], 'BAD_ALIAS', message);
    });
}
// e.g. `at position 17 (line 2 column 16)`
const jsonPosition = /\s+at position (\d+)(?: \(line \d+ column \d+\))?$/;
export class ConfigFileError extends Error {
    stage;
    issues;
    name = 'ConfigFileError';
    constructor(stage, path, cause, issues = []) {
        super([`failed to ${stage} config file ${path}`, ...issues.map(({ message, location }) => {
                return `  - ${message} (at ${location.filename}:${location.line}:${location.column})`;
            })].join('\n'), { cause });
        this.stage = stage;
        this.issues = issues;
    }
}
/** The file changed under us between the pre-check and the rename. */
class StaleWriteError extends Error {
    name = 'StaleWriteError';
}
function isENOENT(error) {
    return error?.code === 'ENOENT';
}
const RENAME_RETRIES = 10;
const RENAME_BACKOFF = 20;
/**
 * On Windows a rename over a file that another process holds open (typically
 * an antivirus scanning what we just wrote) fails with one of these; the lock
 * is normally gone within milliseconds. A bounded retry is cheap enough to
 * apply on every platform.
 */
function isTransientRenameError(error) {
    const code = error?.code;
    return code === 'EACCES' || code === 'EPERM' || code === 'EBUSY';
}
/** Index path of an entry in a nested entry list. */
function findEntry(entries, id) {
    for (const [index, options] of entries.entries()) {
        if (options.id === id)
            return [index];
        if (!options.group || !Array.isArray(options.config))
            continue;
        const path = findEntry(options.config, id);
        if (path)
            return [index, 'config', ...path];
    }
}
function findInvalidEntries(entries, prefix = []) {
    return entries.flatMap((options, index) => {
        if (!options || typeof options !== 'object' || Array.isArray(options))
            return [[...prefix, index]];
        if (!options.group || !Array.isArray(options.config))
            return [];
        return findInvalidEntries(options.config, [...prefix, index, 'config']);
    });
}
/**
 * Range of the node at `path`, or of its deepest ancestor. A collection is
 * represented by the key that holds it.
 */
function seek(document, path) {
    let node = document.contents;
    let anchor = isNode(node) ? node.range : undefined;
    for (const key of path) {
        if (isAlias(node))
            node = node.resolve(document);
        if (isMap(node)) {
            const pair = node.items.find(pair => String(isScalar(pair.key) ? pair.key.value : pair.key) === String(key));
            if (!pair)
                break;
            node = pair.value;
            if (isNode(pair.key))
                anchor = pair.key.range;
        }
        else if (isSeq(node)) {
            const item = node.items[key];
            if (!isNode(item))
                break;
            node = item;
            anchor = item.range;
        }
        else {
            break;
        }
    }
    return isScalar(node) ? node.range : anchor;
}
export class Include extends EntryTree {
    config;
    static inject = ['loader'];
    // Child entries evaluate their expressions against their own injections.
    static [EntryGroup.key] = true;
    filename;
    type;
    /** The last file state we read or wrote. */
    cache;
    /** Tree-side changes that have not reached the file yet. */
    journal = new Map();
    /** Where the entries of the applied tree come from. */
    index;
    /** Ids we assigned to entries the file leaves anonymous. */
    anonymous = new Map();
    dirtyRead = false;
    dirtyWrite = false;
    _draining;
    /** Only the latest intended tree is ever applied; older ones are skipped. */
    _pendingTree;
    _applyTask;
    _disposed = false;
    _seq = 0;
    persistenceError;
    constructor(ctx, config) {
        super(ctx);
        this.config = config;
        this.enableLogs = config.enableLogs ?? ctx.fiber.entry?.parent.tree.enableLogs ?? false;
        // On Windows, a drive-letter path is converted with `pathToFileURL`.
        // `new URL()` would read its `C:` as a URL scheme, which `fileURLToPath` rejects.
        this.filename = fileURLToPath(process.platform === 'win32' && driveLetter.test(this.config.path)
            ? pathToFileURL(this.config.path)
            : new URL(this.config.path, this.ctx.baseUrl));
        const ext = extname(this.filename);
        if (!types[ext]) {
            throw new Error(`extension "${ext}" not supported`);
        }
        this.type = types[ext];
        this.ctx.baseUrl = new URL('.', pathToFileURL(this.filename)).href;
        ensureInsertIds(config.patches, id => !!this.store[id]);
        ctx.on('internal/update', (config, next) => {
            if (config.path !== this.config.path)
                return next();
            this.config = config;
            ensureInsertIds(config.patches, id => !!this.store[id]);
            this._scheduleApply();
            return this._applyTask;
        });
    }
    warn = (format, ...args) => {
        this.ctx[Context.root].logger?.('loader').warn(format, ...args);
    };
    async *[Service.init]() {
        try {
            await this._read();
        }
        catch (error) {
            // only a missing file falls back to `initial`
            const cause = error instanceof ConfigFileError && error.stage === 'read' ? error.cause : undefined;
            if (!isENOENT(cause))
                throw error;
            if (!this.config.initial) {
                throw new Error(`config file not found: ${this.filename}`);
            }
            const initial = structuredClone(this.config.initial);
            ensureIds(initial, id => !!this.store[id]);
            await this._writeText(this.dump(initial));
            await this._read();
        }
        yield () => this.stop();
        await this._applyTask;
    }
    async stop() {
        this._disposed = true;
        this._pendingTree = undefined;
        // Flush what the user last did before the tree goes away; this is also the
        // last attempt for changes a failed write left in the journal.
        if (this.journal.size) {
            this.dirtyWrite = true;
            this._drain();
        }
        try {
            await this.flush();
        }
        finally {
            this.root.stop();
        }
    }
    /**
     * Resolves once every pending read and write has been processed and the
     * tree reflects the outcome. Retries pending writes and rejects while changes remain unsaved.
     */
    async flush() {
        if (this.journal.size && !this._draining) {
            this.dirtyWrite = true;
            this._drain();
        }
        while (this._draining || this._applyTask) {
            await this._draining;
            await this._applyTask;
        }
        if (this.journal.size) {
            throw this.persistenceError ?? new Error(`config file ${this.filename} has ${this.journal.size} unsaved change(s)`);
        }
        this.persistenceError = undefined;
    }
    /** Re-read the file and reconcile the tree with it. */
    refresh() {
        this.dirtyRead = true;
        this._drain();
        return this.flush();
    }
    /** Called synchronously by the loader once a tree-side change is in place. */
    commit(change) {
        this.context.emit('loader/config-update');
        const parent = change.group === this.root ? null : change.group.ctx.fiber.entry.options.id;
        record(this.journal, change, parent);
        this.dirtyWrite = true;
        this._drain();
    }
    _drain() {
        if (this._draining)
            return;
        this._draining = this._loop().finally(() => {
            this._draining = undefined;
        });
    }
    async _loop() {
        while (this.dirtyRead || this.dirtyWrite) {
            if (this.dirtyRead) {
                this.dirtyRead = false;
                try {
                    await this._read();
                }
                catch (error) {
                    // Half-written files are routine while the user is editing, hence
                    // only a warning. With the file in an unknown state there is nothing
                    // safe to write: unless another read is due, stop here and leave
                    // `dirtyWrite` set for the next trigger.
                    this.persistenceError = error;
                    this.ctx.logger.warn(error);
                    if (this.dirtyRead)
                        continue;
                    return;
                }
            }
            if (this.dirtyWrite) {
                this.dirtyWrite = false;
                try {
                    await this._write();
                }
                catch (error) {
                    this.persistenceError = error;
                    this.ctx.logger.error(error);
                }
            }
        }
    }
    async _read() {
        let content;
        try {
            content = await readFile(this.filename, 'utf8');
        }
        catch (error) {
            throw new ConfigFileError('read', this.filename, error);
        }
        if (content === this.cache?.content)
            return;
        let data;
        let syntax;
        if (this.type === 'application/yaml') {
            syntax = parseSyntax(content);
            const { document, lines } = syntax;
            // unknown tags are only warnings to the parser, but leave the data incomplete
            const errors = [...document.errors, ...document.warnings, ...unresolvedAliases(document)];
            if (errors.length) {
                const issues = errors.map(error => ({ message: error.message, location: this._locate(lines, error.pos[0]) }));
                throw new ConfigFileError('parse', this.filename, undefined, issues);
            }
            data = document.toJS();
        }
        else {
            try {
                data = JSON.parse(content);
            }
            catch (error) {
                const match = error instanceof SyntaxError && error.message.match(jsonPosition);
                if (!match)
                    throw new ConfigFileError('parse', this.filename, error);
                const message = error.message.slice(0, match.index);
                const location = this._locate(parseSyntax(content).lines, +match[1]);
                throw new ConfigFileError('parse', this.filename, undefined, [{ message, location }]);
            }
        }
        // An empty or truncated file (routine mid-edit) parses to `undefined`, so
        // every non-array shape is rejected here as one "invalid file" signal.
        if (!Array.isArray(data)) {
            const message = 'config file must be a top-level array';
            const { document, lines } = syntax ?? parseSyntax(content);
            const range = document.contents?.range;
            if (!range)
                throw new ConfigFileError('validate', this.filename, new TypeError(message));
            throw new ConfigFileError('validate', this.filename, undefined, [{ message, location: this._locate(lines, range[0]) }]);
        }
        // ids, patches and the journal all assume an entry is an object
        const invalid = findInvalidEntries(data);
        if (invalid.length) {
            const { document, lines } = syntax ?? parseSyntax(content);
            const issues = invalid.map((path) => {
                const range = seek(document, path);
                return { message: 'entry must be an object', location: this._locate(lines, range?.[0] ?? 0) };
            });
            throw new ConfigFileError('validate', this.filename, undefined, issues);
        }
        this._assignIds(data);
        if (this.cache) {
            const { index } = applyPatches(data, this.config.patches);
            const conflicts = reconcile(this.journal, flatten(this.cache.data), flatten(data), (id, key) => index.fileOwned(id, key));
            for (const { id, reason } of conflicts) {
                this.ctx.logger.error('config conflict in %C: entry %C %s; file wins', this.filename, id, reason);
            }
        }
        this.cache = { content, data, syntax };
        this._scheduleApply();
        // the file changed while tree-side changes were pending: write the merge
        if (this.journal.size)
            this.dirtyWrite = true;
    }
    async _write() {
        if (!this.cache || !this.journal.size)
            return;
        const current = await readFile(this.filename, 'utf8').catch((error) => {
            if (isENOENT(error))
                return undefined;
            throw error;
        });
        if (current === undefined) {
            this.ctx.logger.warn('config file %C is missing, %d pending change(s) kept in memory', this.filename, this.journal.size);
            return;
        }
        if (current !== this.cache.content) {
            // someone else wrote the file: merge first, then come back
            this.dirtyRead = true;
            this.dirtyWrite = true;
            return;
        }
        // Snapshot and swap: changes reported while we are writing belong to the
        // next round.
        const batch = this.journal;
        this.journal = new Map();
        const restore = () => {
            for (const [id, record] of this.journal)
                merge(batch, id, record);
            this.journal = batch;
        };
        const data = structuredClone(this.cache.data);
        const patches = structuredClone(this.config.patches ?? []);
        if (routeJournal(batch, data, patches, this.warn)) {
            // Take the new patches now so that the tree scheduled below already
            // reflects them; the round trip through the parent only persists them.
            this.config = { ...this.config, patches };
            if (this.ctx.fiber.entry) {
                // Not awaited: the returned promise is the tree reconciliation, and
                // the drain loop must not block on fibers.
                try {
                    Promise.resolve(this.ctx.fiber.update(this.config)).catch((error) => {
                        this.ctx.logger.error(error);
                    });
                }
                catch (error) {
                    this.ctx.logger.error(error);
                }
            }
            else {
                this.ctx.logger.warn('patches of %C changed at runtime but cannot be persisted', this.filename);
            }
        }
        // nothing for the file itself (patch-only changes, or ids we assigned to
        // anonymous entries that are already part of the cache)
        if (deepEqual(data, this.cache.data)) {
            this._scheduleApply();
            return;
        }
        const text = this.dump(data);
        try {
            await access(this.filename, constants.W_OK);
        }
        catch {
            restore();
            this.ctx.logger.warn('config file %C is read-only, %d pending change(s) kept in memory', this.filename, this.journal.size);
            return;
        }
        try {
            await this._writeText(text, this.cache.content);
        }
        catch (error) {
            restore();
            if (error instanceof StaleWriteError) {
                this.dirtyRead = true;
                this.dirtyWrite = true;
                return;
            }
            this.ctx.logger.warn('failed to write config file %C, %d pending change(s) kept in memory', this.filename, this.journal.size);
            throw error;
        }
        this.cache = { content: text, data };
        this._scheduleApply();
    }
    /**
     * Write through a temp file and a rename, so that no reader ever sees a
     * truncated file. When `expected` is given, the rename (and every retry of
     * it) only goes ahead while the file still holds that content.
     */
    async _writeText(text, expected) {
        const tmp = join(dirname(this.filename), `.${basename(this.filename)}.${process.pid}.${this._seq++}.tmp`);
        try {
            await writeFile(tmp, text);
            for (let attempt = 0;; attempt++) {
                if (expected !== undefined) {
                    const current = await readFile(this.filename, 'utf8').catch((error) => {
                        if (isENOENT(error))
                            return undefined;
                        throw error;
                    });
                    if (current !== expected)
                        throw new StaleWriteError();
                }
                try {
                    await rename(tmp, this.filename);
                    return;
                }
                catch (error) {
                    if (attempt >= RENAME_RETRIES || !isTransientRenameError(error))
                        throw error;
                }
                await sleep(RENAME_BACKOFF * (attempt + 1));
            }
        }
        catch (error) {
            await rm(tmp, { force: true }).catch(() => { });
            throw error;
        }
    }
    dump(data) {
        return this.type === 'application/yaml'
            ? stringify(data, { ...yamlOptions, singleQuote: true })
            : JSON.stringify(data, null, 2);
    }
    getLocation(id, path) {
        if (!this.cache || !this.index)
            return;
        // values changed at runtime are not written anywhere yet
        const record = this.journal.get(id);
        if (record?.kind === 'remove')
            return;
        if (path.length && record && String(path[0]) in record.changes)
            return;
        const owner = path.length ? this.index.key(id, String(path[0])) : this.index.entry(id);
        if (owner.type === 'patch') {
            return this.ctx.fiber.entry?.getLocation(['config', 'patches', owner.index, ...path]);
        }
        else if (owner.type === 'embedded') {
            const prefix = findEntry(this.config.patches[owner.index][owner.key], id);
            if (!prefix)
                return;
            return this.ctx.fiber.entry?.getLocation(['config', 'patches', owner.index, owner.key, ...prefix, ...path]);
        }
        const prefix = findEntry(this.cache.data, id);
        if (!prefix)
            return;
        const { document, lines } = this.cache.syntax ??= parseSyntax(this.cache.content);
        const range = seek(document, [...prefix, ...path]);
        if (range)
            return this._locate(lines, range[0]);
    }
    _locate(lines, offset) {
        const { line, col } = lines.linePos(offset);
        return { filename: this.filename, line, column: col };
    }
    /**
     * Entries the file leaves anonymous get an id here, before the loader sees
     * them. One that looks exactly like an entry we named on the previous read
     * keeps that id, unless it is already explicitly owned, so editing a
     * neighbor does not restart it; anything else gets a fresh id. Assigned
     * ids stay in memory until the next write.
     */
    _assignIds(data) {
        const used = new Set();
        const collect = (entries) => {
            for (const options of entries) {
                if (options.id)
                    used.add(options.id);
                if (options.group && Array.isArray(options.config))
                    collect(options.config);
            }
        };
        collect(data);
        for (const patch of this.config.patches ?? []) {
            if (patch.insert)
                collect(patch.insert);
        }
        const previous = this.anonymous;
        this.anonymous = new Map();
        const assign = (entries, parent) => {
            for (const options of entries) {
                if (!options.id) {
                    let id;
                    for (const [candidate, info] of previous) {
                        if (info.parent !== parent || used.has(candidate) || !deepEqual(info.options, options))
                            continue;
                        id = candidate;
                        previous.delete(candidate);
                        break;
                    }
                    if (!id) {
                        do {
                            id = Math.random().toString(16).slice(2, 10);
                        } while (used.has(id) || this.store[id]);
                    }
                    used.add(id);
                    this.anonymous.set(id, { parent, options: structuredClone(options) });
                    const rest = { ...options };
                    for (const key of Object.keys(options))
                        delete options[key];
                    Object.assign(options, { id }, rest);
                }
                if (options.group && Array.isArray(options.config))
                    assign(options.config, options.id);
            }
        };
        assign(data, null);
    }
    _scheduleApply() {
        if (this._disposed || !this.cache)
            return;
        const { data, index } = applyPatches(this.cache.data, this.config.patches, this.warn);
        this.index = index;
        this._pendingTree = applyJournal(data, this.journal, undefined, this.warn);
        this._applyTask ??= (async () => {
            try {
                while (this._pendingTree) {
                    const tree = this._pendingTree;
                    this._pendingTree = undefined;
                    await this.root.update(tree);
                }
            }
            finally {
                this._applyTask = undefined;
            }
        })();
    }
}
export default Include;
//# sourceMappingURL=index.js.map