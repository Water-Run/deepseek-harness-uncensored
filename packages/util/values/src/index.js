/** Duplicate-install-safe JSON and immutable-value helpers. @module @deepseek-ai/dsh-util-values */
/**
 * Mark an unreachable closed-union branch.
 * @param value - impossible value; an unhandled typed variant fails at the call site.
 * @param context - optional switch-site label included in the failure message.
 * @returns never; a runtime value that escaped its type always throws.
 */
export function assertNever(value, context) {
    const rendered = JSON.stringify(value) ?? String(value);
    throw new Error(`unreachable variant${context ? ` in ${context}` : ''}: ${rendered}`);
}
/** Whether a realm-owned intrinsic prototype has a native constructor matching this engine's representation. */
function hasIntrinsicConstructor(prototype, name) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    const constructor = descriptor?.value;
    if (typeof constructor !== 'function')
        return false;
    try {
        return constructor.name === name
            && constructor.prototype === prototype
            && Function.prototype.toString.call(constructor) === Function.prototype.toString.call(name === 'Array' ? Array : Object);
    }
    catch {
        return false;
    }
}
/** Whether a candidate is one realm's intrinsic `Object.prototype`. */
function isIntrinsicObjectPrototype(value) {
    return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, 'Object');
}
/** Whether an array uses one realm's intrinsic `Array.prototype`, not a subclass or forged prototype. */
function hasPlainArrayPrototype(value) {
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array'))
        return false;
    const objectPrototype = Object.getPrototypeOf(prototype);
    return typeof objectPrototype === 'object'
        && objectPrototype !== null
        && isIntrinsicObjectPrototype(objectPrototype);
}
/** Whether an object is a plain or null-prototype record from any JavaScript realm. */
function hasPlainObjectPrototype(value) {
    const prototype = Object.getPrototypeOf(value);
    return prototype === null
        || typeof prototype === 'object' && isIntrinsicObjectPrototype(prototype);
}
/** Return every JSON-visible object key, or reject own data JSON would discard. */
function enumerableStringKeys(value) {
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key)))
        return undefined;
    return keys;
}
/** Validate lossless JSON iteratively, optionally materializing a detached snapshot. */
function walkJsonValue(value, detach) {
    const ancestors = new Set();
    let root;
    let parent;
    const assign = (item) => {
        if (parent === undefined) {
            if (detach)
                root = item;
        }
        else if (parent.kind === 'array') {
            if (parent.target !== undefined)
                parent.target[parent.key] = item;
        }
        else if (parent.target !== undefined) {
            Object.defineProperty(parent.target, parent.key, {
                value: item,
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
    };
    const frames = [];
    let current = value;
    for (;;) {
        if (current === null) {
            assign(null);
        }
        else if (typeof current === 'boolean' || typeof current === 'string') {
            assign(current);
        }
        else if (typeof current === 'number') {
            if (!Number.isFinite(current) || Object.is(current, -0))
                return undefined;
            assign(current);
        }
        else {
            if (typeof current !== 'object')
                return undefined;
            if (ancestors.has(current))
                return undefined;
            if (Array.isArray(current)) {
                if (!hasPlainArrayPrototype(current))
                    return undefined;
                const length = current.length;
                if (Reflect.ownKeys(current).length !== length + 1)
                    return undefined;
                const target = detach ? [] : undefined;
                if (target !== undefined)
                    assign(target);
                let indices;
                if (!Number.isInteger(length)) {
                    // Capture indices with one subtraction for fractional or coercible Proxy lengths.
                    indices = [];
                    for (let index = length - 1; index >= 0; index--)
                        indices.push(index);
                }
                frames.push({ kind: 'array', source: current, length: indices?.length ?? length, index: 0, key: 0, indices, target });
            }
            else {
                if (!hasPlainObjectPrototype(current))
                    return undefined;
                const keys = enumerableStringKeys(current);
                if (keys === undefined)
                    return undefined;
                const target = detach ? {} : undefined;
                if (target !== undefined)
                    assign(target);
                frames.push({ kind: 'object', source: current, keys, index: 0, key: '', target });
            }
            ancestors.add(current);
        }
        for (;;) {
            const frame = frames.at(-1);
            if (frame === undefined)
                return detach ? root : true;
            const length = frame.kind === 'array' ? frame.length : frame.keys.length;
            if (frame.index >= length) {
                ancestors.delete(frame.source);
                frames.pop();
                continue;
            }
            const index = frame.index++;
            parent = frame;
            if (frame.kind === 'array') {
                const key = frame.indices === undefined ? index : frame.indices[frame.indices.length - index - 1];
                /* v8 ignore next -- the loop is bounded by the captured index count. */
                if (key === undefined)
                    return undefined;
                if (!Object.prototype.hasOwnProperty.call(frame.source, key))
                    return undefined;
                frame.key = key;
                current = frame.source[key];
            }
            else {
                const key = frame.keys[index];
                /* v8 ignore next -- the loop is bounded by the captured key count. */
                if (key === undefined)
                    return undefined;
                frame.key = key;
                current = frame.source[key];
            }
            break;
        }
    }
}
/**
 * Validate and detach lossless JSON in one read per property.
 * @param value - candidate value to validate and detach.
 * @returns the detached snapshot, or `undefined` when the value is not losslessly JSON-serializable.
 */
export function snapshotJsonValue(value) {
    return walkJsonValue(value, true);
}
/**
 * Test the same lossless JSON rules as {@link snapshotJsonValue} without detaching the value.
 * @param value - candidate value to test.
 * @returns whether the value survives a JSON round trip without loss.
 */
export function isJsonValue(value) {
    return walkJsonValue(value, false) === true;
}
/**
 * Compare JSON-compatible values by array order and own object members.
 * @param a - one JSON-compatible value.
 * @param b - the other JSON-compatible value.
 * @returns whether both values contain the same JSON data.
 */
export function deepEqualJson(a, b) {
    if (a === b)
        return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
        return false;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
            return false;
        return a.every((entry, index) => deepEqualJson(entry, b[index]));
    }
    const left = a;
    const right = b;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length)
        return false;
    return keys.every(key => Object.hasOwn(right, key) && deepEqualJson(left[key], right[key]));
}
/**
 * Deep-freeze an object graph in place while leaving live AbortSignal objects mutable.
 * @param value - value to freeze.
 * @returns the same value after every reachable enumerable child is frozen.
 */
export function deepFreeze(value) {
    const seen = new WeakSet();
    const pending = [{ kind: 'visit', node: value }];
    while (pending.length > 0) {
        const task = pending.pop();
        /* v8 ignore next -- the loop condition guarantees one pending task. */
        if (task === undefined)
            continue;
        if (task.kind === 'property') {
            pending.push({ kind: 'visit', node: task.source[task.key] });
            continue;
        }
        const node = task.node;
        if (node === null || typeof node !== 'object')
            continue;
        if (node instanceof AbortSignal)
            continue;
        if (seen.has(node))
            continue;
        seen.add(node);
        Object.freeze(node);
        const keys = Object.keys(node);
        for (let index = keys.length - 1; index >= 0; index--) {
            const key = keys[index];
            /* v8 ignore next -- the loop is bounded by the captured key count. */
            if (key === undefined)
                continue;
            pending.push({ kind: 'property', source: node, key });
        }
    }
    return value;
}
/**
 * Weak-key lookup with a strongly retained iterable set of associated values.
 *
 * Each value must belong to only one key. The container performs no automatic
 * cleanup; owners delete associations or clear the container at lifecycle end.
 */
export class WeakMapWithValues {
    keys = new WeakMap();
    valueSet = new Set();
    /** Live strongly retained values in insertion order. */
    values = this.valueSet;
    /**
     * Read the value associated with a key.
     * @param key - weakly held lookup key.
     * @returns the associated value, or absence.
     */
    get(key) {
        return this.keys.get(key);
    }
    /**
     * Test whether a key has an association.
     * @param key - weakly held lookup key.
     * @returns whether the key is present.
     */
    has(key) {
        return this.keys.has(key);
    }
    /**
     * Associate one key with one caller-unique value.
     * @param key - weakly held lookup key.
     * @param value - strongly retained value that belongs to no other key.
     * @returns this container.
     */
    set(key, value) {
        if (this.keys.has(key)) {
            const previous = this.keys.get(key);
            if (previous === value)
                return this;
            this.valueSet.delete(previous);
        }
        this.keys.set(key, value);
        this.valueSet.add(value);
        return this;
    }
    /**
     * Remove one association and its strongly retained value.
     * @param key - weakly held lookup key.
     * @returns whether an association was removed.
     */
    delete(key) {
        if (!this.keys.has(key))
            return false;
        const value = this.keys.get(key);
        const deleted = this.keys.delete(key);
        this.valueSet.delete(value);
        return deleted;
    }
    /** Remove every association and strongly retained value. */
    clear() {
        this.keys = new WeakMap();
        this.valueSet.clear();
    }
}
export { PartialArguments } from "./partial-json.js";
//# sourceMappingURL=index.js.map