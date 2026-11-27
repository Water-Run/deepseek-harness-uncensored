import { notifySubscribers } from "./notify.js";
/** The page's implementation of one {@link SyncedConfigRef}; only the activation that created it writes, through its port. */
class SyncedConfigReference {
    #value;
    #listeners = new Set();
    /**
     * @param value - frozen initial value.
     * @param attach - receives the controller's port; called once during construction.
     */
    constructor(value, attach) {
        this.#value = value;
        attach({
            set: (next) => { this.#value = next; },
            notify: () => { notifySubscribers(this.#listeners, 'synced configuration'); },
        });
    }
    /** @returns the current frozen value; undefined when the Host sends none. */
    get = () => this.#value;
    /** @returns the same value as {@link get}. */
    getSnapshot = () => this.#value;
    /**
     * Observe value changes; every changed field of one update is set before any subscriber runs.
     * @param listener - called after each change.
     * @returns the disposer.
     */
    subscribe = (listener) => {
        this.#listeners.add(listener);
        return () => { this.#listeners.delete(listener); };
    };
}
/** Structural equality of JSON values; object key order does not matter. */
function sameJson(left, right) {
    if (left === right)
        return true;
    if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
        return false;
    if (Array.isArray(left) !== Array.isArray(right))
        return false;
    const leftKeys = Object.keys(left);
    return leftKeys.length === Object.keys(right).length
        && leftKeys.every(key => Object.hasOwn(right, key) && sameJson(Reflect.get(left, key), Reflect.get(right, key)));
}
function freeze(value) {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
/** The Config object of one plugin activation. */
class SyncedConfigActivation {
    values;
    ports = new Map();
    refs = new Map();
    /** Read-only object whose properties create field references on first access. */
    config;
    constructor(values) {
        this.values = values;
        // An extensible empty target keeps the Proxy invariants satisfied for fields that appear later.
        this.config = new Proxy({}, {
            set: () => false,
            defineProperty: () => false,
            deleteProperty: () => false,
            get: (_target, property) => typeof property === 'string' ? this.ref(property) : undefined,
            has: (_target, property) => typeof property === 'string' && Object.hasOwn(this.values, property),
            ownKeys: () => Object.keys(this.values),
            getOwnPropertyDescriptor: (_target, property) => typeof property === 'string' && Object.hasOwn(this.values, property)
                ? { configurable: true, enumerable: true, value: this.ref(property) }
                : undefined,
        });
    }
    /** Set every changed field, then notify the changed fields' subscribers. */
    write(values) {
        const previous = this.values;
        const changed = [...new Set([...Object.keys(previous), ...Object.keys(values)])]
            .filter(field => !sameJson(previous[field], values[field]));
        if (changed.length === 0)
            return;
        this.values = values;
        const ports = changed.flatMap((field) => {
            const port = this.ports.get(field);
            return port === undefined ? [] : [{ port, value: values[field] }];
        });
        for (const { port, value } of ports)
            port.set(value);
        for (const { port } of ports)
            port.notify();
    }
    ref(field) {
        let ref = this.refs.get(field);
        if (ref === undefined) {
            ref = new SyncedConfigReference(this.values[field], (port) => { this.ports.set(field, port); });
            this.refs.set(field, ref);
        }
        return ref;
    }
}
/** Latest synced values of one package and the Config object of its current plugin activation. */
export class SyncedConfigEntry {
    values;
    current;
    /** @param values - Host-validated values; they are frozen and not checked against any schema. */
    constructor(values) {
        this.values = freeze(structuredClone(values));
    }
    /** Whether no field currently has a value. */
    get empty() {
        return Object.keys(this.values).length === 0;
    }
    /** The current activation's Config object; undefined between a teardown and the next activation. */
    get config() {
        return this.current?.config;
    }
    /**
     * Start an activation: a new Config object holding the latest values; the previous activation stops receiving writes.
     * @returns the object to hand to the activation's `apply`.
     */
    activate() {
        this.current = new SyncedConfigActivation(this.values);
        return this.current.config;
    }
    /**
     * An activation's teardown has begun; later values wait for the next activation.
     * @param config - the ending activation's object; omitted, the current activation ends.
     */
    release(config) {
        if (config === undefined || this.current?.config === config)
            this.current = undefined;
    }
    /**
     * Replace the values; the current activation receives the changed fields, if one is running.
     * @param values - the package's complete values; absent fields read undefined.
     */
    update(values) {
        this.values = freeze(structuredClone(values));
        this.current?.write(this.values);
    }
}
//# sourceMappingURL=synced-config.js.map