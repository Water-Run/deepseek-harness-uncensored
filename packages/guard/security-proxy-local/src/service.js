/**
 * The Remote surface of the security-mode egress proxy: settings, connection
 * check, and the bounded traffic list/detail the settings panel renders.
 *
 * Mutations and captured exchanges require the application owner. Status reads
 * report upstream password presence without returning the secret.
 * @module @deepseek-ai/dsh-security-proxy-local/service
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/**
 * Host service consumed by tools in-process and by the settings panel over the
 * Remote gateway. One instance serves the whole Host.
 */
let SecurityProxyService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _browserEnvironment_decorators;
    let _browserTrust_decorators;
    let _get_decorators;
    let _configure_decorators;
    let _setPassword_decorators;
    let _test_decorators;
    let _list_decorators;
    let _detail_decorators;
    let _exportCapture_decorators;
    let _clear_decorators;
    let _pause_decorators;
    return class SecurityProxyService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _browserEnvironment_decorators = [Remote];
            _browserTrust_decorators = [Remote];
            _get_decorators = [Remote];
            _configure_decorators = [Remote];
            _setPassword_decorators = [Remote];
            _test_decorators = [Remote];
            _list_decorators = [Remote];
            _detail_decorators = [Remote];
            _exportCapture_decorators = [Remote];
            _clear_decorators = [Remote];
            _pause_decorators = [Remote];
            __esDecorate(this, null, _browserEnvironment_decorators, { kind: "method", name: "browserEnvironment", static: false, private: false, access: { has: obj => "browserEnvironment" in obj, get: obj => obj.browserEnvironment }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _browserTrust_decorators, { kind: "method", name: "browserTrust", static: false, private: false, access: { has: obj => "browserTrust" in obj, get: obj => obj.browserTrust }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _configure_decorators, { kind: "method", name: "configure", static: false, private: false, access: { has: obj => "configure" in obj, get: obj => obj.configure }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setPassword_decorators, { kind: "method", name: "setPassword", static: false, private: false, access: { has: obj => "setPassword" in obj, get: obj => obj.setPassword }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _test_decorators, { kind: "method", name: "test", static: false, private: false, access: { has: obj => "test" in obj, get: obj => obj.test }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _detail_decorators, { kind: "method", name: "detail", static: false, private: false, access: { has: obj => "detail" in obj, get: obj => obj.detail }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _exportCapture_decorators, { kind: "method", name: "exportCapture", static: false, private: false, access: { has: obj => "exportCapture" in obj, get: obj => obj.exportCapture }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _clear_decorators, { kind: "method", name: "clear", static: false, private: false, access: { has: obj => "clear" in obj, get: obj => obj.clear }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _pause_decorators, { kind: "method", name: "pause", static: false, private: false, access: { has: obj => "pause" in obj, get: obj => obj.pause }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        engine = __runInitializers(this, _instanceExtraInitializers);
        /**
         * @param ctx - owning context; the service registers as `ctx.securityProxy`.
         * @param engine - the proxy runtime this service fronts.
         */
        constructor(ctx, engine) {
            super(ctx, 'securityProxy', { namespace: 'securityProxy' });
            this.engine = engine;
        }
        /**
         * Resolve whether one tool execution is routed through the proxy.
         * @param agent - the executing Agent.
         * @param tool - the model-facing tool name.
         * @returns the route, or undefined when the session is not covered.
         */
        route(agent, tool) {
            return this.engine.route(agent, tool);
        }
        /**
         * Environment for one child process in a covered session.
         * @param agent - the executing Agent.
         * @param tool - the model-facing tool name.
         * @returns the overlay, or undefined when the session is not covered.
         */
        async environment(agent, tool) {
            return await this.engine.environment(agent, tool);
        }
        /**
         * Retain native forwarding and capture under the executing conversation.
         * @param agent - Executing Agent; absence acquires nothing.
         * @param tool - Traffic attribution.
         * @param stop - Join delegated resources after cancellation.
         * @param signal - Caller lifetime.
         * @param admission - Optional cancellation during startup only; omitted for caller lifetime alone.
         * @returns Covered execution lease, or undefined outside enabled Security mode.
         */
        async openEgress(agent, tool, stop, signal, admission) {
            return await this.engine.openEgress(agent, tool, stop, signal, admission);
        }
        /**
         * Issue a sidebar-browser endpoint using the Host-resolved conversation and recorded mode.
         * @param agent - Agent resolved by the ordinary Session resource loader.
         * @returns A credential-free local endpoint, or undefined outside enabled Security mode.
         */
        async browserEnvironment(agent) {
            this.assertOwner('securityProxy/browserEnvironment');
            const environment = await this.engine.environment(agent, 'sidebar_browser');
            if (environment === undefined)
                return undefined;
            if (environment.HTTP_PROXY === undefined)
                throw new Error('Security proxy did not provide a browser endpoint');
            return environment.HTTP_PROXY;
        }
        /**
         * Bind public certificate material to the owner-requested conversation and current listener.
         * @param agent - Agent resolved by the ordinary Session resource loader.
         * @param server - Exact loopback endpoint already issued for this browser.
         * @returns Public PEM for an inspected listener, or null for an opaque listener.
         */
        async browserTrust(agent, server) {
            this.assertOwner('securityProxy/browserTrust');
            const certificate = await this.engine.issuedCertificate(agent, 'sidebar_browser', server);
            if (certificate === undefined) {
                throw new RemoteError('security-proxy/browser-route-changed', 'The browser proxy route changed. Reopen the page to use the current route.', {});
            }
            return certificate;
        }
        /**
         * Retrieve one target through the proxy with full plaintext capture.
         * @param agent - the executing Agent.
         * @param url - the absolute HTTP(S) target.
         * @param signal - caller cancellation.
         * @returns the decoded response.
         */
        async fetchTarget(agent, url, signal) {
            return await this.engine.fetchTarget(agent, url, signal);
        }
        /**
         * Read the whole settings and status surface.
         * @returns current state.
         */
        async get() {
            return await this.engine.state();
        }
        /**
         * Change settings; transport changes are re-verified before this resolves.
         * @param patch - owner-edited fields.
         * @returns state after the write.
         */
        async configure(patch) {
            this.assertOwner('securityProxy/configure');
            const before = await this.engine.state();
            const after = await this.engine.configure(patch);
            if (['enabled', 'protocol', 'host', 'port', 'authEnabled', 'username']
                .some(key => before.settings[key] !== after.settings[key]))
                this.transportChanged();
            return after;
        }
        /**
         * Store or remove the upstream password.
         * @param password - the new secret, or null to remove the record.
         * @returns state after the write.
         */
        async setPassword(password) {
            this.assertOwner('securityProxy/setPassword');
            const state = await this.engine.setPassword(password);
            this.transportChanged();
            return state;
        }
        /**
         * Run one real proxy-path check.
         * @returns the check outcome and the state after it.
         */
        async test() {
            this.assertOwner('securityProxy/test');
            return await this.engine.test();
        }
        /**
         * List retained flows for the application owner, newest first.
         * @param query - optional filters.
         * @returns matching rows and the capture counters.
         */
        async list(query) {
            this.assertOwner('securityProxy/list');
            const state = await this.engine.state();
            return { flows: this.engine.list(query), capture: state.capture };
        }
        /**
         * Read one flow's detail for the application owner.
         * @param id - flow identity.
         * @returns the detail, or null when pruned or unknown.
         */
        async detail(id) {
            this.assertOwner('securityProxy/detail');
            return Promise.resolve(this.engine.detail(id));
        }
        /**
         * Export all matching stored records for the application owner.
         * @param query - Session, kind and text filters without pagination.
         * @returns Complete stored snapshot; oversized exports fail without returning records.
         */
        async exportCapture(query) {
            this.assertOwner('securityProxy/exportCapture');
            const result = this.engine.exportCapture(query);
            if (result.kind === 'too-large') {
                throw new RemoteError('security-proxy/export-too-large', 'The capture export exceeds the configured byte budget.', { maxBytes: result.maxBytes });
            }
            return Promise.resolve(result.data);
        }
        /**
         * Drop every retained flow.
         * @returns the capture counters after clearing.
         */
        async clear() {
            this.assertOwner('securityProxy/clear');
            this.engine.clear();
            return (await this.engine.state()).capture;
        }
        /**
         * Pause or resume capture; forwarding continues either way.
         * @param paused - whether new flows are refused.
         * @returns state after the change.
         */
        async pause(paused) {
            this.assertOwner('securityProxy/pause');
            return await this.engine.setPaused(paused);
        }
        /**
         * Refuse an owner-only operation from a delegated Remote peer.
         * @param action - the attempted Remote method.
         */
        assertOwner(action) {
            if (principalOf(this.ctx.invocation) !== undefined) {
                throw new RemoteError('security-proxy/owner-required', 'This security proxy operation requires the application owner.', { action });
            }
        }
        transportChanged() {
            try {
                this.ctx.emit('security-proxy/transport-changed');
            }
            catch (error) {
                this.ctx.logger.warn('Browser proxy notification failed; reopen browser tabs before continuing.', error);
            }
        }
    };
})();
export { SecurityProxyService };
//# sourceMappingURL=service.js.map