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
/** Durable target rules and network admission; no model assessment grants permission. @module */
import { Service } from '@deepseek-ai/cordis';
import schema from '@deepseek-ai/schemastery';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { deadline, TimeoutReason } from '@deepseek-ai/dsh-timeout';
import { resolvePublicAddresses, resolveConnectionAddresses } from '@deepseek-ai/dsh-web-fetch-http';
import { canonicalTargetHost, TargetRules, expandTargetRules, parseTargetPreferences } from "./rules.js";
import { TargetStore } from "./store.js";
import { TargetProtectionError, TargetAuditError } from "./errors.js";
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { resolveTargetDns, systemHostsFile } from "./dns-resolution.js";
import { parseDnsServer } from "./dns-transport.js";
import { canonicalLocalPath, resolveLocalPathIdentity, localPathContains, localIdentityPaths, localDatabaseCompanionPaths } from "./file-identity.js";
import { decideLocalTarget } from "./file-rules.js";
import { projectDatabaseResources } from "./database-resources.js";
import { TARGET_REFUSAL_REASONS } from "./network-decision.js";
import { TargetAuditStore } from "./audit.js";
export { TargetProtectionError, TargetAuditError } from "./errors.js";
export { canonicalTargetHost, parseTargetPreferences, TargetRules, expandTargetRules } from "./rules.js";
export { TargetStore } from "./store.js";
function isTargetDenial(error) {
    return error instanceof HarnessError && Object.hasOwn(TARGET_REFUSAL_REASONS, error.code);
}
/** Root owner; the HTTP consumer requires this service and cannot fall back after its removal. */
export default class TargetProtection extends Service {
    static Config = schema.object({
        path: schema.string().required(), busyTimeoutMs: schema.natural().max(30000).default(1000),
        auditPath: schema.string().default(''), auditLimit: schema.natural().min(1).max(10000).default(2000),
        checkTimeoutMs: schema.natural().min(1).max(300000).default(5000), maxRechecks: schema.natural().min(1).max(20).default(3),
        dnsServers: schema.array(String).default([]), hostsFile: schema.string().default(systemHostsFile()),
        dnsQueryTimeoutMs: schema.natural().min(1).max(30000).default(1500),
        dnsMaxCnameDepth: schema.natural().min(1).max(64).default(8), dnsMaxRecords: schema.natural().min(1).max(4096).default(256),
        hostsMaxBytes: schema.natural().min(1).max(16777216).default(1048576),
        ownerPaths: schema.array(String).default([]), readOnlyPaths: schema.array(String).default([]),
    });
    config;
    ready;
    opened;
    lifetime = new AbortController();
    generation = new AbortController();
    checking = new Set();
    nativeExecutions = new Set();
    sshConnections = new Set();
    updates = Promise.resolve();
    nativeTransition;
    audit;
    auditFailed = false;
    auditInitiator;
    auditSessionScope = new AsyncLocalStorage();
    /** Plain holder keeps listener ownership at the provider when Cordis traces a borrowed service. */
    auditOwner;
    /**
     * @param ctx - Service owner whose lifetime contains all pending checks.
     * @param config - Explicit path and deployment limits.
     */
    constructor(ctx, config) {
        super(ctx, 'targetProtection');
        this.auditOwner = { ctx };
        this.config = TargetProtection.Config(config);
        if (this.config.path !== ':memory:')
            this.config.path = canonicalLocalPath(resolve(this.config.path));
        if (this.config.auditPath !== '')
            this.config.auditPath = canonicalLocalPath(resolve(this.config.auditPath));
        if (this.config.auditPath === this.config.path)
            throw new TargetProtectionError('invalid', 'Target audit requires a separate database.');
        if (this.config.hostsFile !== '')
            this.config.hostsFile = canonicalLocalPath(resolve(this.config.hostsFile));
        this.config.ownerPaths = this.config.ownerPaths.map(canonicalLocalPath);
        this.config.readOnlyPaths = this.config.readOnlyPaths.map(canonicalLocalPath);
        for (const server of this.config.dnsServers)
            parseDnsServer(server);
        this.ready = TargetStore.open(this.config.path, this.config.busyTimeoutMs);
        ctx.inject(['agents'], (scope) => {
            const agents = scope.agents;
            const current = () => agents.currentInitiator();
            scope.effect(() => {
                this.auditInitiator = current;
                return () => { if (this.auditInitiator === current)
                    this.auditInitiator = undefined; };
            }, 'target-protection.auditInitiator');
            scope.inject(['tools'], (tools) => {
                tools.on('tools/execute', (exec, next) => this.auditSessionScope.run({ session: exec.agent?.session }, () => exec.agent === undefined ? agents.withoutInitiator(next) : agents.withInitiator(exec.agent, next)));
            });
        });
        ctx.on('target-country/changed', () => { this.invalidate(); });
        void this.ready.catch((_error) => { });
        ctx.effect(() => async () => {
            this.lifetime.abort(new TargetProtectionError('unavailable', 'Target protection is closing.'));
            await Promise.allSettled(this.checking);
            const opened = await Promise.allSettled([this.ready]);
            try {
                this.audit?.close();
            }
            finally {
                this.auditSessionScope.disable();
                if (opened[0].status === 'fulfilled')
                    opened[0].value.close();
            }
        }, 'target-protection.store');
    }
    /** Refuse activation when durable settings cannot be validated. */
    async [Service.init]() {
        this.opened = await this.ready;
        if (this.config.auditPath !== '') {
            this.audit = await TargetAuditStore.open(this.config.auditPath, this.config.busyTimeoutMs, this.config.auditLimit);
        }
    }
    registryPaths() {
        return [this.config.path, this.config.auditPath].filter(path => path !== '' && path !== ':memory:')
            .flatMap(path => [path, `${path}-wal`, `${path}-shm`, `${path}-journal`]);
    }
    /**
     * Retain one verified SSH connection in the owner's coverage summary.
     * @param pathRules - Whether the helper accepted remote path protection.
     * @returns Idempotent removal, owned by the connection and called when it stops accepting requests.
     */
    registerSshCoverage(pathRules) {
        this.lifetime.signal.throwIfAborted();
        const connection = { pathRules };
        this.sshConnections.add(connection);
        this.notifyExecutionChanged();
        return () => { if (this.sshConnections.delete(connection))
            this.notifyExecutionChanged(); };
    }
    notifyExecutionChanged() {
        try {
            this.auditOwner.ctx.emit('target-protection/execution-changed');
        }
        catch (error) {
            this.auditOwner.ctx.logger.warn('An execution status observer failed.', error);
        }
    }
    /**
     * Read verified SSH coverage retained by this policy owner.
     * @returns Connection counts, including the subset with remote path rules.
     */
    sshCoverage() {
        return { connections: this.sshConnections.size,
            pathProtectedConnections: [...this.sshConnections].filter(connection => connection.pathRules).length };
    }
    recordAudit(subject, result, ruleIds, session) {
        if (this.audit === undefined)
            return;
        if (!this.auditFailed) {
            try {
                const source = session === undefined ? undefined : {
                    sessionId: session.id,
                    ...session.header.parentSession === undefined ? {} : { parentSessionId: session.header.parentSession },
                };
                const entry = this.audit.append(subject, { ...result, ruleIds }, source);
                if (!this.auditScopeClosed())
                    session?.append('target/admission', entry);
                return;
            }
            catch (error) {
                this.auditFailed = true;
                this.ctx.logger.warn('Target audit is unavailable; protected admission has stopped.', error);
                this.notifyExecutionChanged();
            }
        }
        if (result.decision === 'allow')
            throw new TargetProtectionError('unavailable', 'Target audit is unavailable. The operation was stopped.');
    }
    auditSession() {
        if (this.audit === undefined)
            return undefined;
        const scoped = this.auditSessionScope.getStore();
        return scoped === undefined ? this.auditInitiator?.()?.session : scoped.session;
    }
    auditScopeClosed() { return this.auditSessionScope.getStore()?.current?.() === false; }
    /**
     * Read a live initiating Agent for Host callbacks, including Worker message handlers.
     * Explicit audit scopes can suppress inherited identity but cannot establish an Agent.
     * @returns The exact registered Agent, or undefined for Host and audit-only calls.
     * @throws When the inherited Agent or its Session has been withdrawn or replaced.
     */
    currentExecutionAgent() {
        this.lifetime.signal.throwIfAborted();
        const agent = this.auditInitiator?.();
        if (agent === undefined)
            return undefined;
        if (!this.ctx.get('agents')?.list().includes(agent) || this.ctx.get('sessions')?.get(agent.id) !== agent.session) {
            throw new TargetProtectionError('unavailable', 'The initiating Agent is no longer available. The operation was stopped.');
        }
        const scoped = this.auditSessionScope.getStore();
        return scoped === undefined || scoped.session === agent.session ? agent : undefined;
    }
    /**
     * Capture the current audit Session before work enters a background preparation queue.
     * @returns Its ID, or null when audit recording or conversation attribution is absent.
     */
    currentAuditSessionId() {
        this.lifetime.signal.throwIfAborted();
        const session = this.auditSession();
        if (session !== undefined && this.ctx.get('sessions')?.get(session.id) !== session) {
            throw new TargetProtectionError('unavailable', 'The initiating conversation is no longer available. The operation was stopped.');
        }
        return session?.id ?? null;
    }
    /**
     * Bind trusted listener ownership for admission logging, without granting target access.
     * An enabled audit refuses a missing or replaced Session before running the operation.
     * @param sessionId - Owner-established Session identity; undefined clears inherited attribution for Host checks.
     * @returns A request runner retaining the exact Session and checking its membership on each invocation.
     */
    bindAuditSession(sessionId) {
        this.lifetime.signal.throwIfAborted();
        const sessions = this.ctx.get('sessions');
        const session = this.audit === undefined || sessionId === undefined ? undefined : sessions?.get(sessionId);
        if (this.audit !== undefined && sessionId !== undefined && session === undefined) {
            throw new TargetProtectionError('unavailable', 'The audit conversation is no longer available. The operation was stopped.');
        }
        const current = () => session === undefined || this.ctx.get('sessions')?.get(session.id) === session;
        return async (operation) => {
            this.lifetime.signal.throwIfAborted();
            if (!current()) {
                throw new TargetProtectionError('unavailable', 'The audit conversation was replaced or closed. The operation was stopped.');
            }
            const closed = new AbortController();
            const stop = session === undefined ? () => { } : this.auditOwner.ctx.on('session/disposed', (source) => {
                if (source === session)
                    closed.abort(new TargetProtectionError('unavailable', 'The audit conversation was closed.'));
            });
            try {
                const signal = AbortSignal.any([closed.signal, this.lifetime.signal]);
                const running = this.auditSessionScope.run({ session, current }, () => operation(signal));
                this.checking.add(running);
                try {
                    return await running;
                }
                finally {
                    this.checking.delete(running);
                }
            }
            finally {
                stop();
            }
        };
    }
    recordDecision(subject, { revision, decision }, session) {
        if (decision.allowed && this.auditScopeClosed()) {
            this.recordAudit(subject, { revision, decision: 'cancelled', code: 'TARGET_CHECK_CANCELLED' }, decision.ruleIds, session);
            throw new TargetProtectionError('unavailable', 'The initiating conversation closed before admission. The operation was stopped.');
        }
        if (subject.phase === 'preflight' && decision.allowed)
            return;
        this.recordAudit(subject, { revision, decision: decision.allowed ? 'allow' : 'deny', code: decision.allowed ? null : decision.code }, decision.ruleIds, session);
    }
    recordFailure(subject, error, signal, session, resolving = false, ruleIds = []) {
        const timedOut = error instanceof TimeoutReason || (error instanceof Error && error.name === 'TimeoutError');
        const cancelled = !timedOut && (signal?.aborted === true || (error instanceof Error && error.name === 'AbortError'));
        const conflict = error instanceof TargetProtectionError && error.code === 'conflict';
        const code = timedOut ? 'TARGET_CHECK_TIMEOUT' : cancelled ? 'TARGET_CHECK_CANCELLED' : conflict ? 'TARGET_SETTINGS_CHANGED'
            : resolving ? 'TARGET_RESOLUTION_FAILED' : 'TARGET_CHECK_FAILED';
        this.recordAudit(subject, { revision: null, decision: cancelled ? 'cancelled' : 'error', code }, ruleIds, session);
    }
    async audited(subject, signal, check) {
        const session = this.auditSession();
        let value;
        try {
            value = await check();
        }
        catch (error) {
            this.recordFailure(subject, error, signal, session);
            throw error;
        }
        this.recordDecision(subject, value, session);
        return value;
    }
    /**
     * Read audit write availability without loading stored decisions.
     * @returns Off for unconfigured auditing, or the current writer state.
     */
    auditWriteState() {
        if (this.audit === undefined)
            return 'off';
        return this.auditFailed ? 'unavailable' : 'ready';
    }
    /**
     * Read the local protection admission log without exposing raw targets or the fingerprint key.
     * @returns The audit state and up to 100 newest accepted records.
     * @throws When the stored records cannot be read or validated.
     */
    auditHistory() {
        if (this.audit === undefined)
            return { state: 'off', entries: [] };
        try {
            return { state: this.auditWriteState(), entries: this.audit.recent() };
        }
        catch (error) {
            throw new TargetProtectionError('unavailable', 'Recent target audit records could not be read.', { cause: error });
        }
    }
    /**
     * Record a guarded remote file request after its validated result or refusal, retaining its exact audit owner through cleanup.
     * Connection admission must still succeed and persist before I/O; resource IDs must come from verified helper matches.
     * @param identity - Executor-selected SSH destination and requested file identities; only their keyed fingerprint is stored.
     * @param effect - Effect selected by the structured protocol method.
     * @param signal - Request cancellation.
     * @param execute - Guarded executor observing the supplied lifetime and reporting resources matched by its verified helper.
     * @returns The validated result; executor failures retain their original identity and never imply rollback.
     * @throws TARGET_AUDIT_UNCONFIRMED if the executor returned but its final audit acknowledgement failed; verify files before retrying.
     */
    auditRemoteFile(identity, effect, signal, execute) {
        this.lifetime.signal.throwIfAborted();
        signal.throwIfAborted();
        if (this.audit === undefined)
            return execute(signal, () => { });
        const sessionId = this.currentAuditSessionId();
        return this.bindAuditSession(sessionId ?? undefined)(async (lifetime) => {
            const bounded = AbortSignal.any([signal, lifetime]);
            bounded.throwIfAborted();
            if (this.auditFailed)
                throw new TargetAuditError('TARGET_AUDIT_UNAVAILABLE', 'Target audit is unavailable. The file request was not started.');
            const session = this.auditSession(), revision = this.currentSnapshot().revision;
            const subject = { operation: 'file', effect, phase: 'execution', identity: [...identity] };
            const matches = new Set();
            let value;
            try {
                value = await execute(bounded, (ids) => { for (const id of ids)
                    matches.add(id); });
            }
            catch (error) {
                if (isTargetDenial(error))
                    this.recordAudit(subject, { revision, decision: 'deny', code: error.code }, [...matches], session);
                else
                    this.recordFailure(subject, error, bounded, session, false, [...matches]);
                throw error;
            }
            try {
                if (bounded.aborted) {
                    this.recordFailure(subject, bounded.reason, bounded, session, false, [...matches]);
                    throw bounded.reason;
                }
                this.recordDecision(subject, { revision, decision: { allowed: true, ruleIds: [...matches] } }, session);
            }
            catch (error) {
                throw new TargetAuditError('TARGET_AUDIT_UNCONFIRMED', 'The remote file request finished, but its audit acknowledgement is unavailable. Verify the remote files before retrying; do not assume rollback.', { cause: error });
            }
            return value;
        });
    }
    /**
     * Admit only executions whose effects are bounded by a structured adapter. Arbitrary code cannot establish a target set.
     * @returns Denial while any production or mainland rule is active; otherwise permission.
     * @throws When initialization, durable settings or the service lifetime is unavailable.
     */
    checkUnconfined() {
        const session = this.auditSession();
        const subject = { operation: 'unconfined', effect: 'unconfined', phase: 'execution' };
        let result;
        try {
            result = this.unconfinedDecision();
        }
        catch (error) {
            this.recordFailure(subject, error, undefined, session);
            throw error;
        }
        this.recordDecision(subject, result, session);
        return result.decision;
    }
    unconfinedDecision() {
        this.generation.signal.throwIfAborted();
        const { revision, preferences } = this.currentSnapshot();
        const rules = preferences.rules.filter(rule => rule.enabled && rule.environment === 'production');
        const ownerResources = this.config.path !== ':memory:' || this.config.auditPath !== '' || this.config.ownerPaths.length > 0
            || this.config.readOnlyPaths.length > 0 || this.config.hostsFile !== '' || this.ctx.get('targetCountryData') !== undefined;
        if (preferences.mainlandEnabled || rules.length > 0 || ownerResources) {
            return { revision, decision: { allowed: false, code: 'TARGET_EXECUTION_UNCONFINED', ruleIds: rules.map(rule => rule.id) } };
        }
        return { revision, decision: { allowed: true, ruleIds: [] } };
    }
    /**
     * Check a host-local operation against current path rules and protected owner files.
     * @param path - Absolute path supplied by the local executing provider.
     * @param operation - Actual operation implemented by that provider.
     * @param signal - Operation lifetime, including policy-change cancellation.
     * @returns The checked canonical path, current revision and decision; unavailable identity rejects.
     */
    checkLocalFile(path, operation, signal) {
        this.lifetime.signal.throwIfAborted();
        const checking = this.audited({ operation: 'file', effect: operation, phase: 'execution', identity: ['file', path] }, signal, () => this.checkFile(path, operation, signal));
        this.checking.add(checking);
        return checking.finally(() => { this.checking.delete(checking); });
    }
    async checkFile(path, operation, signal) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const timeout = __addDisposableResource(env_1, deadline(AbortSignal.any([signal, this.executionSignal()]), this.config.checkTimeoutMs, 'TARGET_FILE_TIMEOUT'), false);
            const store = await this.ready;
            const owner = [...this.config.ownerPaths, ...this.registryPaths()];
            const sources = [...this.config.readOnlyPaths, ...this.config.hostsFile === '' ? [] : [this.config.hostsFile],
                ...this.ctx.get('targetCountryData')?.sourcePaths() ?? []];
            for (let attempt = 0; attempt < this.config.maxRechecks; attempt++) {
                const snapshot = store.snapshot();
                const target = await resolveLocalPathIdentity(path, timeout.signal);
                for (const source of [...owner, ...operation === 'mutate' ? sources : []]) {
                    const resource = await resolveLocalPathIdentity(source, timeout.signal);
                    const sameFile = target.fileId !== undefined && target.fileId === resource.fileId;
                    const overlap = localIdentityPaths(resource).some(root => localIdentityPaths(target).some(candidate => localPathContains(root, candidate) || ((operation === 'mutate' || operation === 'list' || operation === 'watch') && localPathContains(candidate, root))));
                    if (sameFile || overlap)
                        return { path: target.canonical, revision: snapshot.revision,
                            decision: { allowed: false, code: 'TARGET_OWNER_RESOURCE', ruleIds: [] } };
                }
                const rules = [];
                for (const rule of expandTargetRules(snapshot.preferences).filter(rule => rule.enabled && rule.match === 'path')) {
                    const identity = await resolveLocalPathIdentity(rule.address, timeout.signal);
                    rules.push({ rule, identity });
                    if (rule.kind === 'database') {
                        for (const address of localDatabaseCompanionPaths(identity)) {
                            rules.push({ rule: { ...rule, address }, identity: await resolveLocalPathIdentity(address, timeout.signal) });
                        }
                    }
                }
                timeout.signal.throwIfAborted();
                if (store.snapshot().revision !== snapshot.revision)
                    continue;
                return { path: target.canonical, revision: snapshot.revision, decision: decideLocalTarget(target, operation, rules) };
            }
            throw new TargetProtectionError('conflict', 'Target settings kept changing during file validation.');
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    /**
     * Read current committed settings; shutdown never supplies empty defaults.
     * @returns The latest durable revision and rule values.
     */
    async snapshot() {
        this.lifetime.signal.throwIfAborted();
        const store = await this.ready;
        this.lifetime.signal.throwIfAborted();
        return store.snapshot();
    }
    /**
     * Read the active registry for synchronous runtime status consumers.
     * @returns The committed preferences and revision; unavailable before readiness or after withdrawal.
     */
    currentSnapshot() {
        this.lifetime.signal.throwIfAborted();
        if (this.opened === undefined)
            throw new TargetProtectionError('unavailable', 'Target protection is not ready.');
        return this.opened.snapshot();
    }
    /**
     * Read the file restrictions a native executor must expand before launch.
     * @returns One committed rule revision and immutable owner/production paths, without runtime grants.
     */
    async nativeFileConstraints() {
        const snapshot = await this.snapshot();
        const owner = [...this.config.ownerPaths, ...this.registryPaths()];
        const sources = [...this.config.readOnlyPaths, ...this.config.hostsFile === '' ? [] : [this.config.hostsFile],
            ...this.ctx.get('targetCountryData')?.sourcePaths() ?? []];
        return { revision: snapshot.revision, entries: [
                ...owner.map(path => ({ path, access: 'deny' })),
                ...sources.map(path => ({ path, access: 'read-only' })),
                ...expandTargetRules(snapshot.preferences).filter(rule => rule.enabled && rule.environment === 'production' && rule.match === 'path')
                    .map(rule => ({ path: rule.address, access: rule.protection === 'full' ? 'deny' : 'read-only',
                    database: rule.kind === 'database' })),
            ] };
    }
    /**
     * Save owner-selected preferences after a revision check.
     * @param preferences - Complete normalized rules.
     * @param expectedRevision - The caller's previously read revision.
     * @param signal - Optional cancellation checked before any durable commit.
     * @returns Committed successor settings.
     */
    async configure(preferences, expectedRevision, signal) {
        const value = parseTargetPreferences(preferences);
        const operation = this.updates.then(async () => {
            const saved = await this.savePreferences(value, expectedRevision, signal);
            try {
                this.ctx.emit('target-protection/changed');
            }
            catch (error) {
                this.ctx.logger.warn('A target protection observer failed after the rules were saved.', error);
            }
            return saved;
        });
        this.updates = operation.then(() => { }, () => { });
        return operation;
    }
    async savePreferences(preferences, expectedRevision, signal) {
        this.lifetime.signal.throwIfAborted();
        const store = await this.ready;
        this.lifetime.signal.throwIfAborted();
        signal?.throwIfAborted();
        if (store.snapshot().revision !== expectedRevision)
            throw new TargetProtectionError('conflict', 'Target settings changed; reload before saving.');
        if (this.nativeExecutions.size === 0) {
            const saved = store.configure(preferences, expectedRevision);
            this.invalidate();
            return saved;
        }
        this.nativeTransition = 'owner';
        this.generation.abort(new TargetProtectionError('conflict', 'Target policy is changing; native execution is stopping.'));
        const executions = [...this.nativeExecutions];
        try {
            await Promise.all(executions.map(execution => execution.stop()));
            await Promise.all(executions.map(execution => execution.finished));
            this.lifetime.signal.throwIfAborted();
            signal?.throwIfAborted();
            return store.configure(preferences, expectedRevision);
        }
        catch (error) {
            if (this.nativeExecutions.size > 0)
                this.nativeTransition = 'failed';
            throw error;
        }
        finally {
            if (this.nativeExecutions.size === 0) {
                this.nativeTransition = undefined;
                this.generation = new AbortController();
            }
        }
    }
    invalidate() {
        this.generation.abort(new TargetProtectionError('conflict', 'Target policy changed during the operation.'));
        if (this.nativeExecutions.size === 0) {
            if (this.nativeTransition !== 'owner') {
                this.nativeTransition = undefined;
                this.generation = new AbortController();
            }
        }
        else if (this.nativeTransition !== 'owner' && this.nativeTransition !== 'failed')
            this.nativeTransition = 'source';
    }
    /**
     * Capture cancellation for one operation using the current policy and country-data generation.
     * @returns A signal aborted on local configuration change, country-source replacement or shutdown.
     */
    executionSignal() {
        this.lifetime.signal.throwIfAborted();
        return AbortSignal.any([this.lifetime.signal, this.generation.signal]);
    }
    /**
     * Retain rule resources for an executing adapter until its native I/O and cleanup have settled.
     * @returns An idempotent release function; obtain it before starting I/O and release it in finally.
     * @throws When protection is closing and cannot admit another operation.
     */
    retainExecution() {
        this.lifetime.signal.throwIfAborted();
        const settled = Promise.withResolvers();
        this.checking.add(settled.promise);
        return () => { settled.resolve(true); this.checking.delete(settled.promise); };
    }
    /**
     * Retain the checked revision and prevent policy writers during a final executor commit.
     * @param revision - Revision returned by completed target checks.
     * @returns Idempotent release, required after native execution and cleanup settle.
     */
    retainSnapshot(revision) {
        const release = this.retainExecution();
        let unlock;
        try {
            if (this.opened === undefined)
                throw new TargetProtectionError('unavailable', 'Target protection is not ready.');
            unlock = this.opened.retainSnapshot(revision);
        }
        catch (error) {
            release();
            throw error;
        }
        return () => { try {
            unlock();
        }
        finally {
            release();
        } };
    }
    /**
     * Retain a native command's immutable policy until its entire process range and transport have closed.
     * @param revision - Revision used to construct the command's native policy.
     * @param stop - Idempotent cancellation; rejection without a physical-closure acknowledgement disables new admission.
     * @returns Idempotent release. Call only after physical shutdown is confirmed, including startup failure cleanup.
     */
    retainNativeExecution(revision, stop) {
        if (this.nativeTransition === 'failed')
            throw new TargetProtectionError('unavailable', 'Native shutdown could not be confirmed; new execution is disabled.');
        if (this.nativeTransition !== undefined)
            throw new TargetProtectionError('busy', 'Native execution is stopping for a policy change.');
        const signal = this.executionSignal();
        signal.throwIfAborted();
        const release = this.retainSnapshot(revision), finished = Promise.withResolvers();
        let stopping, released = false;
        const execution = { stop: () => stopping ??= Promise.resolve().then(stop).catch((error) => {
                stopping = undefined;
                throw error;
            }), finished: finished.promise };
        const revoked = () => {
            void execution.stop().catch((_error) => {
                if (this.nativeExecutions.has(execution)) {
                    this.nativeTransition = 'failed';
                    this.ctx.logger.error('Native shutdown could not be confirmed. Protected resources remain retained; verify or stop the tasks before retrying.');
                }
                else
                    this.ctx.logger.error('The native execution scope closed, but its cleanup callback failed.');
            });
        };
        this.nativeExecutions.add(execution);
        signal.addEventListener('abort', revoked, { once: true });
        return () => {
            if (released)
                return;
            released = true;
            signal.removeEventListener('abort', revoked);
            try {
                release();
            }
            finally {
                this.nativeExecutions.delete(execution);
                finished.resolve(true);
                if (this.nativeExecutions.size === 0 && (this.nativeTransition === 'source' || this.nativeTransition === 'failed')) {
                    this.nativeTransition = undefined;
                    this.generation = new AbortController();
                }
            }
        };
    }
    /**
     * Check the actual HTTP destination. Ordinary GET is treated as an unverified effect.
     * @param destination - Authority and pinned-address facts from the HTTP transport.
     * @param signal - Request cancellation and deadline.
     * @param resolution - Name evidence produced by the actual address-pinning resolver, when available.
     * @returns Stable rule decision; unavailable stores reject rather than granting permission.
     */
    checkHttp(destination, signal, resolution) {
        this.lifetime.signal.throwIfAborted();
        const phase = destination.phase === 'before-resolution' ? 'preflight' : 'execution';
        const subject = { operation: destination.route === 'proxy' ? 'proxy-http' : 'http', phase, effect: 'unknown',
            identity: ['network', destination.hostname, destination.port],
            ...destination.phase === 'before-connect' && destination.addresses !== null
                ? { peers: destination.addresses.map(address => address.address) } : {} };
        const operation = this.audited(subject, signal, () => this.check(destination, signal, resolution)).then(result => result.decision);
        this.checking.add(operation);
        return operation.finally(() => { this.checking.delete(operation); });
    }
    /**
     * Resolve names and addresses together, retaining the shared public-address and NAT64 protections.
     * @param hostname - URL hostname to resolve.
     * @param signal - Request cancellation and deadline.
     * @returns Bound DNS evidence and the exact validated address set for connection pinning.
     */
    resolveHttpTarget(hostname, signal) {
        this.lifetime.signal.throwIfAborted();
        const session = this.auditSession();
        const operation = this.resolveTarget(hostname, signal).catch((error) => {
            this.recordFailure({ operation: 'http-dns', effect: 'unknown', phase: 'preflight', identity: ['dns', hostname] }, error, signal, session, true);
            throw error;
        });
        this.checking.add(operation);
        return operation.finally(() => { this.checking.delete(operation); });
    }
    /**
     * Resolve an owner-configured endpoint in the current client's network, without relaxing anonymous HTTP SSRF checks.
     * @param hostname - Explicit deployment target; never an arbitrary fetch URL.
     * @param signal - Connection cancellation and deadline.
     * @returns Names and literal addresses that the connection consumer must authorize and pin.
     */
    resolveConnectionTarget(hostname, signal) {
        this.lifetime.signal.throwIfAborted();
        const session = this.auditSession();
        const operation = this.resolveConnection(hostname, signal).catch((error) => {
            this.recordFailure({ operation: 'connection-dns', effect: 'unknown', phase: 'preflight', identity: ['dns', hostname] }, error, signal, session, true);
            throw error;
        });
        this.checking.add(operation);
        return operation.finally(() => { this.checking.delete(operation); });
    }
    async resolveConnection(hostname, signal) {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const timeout = __addDisposableResource(env_2, deadline(AbortSignal.any([signal, this.executionSignal()]), this.config.checkTimeoutMs, 'TARGET_DNS_TIMEOUT'), false);
            const resolution = await resolveTargetDns(hostname, this.dnsOptions(), timeout.signal);
            const addresses = await resolveConnectionAddresses(hostname, timeout.signal, async (name) => {
                const value = canonicalTargetHost(name) === resolution.hostname ? resolution
                    : await resolveTargetDns(name, this.dnsOptions(), timeout.signal);
                return [...value.addresses];
            });
            timeout.signal.throwIfAborted();
            return { ...resolution, addresses };
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    }
    /**
     * Check a pinned connection or an operation on its authenticated peer.
     * @param hostname - Original configured host.
     * @param port - Known service port; omission requires decisions without a verified port scope.
     * @param resolution - Actual pinned address evidence; omission performs only pre-resolution checks.
     * @param scope - Whether effects stay on one port, use a native database protocol, or may access the peer filesystem.
     * @param effect - Effect guaranteed by the protocol executor, not supplied by the model.
     * @param signal - Operation cancellation and deadline.
     * @param database - Executor-selected protocol database, verified before application queries; omission leaves database scope unknown.
     * @param foldDatabaseCase - Treat database names that differ only in case as possible aliases.
     * @param databaseResources - Associations for database scope; path-only production resources without a known endpoint remain unverified.
     * @returns A current rule decision; unavailable identity and registry failures never authorize fallback.
     * @throws TARGET_IDENTITY_UNVERIFIED when an associated resource is missing or is a domain resource.
     */
    checkConnection(hostname, port, resolution, scope, effect, signal, database, foldDatabaseCase = false, databaseResources) {
        if (scope !== 'database' && databaseResources !== undefined) {
            throw new TargetProtectionError('invalid', 'Database resource associations require database scope.');
        }
        return this.auditConnection(hostname, port, resolution, scope, effect, signal, database, foldDatabaseCase, scope === 'database' ? { databases: databaseResources ?? [] } : undefined);
    }
    /**
     * Bind central path resources to one verified SSH executor without changing ordinary connection admission.
     * @param binding - Destination and mapped resource IDs selected by the owner; retain its revision before calling.
     * @returns A prepared policy. Call activate only after the digest-verified helper acknowledges its exact path rules.
     * @throws When a resource is not an active production path, the revision changed or an owner is unavailable.
     */
    bindRemoteFilesystem(binding) {
        const snapshot = this.currentSnapshot();
        const required = new Set(expandTargetRules(snapshot.preferences)
            .filter(rule => rule.enabled && rule.environment === 'production' && rule.match === 'path').map(rule => rule.id));
        const ids = new Set(binding.ruleIds);
        const invalid = () => new HarnessError('Remote filesystem identity is unavailable. Verify its rule IDs, SSH destination and installed helper rules.', 'TARGET_IDENTITY_UNVERIFIED');
        if (snapshot.revision !== binding.revision || binding.resolution.hostname !== canonicalTargetHost(binding.hostname)
            || binding.resolution.addresses.length === 0 || [...ids].some(id => !required.has(id)))
            throw invalid();
        const revision = binding.revision, hostname = binding.hostname, port = binding.port, lifetime = binding.signal;
        const resolution = { ...binding.resolution, names: [...binding.resolution.names],
            addresses: binding.resolution.addresses.map(address => ({ ...address })) };
        const alive = () => {
            lifetime.throwIfAborted();
            if (this.currentSnapshot().revision !== revision)
                throw invalid();
        };
        alive();
        let active = false;
        const check = async (effect, signal) => {
            alive();
            return this.auditConnection(hostname, port, resolution, 'filesystem', effect, AbortSignal.any([signal, lifetime]), undefined, false, { files: { revision, ids } });
        };
        return {
            activate: () => { alive(); active = true; },
            checkHelper: signal => check('observe', signal),
            checkFile: (effect, signal) => {
                if (!active)
                    return Promise.reject(invalid());
                return check(effect, signal);
            },
        };
    }
    auditConnection(hostname, port, resolution, scope, effect, signal, database, foldDatabaseCase = false, resources) {
        this.lifetime.signal.throwIfAborted();
        const subject = { operation: 'connection', effect, phase: resolution === undefined ? 'preflight' : 'execution',
            identity: ['network', hostname, port, database],
            ...resolution === undefined ? {} : { peers: resolution.addresses.map(address => address.address) } };
        const operation = this.audited(subject, signal, () => this.connectionDecision(hostname, port, resolution, scope, effect, signal, database, foldDatabaseCase, resources)).then(result => result.decision);
        this.checking.add(operation);
        return operation.finally(() => { this.checking.delete(operation); });
    }
    async connectionDecision(hostname, port, resolution, scope, effect, signal, database, foldDatabaseCase, resources) {
        const name = canonicalTargetHost(hostname);
        if (resolution !== undefined && resolution.hostname !== name) {
            return { revision: null, decision: { allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: [] } };
        }
        const target = {
            names: resolution?.names ?? [name], ...port === undefined ? {} : { port },
            spansServicePorts: scope === 'filesystem',
            ...database === undefined ? {} : { database, foldDatabaseCase },
            nameResolution: resolution === undefined ? 'unknown' : 'verified', mainland: 'unknown',
            addresses: resolution === undefined ? null : resolution.addresses.flatMap(address => address.translatedIpv4 === undefined ? [address.address] : [address.address, address.translatedIpv4]),
        };
        return await this.decideNetwork(target, effect, resolution === undefined, signal, resources);
    }
    dnsOptions() {
        return { servers: this.config.dnsServers, hostsFile: this.config.hostsFile,
            queryTimeoutMs: this.config.dnsQueryTimeoutMs, maxCnameDepth: this.config.dnsMaxCnameDepth,
            maxRecords: this.config.dnsMaxRecords, maxHostsBytes: this.config.hostsMaxBytes };
    }
    async resolveTarget(hostname, signal) {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const timeout = __addDisposableResource(env_3, deadline(AbortSignal.any([signal, this.executionSignal()]), this.config.checkTimeoutMs, 'TARGET_DNS_TIMEOUT'), false);
            const options = this.dnsOptions();
            const resolution = await resolveTargetDns(hostname, options, timeout.signal);
            const addresses = await resolvePublicAddresses(hostname, timeout.signal, async (name) => {
                const value = canonicalTargetHost(name) === resolution.hostname ? resolution : await resolveTargetDns(name, options, timeout.signal);
                return [...value.addresses];
            });
            timeout.signal.throwIfAborted();
            return { ...resolution, addresses };
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    }
    async check(destination, signal, resolution) {
        signal.throwIfAborted();
        const hostname = canonicalTargetHost(destination.hostname);
        const verified = resolution !== undefined && resolution.hostname === hostname
            && destination.phase === 'before-connect' && destination.addresses !== null
            && resolution.addresses.length === destination.addresses.length
            && resolution.addresses.every((item, index) => {
                const peer = destination.addresses.at(index);
                return peer !== undefined && item.address === peer.address && item.family === peer.family
                    && item.translatedIpv4 === peer.translatedIpv4;
            });
        const target = {
            names: verified ? resolution.names : [hostname], port: destination.port,
            nameResolution: verified ? 'verified' : 'unknown',
            addresses: destination.phase === 'before-connect' && destination.addresses !== null
                ? destination.addresses.flatMap(address => address.translatedIpv4 === undefined
                    ? [address.address] : [address.address, address.translatedIpv4]) : null,
            mainland: 'unknown',
        };
        return this.decideNetwork(target, 'unknown', destination.phase === 'before-resolution', signal);
    }
    async decideNetwork(target, effect, beforeResolution, signal, resources) {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const timeout = __addDisposableResource(env_4, deadline(AbortSignal.any([signal, this.executionSignal()]), this.config.checkTimeoutMs, 'TARGET_CHECK_TIMEOUT'), false);
            const store = await this.ready;
            for (let attempt = 0; attempt < this.config.maxRechecks; attempt++) {
                timeout.signal.throwIfAborted();
                const stored = store.snapshot();
                const snapshot = resources?.databases === undefined ? stored : projectDatabaseResources(stored, resources.databases);
                const checked = (decision) => ({ revision: snapshot.revision, decision });
                if (resources?.databases !== undefined) {
                    const unresolved = snapshot.preferences.rules.filter(rule => rule.enabled && rule.environment === 'production'
                        && rule.match === 'path' && (rule.aliases ?? []).every(alias => alias.match === 'path'));
                    if (unresolved.length > 0) {
                        return checked({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: unresolved.map(rule => rule.id) });
                    }
                }
                if (resources?.files !== undefined && snapshot.revision !== resources.files.revision) {
                    return checked({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: [] });
                }
                if (target.spansServicePorts) {
                    const unresolved = expandTargetRules(snapshot.preferences).filter(rule => rule.enabled && rule.environment === 'production' && rule.match === 'path' && !resources?.files?.ids.has(rule.id));
                    if (unresolved.length > 0) {
                        return checked({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: unresolved.map(rule => rule.id) });
                    }
                }
                const namedMainland = target.names.some(host => ['cn', 'xn--fiqs8s', 'xn--fiqz9s'].some(tld => host === tld || host.endsWith(`.${tld}`)));
                target.mainland = namedMainland ? 'yes' : 'unknown';
                const rules = new TargetRules(snapshot.preferences);
                const early = rules.preflight(target);
                if (early !== undefined)
                    return checked(early);
                if (beforeResolution && effect !== 'observe' && snapshot.preferences.mainlandEnabled && namedMainland
                    && !snapshot.preferences.rules.some(rule => rule.enabled && rule.environment === 'test')) {
                    return checked({ allowed: false, code: 'TARGET_MAINLAND_PROTECTED', ruleIds: [] });
                }
                if (beforeResolution)
                    return checked({ allowed: true, ruleIds: [] });
                const bindings = new Map();
                for (const rule of rules.namedHosts(target)) {
                    timeout.signal.throwIfAborted();
                    if (bindings.has(rule.address))
                        continue;
                    if (target.names.includes(rule.address) && target.addresses !== null) {
                        bindings.set(rule.address, target.addresses);
                        continue;
                    }
                    try {
                        const binding = await resolveTargetDns(rule.address, this.dnsOptions(), timeout.signal);
                        bindings.set(rule.address, binding.addresses.length > 0 && binding.addresses.every(item => isIP(item.address))
                            ? binding.addresses.map(item => canonicalTargetHost(item.address)) : null);
                    }
                    catch (error) {
                        timeout.signal.throwIfAborted();
                        if (!(typeof error === 'object' && error !== null && 'code' in error))
                            throw error;
                        bindings.set(rule.address, null);
                    }
                }
                timeout.signal.throwIfAborted();
                if (store.snapshot().revision !== snapshot.revision)
                    continue;
                if (!namedMainland && target.addresses !== null)
                    target.mainland = this.ctx.get('targetCountryData')?.mainland(target.addresses) ?? 'unknown';
                return checked(rules.decide([target], effect, bindings));
            }
            throw new TargetProtectionError('conflict', 'Target settings kept changing during validation; retry after changes settle.');
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    }
}
//# sourceMappingURL=index.js.map