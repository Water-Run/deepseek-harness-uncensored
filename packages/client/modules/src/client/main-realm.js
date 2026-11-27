/** Existing browser transport used when the carrier supplies no load hook. */
const loadPageBundle = (url) => new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.async = true;
    el.src = url;
    el.addEventListener('load', () => {
        el.remove();
        resolve();
    }, { once: true });
    el.addEventListener('error', () => {
        el.remove();
        reject(new Error(`client-modules: bundle script ${url} failed to load`));
    }, { once: true });
    document.head.append(el);
});
/** Owns execution requests without assuming the carrier has a browser document. */
export class MainScriptRealm {
    loadBundle;
    id = 'main';
    pending = new Set();
    closed = false;
    disposal;
    /** @param loadBundle - Carrier execution hook; absent selects the existing page transport. */
    constructor(loadBundle = loadPageBundle) {
        this.loadBundle = loadBundle;
    }
    /** @param script - Script requested by Modules. @returns The carrier's execution completion. */
    execute(script) {
        if (this.closed)
            return Promise.reject(new Error('client-modules: Main Realm is disposed'));
        const task = this.loadBundle(script.url);
        this.pending.add(task);
        void task.then(() => { this.pending.delete(task); }, () => { this.pending.delete(task); });
        return task;
    }
    /** Stop accepting requests and await existing carrier operations without cancelling them. */
    dispose() {
        if (this.disposal !== undefined)
            return this.disposal;
        this.closed = true;
        this.disposal = Promise.allSettled([...this.pending]).then(() => { });
        return this.disposal;
    }
}
//# sourceMappingURL=main-realm.js.map