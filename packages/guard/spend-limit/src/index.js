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
import schema from '@deepseek-ai/schemastery';
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { SpendRecovery } from "./continuation.js";
import { SpendLedger } from "./ledger.js";
import { SpendGate } from "./gate.js";
import { DEFAULT_RATES } from "./pricing.js";
/** All deployment-varying rates are configurable without changing source. */
export const Config = schema.object({
    path: schema.string().required(), pollMs: schema.number().step(1).min(50).max(60000).default(1000), rates: schema.array(schema.object({
        providers: schema.array(schema.string()).required(), models: schema.array(schema.string()).required(),
        input: schema.number().min(0).max(10000).required(), cachedInput: schema.number().min(0).max(10000).required(),
        cacheWrite: schema.number().min(0).max(10000).required(), output: schema.number().min(0).max(10000).required(),
        contextTokens: schema.number().step(1).min(1).max(100000000).required(),
        maxOutputTokens: schema.number().step(1).min(1).max(100000000).required(), searchRequest: schema.number().min(0).max(10000).required(),
    })).default(DEFAULT_RATES)
});
export const name = 'spend-limit';
export const inject = ['llm'];
const count = z.number().int().nonnegative();
const usageSchema = z.object({ input_tokens: count, output_tokens: count,
    cache_read_input_tokens: count.optional(), cache_creation_input_tokens: count.optional() });
/** Authenticated settings and observations; no request content or credentials are stored. */
let SpendLimitRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _get_decorators;
    let _sessionUsage_decorators;
    let _configure_decorators;
    let _configureWindow_decorators;
    let _setAutoResume_decorators;
    let _disableAll_decorators;
    let _resume_decorators;
    let _reset_decorators;
    return class SpendLimitRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _get_decorators = [Remote];
            _sessionUsage_decorators = [Remote];
            _configure_decorators = [Remote];
            _configureWindow_decorators = [Remote];
            _setAutoResume_decorators = [Remote];
            _disableAll_decorators = [Remote];
            _resume_decorators = [Remote];
            _reset_decorators = [Remote];
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _sessionUsage_decorators, { kind: "method", name: "sessionUsage", static: false, private: false, access: { has: obj => "sessionUsage" in obj, get: obj => obj.sessionUsage }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _configure_decorators, { kind: "method", name: "configure", static: false, private: false, access: { has: obj => "configure" in obj, get: obj => obj.configure }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _configureWindow_decorators, { kind: "method", name: "configureWindow", static: false, private: false, access: { has: obj => "configureWindow" in obj, get: obj => obj.configureWindow }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setAutoResume_decorators, { kind: "method", name: "setAutoResume", static: false, private: false, access: { has: obj => "setAutoResume" in obj, get: obj => obj.setAutoResume }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _disableAll_decorators, { kind: "method", name: "disableAll", static: false, private: false, access: { has: obj => "disableAll" in obj, get: obj => obj.disableAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _resume_decorators, { kind: "method", name: "resume", static: false, private: false, access: { has: obj => "resume" in obj, get: obj => obj.resume }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _reset_decorators, { kind: "method", name: "reset", static: false, private: false, access: { has: obj => "reset" in obj, get: obj => obj.reset }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        runtime = __runInitializers(this, _instanceExtraInitializers);
        /** @param ctx - Service owner. @param runtime - Owned ledger and recovery worker. */
        constructor(ctx, runtime) {
            super(ctx, 'spendLimit', { namespace: 'spending' });
            this.runtime = runtime;
        }
        assertOwner(action) {
            if (principalOf(this.ctx.invocation) !== undefined)
                throw new RemoteError('spending/owner-required', 'Only the application owner can change spending limits.', { action });
        }
        /**
         * Register the lifecycle owner that captures and restores ordinary conversations.
         * @param handler - Normal conversation restoration path.
         * @param capture - Tests ownership of a live Session before creating a durable pause.
         * @returns Cancelling, draining registration disposer.
         */
        registerContinuation(handler, capture) {
            return this.runtime.recovery.register(handler, capture);
        }
        /**
         * Discard a conversation's saved continuation, including one awaiting restoration.
         * @param sessionId - Conversation whose pending continuation has been withdrawn.
         */
        async forgetSession(sessionId) { (await this.runtime.ready).ledger.clearSession(sessionId); }
        /**
         * Read the durable ledger; initialization failures remain visible to every caller.
         * @returns Shared limits, rolling totals and local waiters.
         */
        async get() { const gate = await this.runtime.ready; return gate.ledger.snapshot(gate.waiting); }
        /**
         * Read recorded estimates for a conversation and all its side generations, even when limits are off.
         * @param sessionId - Conversation to inspect; only the application owner may read it.
         * @returns CNY estimate and bounded cumulative history, with missing usage or rates counted explicitly.
         */
        async sessionUsage(sessionId) {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                this.assertOwner('spending/sessionUsage');
                const query = this.ctx.get('sessionQuery');
                if (query === undefined)
                    throw new RemoteError('gateway/internal', 'Session history is unavailable.', {});
                const source = __addDisposableResource(env_1, await query.observeSession(sessionId, { projectionMode: 'none' }), false);
                const related = [];
                for (const id of await query.listSideSessions(sessionId)) {
                    const env_2 = { stack: [], error: void 0, hasError: false };
                    try {
                        const side = __addDisposableResource(env_2, await query.observeSession(id, { projectionMode: 'none' }), false);
                        related.push({ events: side.events, inheritedEventCount: side.inheritedEventCount });
                    }
                    catch (e_1) {
                        env_2.error = e_1;
                        env_2.hasError = true;
                    }
                    finally {
                        __disposeResources(env_2);
                    }
                }
                return (await this.runtime.ready).sessionUsage(source.events, source.inheritedEventCount, related);
            }
            catch (e_2) {
                env_1.error = e_2;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        }
        /**
         * Save user preferences across local processes.
         * @param preferences - Complete user limits.
         * @returns Committed settings and totals.
         */
        async configure(preferences) {
            this.assertOwner('spending/configure');
            const gate = await this.runtime.ready;
            gate.ledger.configure(preferences);
            await this.runtime.recovery.flush(gate);
            return this.get();
        }
        /**
         * Save one window without overwriting concurrent changes to another window.
         * @param update - Window and the settings to change.
         * @returns Committed preferences and totals.
         */
        async configureWindow(update) {
            this.assertOwner('spending/configure-window');
            const gate = await this.runtime.ready;
            gate.ledger.configureWindow(update);
            await this.runtime.recovery.flush(gate);
            return this.get();
        }
        /**
         * Save the automatic continuation preference independently of window settings.
         * @param enabled - Whether paused conversations should continue when capacity returns.
         * @returns Committed preferences and totals.
         */
        async setAutoResume(enabled) {
            this.assertOwner('spending/auto-resume');
            const gate = await this.runtime.ready;
            gate.ledger.setAutoResume(enabled);
            await this.runtime.recovery.flush(gate);
            return this.get();
        }
        /**
         * Disable all windows while preserving their amounts and accounting records.
         * @returns Committed preferences and totals after eligible conversations resume.
         */
        async disableAll() {
            this.assertOwner('spending/disable-all');
            const gate = await this.runtime.ready;
            gate.ledger.disableAll();
            await this.runtime.recovery.flush(gate);
            return this.get();
        }
        /**
         * Clear manual pause.
         * @returns Updated state; remaining limits still apply.
         */
        async resume() {
            this.assertOwner('spending/resume');
            const gate = await this.runtime.ready;
            gate.ledger.resume();
            await this.runtime.recovery.flush(gate);
            return this.get();
        }
        /**
         * Clear completed statistics.
         * @param period - One rolling window; omission resets all completed statistics.
         * @returns Remaining active reservations and settings.
         */
        async reset(period) {
            this.assertOwner('spending/reset');
            const gate = await this.runtime.ready;
            gate.ledger.reset(period);
            await this.runtime.recovery.flush(gate);
            return this.get();
        }
    };
})();
export { SpendLimitRemote };
/**
 * Install admission before provider dispatch and retain the ledger through request teardown.
 * @param ctx - Root application scope.
 * @param config - Validated deployment settings.
 */
export async function apply(ctx, config) {
    ctx.inject(['sessionProjections'], async (scope) => {
        const sequence = z.number().int().min(-1);
        const billingEvents = new Set(['assistant/message', 'assistant/attempt', 'memory/extraction', 'input/prediction']);
        await scope.sessionProjections.register({
            key: 'sessionSpendRevision', stateVersion: 1, stateSchema: sequence,
            init: () => -1,
            apply: (previous, event) => billingEvents.has(event.type) ? event.seq : previous,
            wire: { viewSchema: sequence, view: value => value, summary: true },
        });
    });
    let closing = false;
    const ready = SpendLedger.open(config.path)
        .then(ledger => new SpendGate(ledger, config.rates, config.pollMs, id => recovery.canCapture(id)));
    void ready.catch((error) => { ctx.logger.error('spend-limit: ledger unavailable; paid requests remain blocked'); ctx.logger.error(error); });
    const recovery = new SpendRecovery((error) => {
        ctx.logger.error('spend-limit: paused conversation remains pending; recovery failed');
        ctx.logger.error(error);
    });
    let stopPolling;
    void ready.then((gate) => {
        if (closing)
            return;
        const timer = setInterval(() => { void recovery.flush(gate); }, config.pollMs);
        stopPolling = () => { clearInterval(timer); };
    }, () => { });
    const service = ctx.plugin(SpendLimitRemote, { ready, recovery });
    const stopStream = ctx.on('llm/stream', async function* (request, next) {
        const gate = await ready;
        if (closing)
            throw new Error('spend-limit: service is closing');
        yield* gate.stream(request, next);
    });
    const stopSearch = ctx.on('web/deepseek-search-request', async (request, signal, next) => {
        const gate = await ready;
        if (closing)
            throw new Error('spend-limit: service is closing');
        return gate.call({ provider: 'deepseek-official', model: request.body.model, maxTokens: request.body.max_tokens, searches: request.body.tools[0].max_uses }, async () => {
            const value = await next();
            const parsed = usageSchema.safeParse(value.usage);
            const counters = parsed.success ? parsed.data : undefined;
            return { value, ...counters === undefined ? {} : { usage: { inputTokens: counters.input_tokens, outputTokens: counters.output_tokens,
                        cacheReadTokens: counters.cache_read_input_tokens ?? 0, cacheWriteTokens: counters.cache_creation_input_tokens ?? 0 } },
                searches: value.content?.filter(block => block.type === 'web_search_tool_result').length ?? request.body.tools[0].max_uses };
        }, signal);
    });
    ctx.effect(() => async () => {
        closing = true;
        stopPolling?.();
        stopStream();
        stopSearch();
        await recovery.close();
        // Failed initialization has already been reported; there is no owned handle to close.
        const gate = await ready.catch(() => undefined);
        await gate?.close();
        await service.dispose();
    }, 'spend-limit: admission and ledger');
    try {
        await service.await();
    }
    catch (error) {
        closing = true;
        stopPolling?.();
        stopStream();
        stopSearch();
        await recovery.close();
        await (await ready.catch(() => undefined))?.close();
        throw error;
    }
}
//# sourceMappingURL=index.js.map