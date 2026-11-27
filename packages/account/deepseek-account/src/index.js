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
/** DeepSeek account service; browser approval never bypasses local cancellation. */
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { arch, platform, release } from 'node:os';
import { promises as streamPromises } from 'node:stream';
import { Service } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import Schema from '@deepseek-ai/schemastery';
import { z } from 'zod';
import { mergePlatformCookies, platformClientHeaders, platformWireLocale } from "./client-metadata.js";
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { profile, readAccountDetail } from "./details.js";
import { readNotificationContent, readNotifications, sendNotificationEvent } from "./notifications.js";
import { revokeAccount } from "./logout.js";
import { ACCOUNT_TOKEN_HEADER, AccountUnauthorizedError, PlatformAuthError, platformHeaders, platformOrigin, browserUrl, requestPlatform, initialization, exchange, loginOrigin } from "./protocol.js";
const KEY = credentialKey('deepseek-account-platform', 'default');
const DEVICE = credentialKey('deepseek-account-platform', 'device');
const grant = z.object({ version: z.literal(1), token: z.string().min(1), issuer: z.url() });
const device = z.object({ id: z.uuid() });
/** Validated deployment choices. */
const Config = Schema.object({
    platformOrigin: Schema.string().default('https://platform.deepseek.com'),
    harnessOrigin: Schema.string().default('https://harness.deepseek.com'),
    desktopPlatform: Schema.union([Schema.const('darwin'), Schema.const('win32'), Schema.const(null)]).default(null),
    embeddedPageDist: Schema.string().default(''),
    inferenceOrigin: Schema.string().default('https://api.deepseek.com'),
    allowLoopbackHttp: Schema.boolean().default(false),
    rewriteBrowserOrigin: Schema.boolean().default(false),
    requestHeaders: Schema.dict(Schema.string().role('secret')).default({}),
    accountRequestHeaders: Schema.dict(Schema.string().role('secret')).default({}),
    requestTimeoutMs: Schema.number().min(1).max(120_000).default(30_000),
    balanceTimeoutMs: Schema.number().min(1).max(120_000).default(30_000),
    logoutMaxRetries: Schema.number().min(0).max(5).step(1).default(5),
    logoutRetryDelayMs: Schema.number().min(1).max(60_000).default(1_000),
    attemptTimeoutMs: Schema.number().min(1).max(3_600_000).default(600_000),
});
/** Account login, credentials, and client-safe Remote operations. */
let DeepSeekAccount = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _getState_decorators;
    let _getProfile_decorators;
    let _getBalance_decorators;
    let _getNotifications_decorators;
    let _getNotificationContent_decorators;
    let _reportNotificationEvent_decorators;
    let _startSignIn_decorators;
    let _cancelSignIn_decorators;
    let _signOut_decorators;
    let _hasRunningAccountTasks_decorators;
    let _watchExpiry_decorators;
    let _watchState_decorators;
    return class DeepSeekAccount extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _getState_decorators = [Remote];
            _getProfile_decorators = [Remote];
            _getBalance_decorators = [Remote];
            _getNotifications_decorators = [Remote];
            _getNotificationContent_decorators = [Remote];
            _reportNotificationEvent_decorators = [Remote];
            _startSignIn_decorators = [Remote];
            _cancelSignIn_decorators = [Remote];
            _signOut_decorators = [Remote];
            _hasRunningAccountTasks_decorators = [Remote];
            _watchExpiry_decorators = [Remote({ mode: 'stream' })];
            _watchState_decorators = [Remote({ name: 'watch', mode: 'stream' })];
            __esDecorate(this, null, _getState_decorators, { kind: "method", name: "getState", static: false, private: false, access: { has: obj => "getState" in obj, get: obj => obj.getState }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getProfile_decorators, { kind: "method", name: "getProfile", static: false, private: false, access: { has: obj => "getProfile" in obj, get: obj => obj.getProfile }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getBalance_decorators, { kind: "method", name: "getBalance", static: false, private: false, access: { has: obj => "getBalance" in obj, get: obj => obj.getBalance }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getNotifications_decorators, { kind: "method", name: "getNotifications", static: false, private: false, access: { has: obj => "getNotifications" in obj, get: obj => obj.getNotifications }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getNotificationContent_decorators, { kind: "method", name: "getNotificationContent", static: false, private: false, access: { has: obj => "getNotificationContent" in obj, get: obj => obj.getNotificationContent }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _reportNotificationEvent_decorators, { kind: "method", name: "reportNotificationEvent", static: false, private: false, access: { has: obj => "reportNotificationEvent" in obj, get: obj => obj.reportNotificationEvent }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _startSignIn_decorators, { kind: "method", name: "startSignIn", static: false, private: false, access: { has: obj => "startSignIn" in obj, get: obj => obj.startSignIn }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelSignIn_decorators, { kind: "method", name: "cancelSignIn", static: false, private: false, access: { has: obj => "cancelSignIn" in obj, get: obj => obj.cancelSignIn }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _signOut_decorators, { kind: "method", name: "signOut", static: false, private: false, access: { has: obj => "signOut" in obj, get: obj => obj.signOut }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _hasRunningAccountTasks_decorators, { kind: "method", name: "hasRunningAccountTasks", static: false, private: false, access: { has: obj => "hasRunningAccountTasks" in obj, get: obj => obj.hasRunningAccountTasks }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _watchExpiry_decorators, { kind: "method", name: "watchExpiry", static: false, private: false, access: { has: obj => "watchExpiry" in obj, get: obj => obj.watchExpiry }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _watchState_decorators, { kind: "method", name: "watchState", static: false, private: false, access: { has: obj => "watchState" in obj, get: obj => obj.watchState }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['credentials', 'authorization'];
        static Config = Config;
        origin = __runInitializers(this, _instanceExtraInitializers);
        harnessOrigin;
        embeddedPageDist;
        inferenceOrigin;
        rewriteBrowserOrigin;
        platform;
        requestHeaders;
        accountRequestHeaders;
        requestTimeout;
        balanceTimeout;
        attemptTimeout;
        logoutPolicy;
        logoutLifetime = new AbortController();
        revocations = new Set();
        attempt;
        listeners = new Set();
        runningTaskReports = new Set();
        /**
         * Latest ready profile read and the grant token it was read with. Binding the token keeps a
         * cached identity from answering for a credential that has since changed.
         */
        lastProfile;
        detailsLifetime = new AbortController();
        /** Aborted at the next sign-out; request credentials of the current sign-in carry its signal. */
        signedOut = new AbortController();
        closed = false;
        removing;
        /** @param ctx - Host with authorization and credentials services. @param config - deployment options. */
        constructor(ctx, config = {}) {
            super(ctx, 'deepseekAccount', { namespace: 'account' });
            const resolved = Config(config);
            this.embeddedPageDist = resolved.embeddedPageDist;
            this.origin = platformOrigin(resolved.platformOrigin, resolved.allowLoopbackHttp, 'platformOrigin');
            this.harnessOrigin = platformOrigin(resolved.harnessOrigin, resolved.allowLoopbackHttp, 'harnessOrigin');
            const inference = new URL(resolved.inferenceOrigin);
            if (!['http:', 'https:'].includes(inference.protocol) || inference.username || inference.password
                || inference.pathname !== '/' || inference.search || inference.hash) {
                throw new Error('account: inferenceOrigin must be an HTTP(S) origin without credentials, path, query or fragment');
            }
            this.inferenceOrigin = inference.origin;
            this.rewriteBrowserOrigin = resolved.rewriteBrowserOrigin;
            this.platform = resolved.desktopPlatform;
            this.requestHeaders = platformHeaders(resolved.requestHeaders);
            const accountHeaders = platformHeaders(resolved.accountRequestHeaders);
            this.accountRequestHeaders = { ...this.requestHeaders, ...accountHeaders };
            if (accountHeaders.cookie !== undefined) {
                this.accountRequestHeaders.cookie = mergePlatformCookies(this.requestHeaders.cookie ?? '', accountHeaders.cookie);
            }
            this.requestTimeout = resolved.requestTimeoutMs;
            this.balanceTimeout = resolved.balanceTimeoutMs;
            this.attemptTimeout = resolved.attemptTimeoutMs;
            this.logoutPolicy = {
                maxRetries: resolved.logoutMaxRetries, delayMs: resolved.logoutRetryDelayMs, requestTimeoutMs: this.requestTimeout,
            };
            ctx.authorization.registerFlow({
                key: KEY, label: 'DeepSeek', methods: [{ id: 'browser', label: 'DeepSeek' }],
                run: (session) => {
                    const attempt = this.attempt;
                    if (attempt === undefined)
                        return Promise.reject(new PlatformAuthError('protocol'));
                    attempt.running = this.run(session, attempt);
                    return attempt.running;
                },
            });
            ctx.on('credentials/record-updated', (key) => {
                if (key !== KEY)
                    return;
                this.invalidateDetails();
                this.changed('credentials-changed');
            });
            ctx.effect(() => async () => {
                this.closed = true;
                this.logoutLifetime.abort();
                this.invalidateDetails();
                const active = this.attempt;
                if (active !== undefined) {
                    if (active.view.phase !== 'committing')
                        active.controller.abort();
                    await active.done;
                }
                await this.removing;
                await Promise.all(this.revocations);
                this.changed('snapshot');
            }, 'account: active attempt lifetime');
        }
        async [Service.init]() {
            const record = await this.ctx.credentials.readRecord(KEY);
            if (record === undefined)
                return;
            if (record.kind !== 'grant')
                throw new PlatformAuthError('storage');
            const parsed = grant.safeParse(record.payload);
            if (!parsed.success)
                throw new PlatformAuthError('storage');
            if (parsed.data.issuer === this.origin)
                return;
            await this.ctx.credentials.deleteRecord(KEY);
        }
        /**
         * Read stored-account presence and the latest login attempt.
         * @returns a snapshot without credentials or PKCE secrets.
         */
        async getState() {
            const record = await this.ctx.credentials.readRecord(KEY);
            if (record !== undefined && (record.kind !== 'grant' || !grant.safeParse(record.payload).success)) {
                throw new PlatformAuthError('storage');
            }
            const attempt = this.attempt?.view ?? null;
            return {
                status: record === undefined ? 'signed-out' : 'credential-stored',
                // Credential removal can notify watchers before sign-out finishes clearing the attempt.
                attempt: record === undefined && attempt?.phase === 'succeeded' ? null : attempt,
                links: { usageUrl: new URL('/usage', this.origin).href, topUpUrl: new URL('/top_up', this.origin).href },
            };
        }
        /**
         * Query Platform profile independently of wallet balances.
         * A ready result whose stable profile ID first becomes available or changes notifies identity-enabled watch
         * consumers, so they re-read getPlatformSession; repeated IDs stay silent.
         * @param client - identity of the requesting UI for this call.
         * @returns profile outcome, or null if signed out or the grant changed during the query.
         */
        async getProfile(client) {
            const lifetime = this.detailsLifetime;
            const stored = await this.readCurrentGrant(lifetime);
            if (stored === null || lifetime.signal.aborted)
                return null;
            const result = await this.getDetail('profile', this.detailHeaders(client), { lifetime, stored });
            if (this.detailsLifetime !== lifetime)
                return null;
            if (result !== null)
                this.cacheProfile(stored.token, result);
            if (result?.status !== 'failed')
                return result;
            // Only this same grant's last ready read may stand in for a failed refresh.
            const cached = this.lastProfile?.token === stored.token ? this.lastProfile.profile : undefined;
            return cached ?? result;
        }
        /**
         * Query Platform recharge and bonus wallet balances independently of profile data.
         * @param client - identity of the requesting UI for this call.
         * @returns balance outcome, or null if signed out or the grant changed during the query.
         */
        getBalance(client) {
            return this.getDetail('balance', this.detailHeaders(client));
        }
        /**
         * Query unconsumed account notifications in server order without reading profile data.
         * @param client - identity of the requesting UI for this call; its language selects the server-authored message.
         * @returns notifications with their next query delay, or null if signed out or the grant changed during the query.
         */
        async getNotifications(client) {
            const lifetime = this.detailsLifetime;
            const headers = this.detailHeaders(client);
            const stored = await this.readCurrentGrant(lifetime);
            if (stored === null)
                return null;
            try {
                const batch = await readNotifications(this.harnessOrigin, stored.token, AbortSignal.any([lifetime.signal, AbortSignal.timeout(this.requestTimeout)]), headers);
                return this.detailsLifetime === lifetime ? batch : null;
            }
            catch (error) {
                if (this.detailsLifetime !== lifetime)
                    return null;
                if (error instanceof AccountUnauthorizedError) {
                    await this.expireCredential(stored.token, lifetime);
                    return null;
                }
                throw error;
            }
        }
        /**
         * Query localized content of a notification, including one already consumed.
         * @param id - notification whose content is requested.
         * @param client - identity of the requesting UI; its language selects the localized content.
         * @returns content without changing consumption, or null if signed out or the grant changed.
         */
        async getNotificationContent(id, client) {
            const lifetime = this.detailsLifetime;
            const headers = this.detailHeaders(client);
            const stored = await this.readCurrentGrant(lifetime);
            if (stored === null)
                return null;
            try {
                const content = await readNotificationContent(this.harnessOrigin, stored.token, id, AbortSignal.any([lifetime.signal, AbortSignal.timeout(this.requestTimeout)]), headers);
                return this.detailsLifetime === lifetime ? content : null;
            }
            catch (error) {
                if (this.detailsLifetime !== lifetime)
                    return null;
                if (error instanceof AccountUnauthorizedError) {
                    await this.expireCredential(stored.token, lifetime);
                    return null;
                }
                throw error;
            }
        }
        /**
         * Report a notification interaction; the backend decides consumption.
         * @param id - notification the user interacted with.
         * @param event - displayed frame, non-dismiss action click, or explicit dismissal.
         * @param client - identity of the requesting UI for this call.
         * @returns true once the server accepts the event; false if signed out or credentials changed during the call.
         */
        async reportNotificationEvent(id, event, client) {
            const lifetime = this.detailsLifetime;
            const headers = this.detailHeaders(client);
            const stored = await this.readCurrentGrant(lifetime);
            if (stored === null)
                return false;
            try {
                await sendNotificationEvent(this.harnessOrigin, stored.token, id, event, AbortSignal.any([lifetime.signal, AbortSignal.timeout(this.requestTimeout)]), headers);
                return this.detailsLifetime === lifetime;
            }
            catch (error) {
                if (this.detailsLifetime !== lifetime)
                    return false;
                if (error instanceof AccountUnauthorizedError) {
                    await this.expireCredential(stored.token, lifetime);
                    return false;
                }
                throw error;
            }
        }
        /**
         * Cache one ready profile against the grant token it was read with, so identity reuse cannot cross
         * a credential change. A stable ID that first appears or changes notifies identity-enabled watch consumers, so
         * identity consumers re-read getPlatformSession; repeated IDs stay silent.
         * @param token - grant the profile was read with.
         * @param profile - profile outcome to record when it carries account data.
         */
        cacheProfile(token, profile) {
            if (profile.status !== 'ready')
                return;
            // Identity publishers re-read the session snapshot; wake them only when the stable ID changes.
            const previous = this.lastProfile?.profile.value.id || null;
            this.lastProfile = { token, profile };
            if (previous !== (profile.value.id || null))
                this.changed('identity');
        }
        async getDetail(field, headers, captured) {
            const lifetime = captured?.lifetime ?? this.detailsLifetime;
            const stored = captured?.stored ?? await this.readCurrentGrant(lifetime);
            if (stored === null || lifetime.signal.aborted)
                return null;
            if (field === 'profile' && this.attempt?.initialProfile?.token === stored.token) {
                const initial = this.attempt.initialProfile.value;
                delete this.attempt.initialProfile;
                return initial;
            }
            try {
                const details = await readAccountDetail(field, this.origin, stored.token, AbortSignal.any([lifetime.signal, AbortSignal.timeout(field === 'balance' ? this.balanceTimeout : this.requestTimeout)]), headers);
                return this.detailsLifetime !== lifetime ? null : details;
            }
            catch (_unauthorized) {
                // readAccountDetail exposes only authenticated credential rejection failures.
                if (this.detailsLifetime === lifetime)
                    await this.expireCredential(stored.token, lifetime);
                return null;
            }
        }
        /** Deployment account headers plus the client identity headers derived from one call's metadata. */
        detailHeaders(client) {
            return { ...this.accountRequestHeaders, ...platformClientHeaders(this.platform, client) };
        }
        /**
         * Remove an inference-rejected token only while it still matches the stored login.
         * @param token - token captured by the rejected inference request.
         * @returns after matching credentials are removed and the expiry notification is emitted.
         */
        async rejectToken(token) {
            const lifetime = this.detailsLifetime;
            const stored = await this.readCurrentGrant(lifetime);
            if (stored?.token !== token || this.detailsLifetime !== lifetime)
                return;
            await this.expireCredential(token, lifetime);
        }
        async expireCredential(token, lifetime) {
            this.removing ??= (async () => {
                if (this.attempt !== undefined)
                    await this.cancelSignIn(this.attempt.view.id);
                const record = await this.ctx.credentials.readRecord(KEY);
                if (this.closed || this.detailsLifetime !== lifetime || record?.kind !== 'grant')
                    return this.getState();
                const current = grant.parse(record.payload);
                if (current.token !== token || current.issuer !== this.origin)
                    return this.getState();
                await this.ctx.credentials.deleteRecord(KEY);
                this.ctx.emit('deepseek-account/session-expired');
                this.attempt = undefined;
                this.publishSignedOut();
                this.changed('snapshot');
                return this.getState();
            })().finally(() => { this.removing = undefined; });
            await this.removing;
        }
        /**
         * Read existing login identity without creating a device or returning credentials.
         * @returns optional device/account identifiers and the provider's OS version string.
         */
        async getDeviceIdentity() {
            const [record, session] = await Promise.all([
                this.ctx.credentials.readRecord(DEVICE),
                this.getPlatformSession(),
            ]);
            const parsed = record?.kind === 'grant' ? device.safeParse(record.payload) : undefined;
            return {
                ...parsed?.success ? { deviceId: parsed.data.id } : {},
                ...session?.userId == null ? {} : { userId: session.userId },
                osVersion: deviceOsVersion(),
            };
        }
        /**
         * Read credentials for the configured embedded-page origin, bound to their account environment, and
         * pair them with the account ID from the last successful profile read; no profile request is made.
         * @returns a Host-only snapshot, or null while signed out or when the credential changed during the read.
         */
        async getPlatformSession() {
            const lifetime = this.detailsLifetime;
            const stored = await this.readCurrentGrant(lifetime);
            if (stored === null || lifetime.signal.aborted)
                return null;
            // Deployment headers only; the consuming client adds the identity of its own UI.
            const requestHeaders = { ...this.accountRequestHeaders };
            // Identity comes from the profile read for this same grant; an unknown ID requires disposable
            // browser storage. A replaced credential never publishes the account its predecessor named.
            return { origin: this.origin, token: stored.token,
                userId: this.lastProfile?.token === stored.token ? this.lastProfile.profile.value.id || null : null,
                ...(this.embeddedPageDist ? { embeddedPageDist: this.embeddedPageDist } : {}),
                requestHeaders };
        }
        async readCurrentGrant(lifetime) {
            if (this.closed)
                return null;
            const record = await this.ctx.credentials.readRecord(KEY);
            if (record === undefined || lifetime.signal.aborted)
                return null;
            if (record.kind !== 'grant')
                throw new PlatformAuthError('storage');
            const parsed = grant.safeParse(record.payload);
            if (!parsed.success)
                throw new PlatformAuthError('storage');
            // A private origin override must never forward a grant issued by another environment.
            if (parsed.data.issuer !== this.origin)
                throw new PlatformAuthError('protocol');
            return parsed.data;
        }
        /**
         * Resolve a credential only for the inference origin allowed by the provider.
         * @param url - actual request destination or API base URL.
         * @returns stored token, or undefined for other origins or a signed-out account.
         */
        async resolveToken(url) {
            if (this.closed || this.removing !== undefined)
                return undefined;
            const destination = new URL(url);
            if (destination.origin !== this.inferenceOrigin || destination.username || destination.password)
                return undefined;
            const record = await this.ctx.credentials.readRecord(KEY);
            if (record === undefined)
                return undefined;
            if (record.kind !== 'grant')
                throw new PlatformAuthError('storage');
            const result = grant.safeParse(record.payload);
            if (!result.success)
                throw new PlatformAuthError('storage');
            // Development grants cannot authenticate production model or file requests.
            const issuer = new URL(result.data.issuer);
            if (result.data.token.startsWith('dsh_mock_'))
                return undefined;
            if (this.inferenceOrigin === 'https://api.deepseek.com') {
                if (['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname))
                    return undefined;
            }
            else if (issuer.origin !== this.origin)
                return undefined;
            return result.data.token;
        }
        /**
         * Release the account credential for one request to `url` as the request
         * carries it, together with its invalidation, which runs on the account
         * service mounted when it is called, and the signal this service aborts
         * when it signs out of that credential. Host-only.
         * @param url - actual request destination or API base URL.
         * @returns the request credential, or undefined for other origins or a signed-out account.
         */
        async resolveRequestCredential(url) {
            // Captured before the token is read, so a sign-out that completes during the read aborts this credential's signal.
            const revoked = this.signedOut.signal;
            const token = await this.resolveToken(url);
            if (token === undefined)
                return undefined;
            // The destination answers after a reload may have replaced this instance, so the rejection runs on the account
            // service mounted at that time; without one, the grant stays for the next mounted service to reject.
            const { ctx } = this;
            return {
                headers: { [ACCOUNT_TOKEN_HEADER]: token },
                revoked,
                reject: async () => {
                    try {
                        await ctx.get('deepseekAccount')?.rejectToken(token);
                    }
                    catch (_credentialRemovalFailed) { /* The destination's rejection is the failure to report; the next rejection retries. */ }
                },
            };
        }
        /**
         * Join an active attempt or start browser authorization.
         * @param client - identity of the requesting UI; a new attempt captures it, and joining retains the original attempt's identity.
         * @param callbackOrigin - browser-accessible loopback HTTP origin, including any SSH local port.
         * @param loginSource - initiating UI, used to return from a failed exchange.
         * @returns the initial snapshot without waiting for browser approval.
         */
        async startSignIn(client, callbackOrigin, loginSource) {
            if (this.removing !== undefined)
                await this.removing;
            const origin = loginOrigin(callbackOrigin);
            if (this.closed)
                throw new PlatformAuthError('protocol');
            if (this.attempt !== undefined && ['initializing', 'waiting-browser', 'exchanging', 'committing'].includes(this.attempt.view.phase)) {
                return this.getState();
            }
            const previous = this.attempt;
            if (previous !== undefined) {
                await previous.done;
                // Disposal can close the provider while the previous attempt settles.
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (this.closed)
                    throw new PlatformAuthError('protocol');
                if (this.attempt !== previous)
                    return this.getState();
            }
            const attempt = {
                origin, loginSource,
                locale: platformWireLocale(client.locale),
                clientHeaders: platformClientHeaders(this.platform, client),
                view: { id: randomUUID(), phase: 'initializing' },
                controller: new AbortController(), done: Promise.resolve(), running: Promise.resolve(),
            };
            this.attempt = attempt;
            attempt.done = this.ctx.authorization.begin({
                key: KEY, signal: attempt.controller.signal,
                interaction: { notify: () => undefined, prompt: () => Promise.reject(new PlatformAuthError('protocol')) },
            }).then((outcome) => {
                this.update(attempt, { phase: outcome.status === 'authorized' ? 'succeeded' : 'cancelled' });
                if (outcome.status === 'authorized' && attempt.completionUrl !== undefined) {
                    attempt.callback?.writeHead(302, { location: attempt.completionUrl, 'cache-control': 'no-store' }).end();
                }
                else
                    attempt.callback?.writeHead(204, { 'cache-control': 'no-store' }).end();
            }).catch((error) => {
                const code = error instanceof PlatformAuthError ? error.code : 'protocol';
                console.error('[deepseek-account] sign-in failed', { errorCode: code });
                this.update(attempt, { phase: code === 'expired' ? 'expired' : 'failed', errorCode: code });
                this.finishFailedCallback(attempt);
            }).then(async () => {
                // begin() may report cancellation before the HTTP work observes its signal.
                await attempt.running.catch(() => undefined);
                if (attempt.callback !== undefined) {
                    await streamPromises.finished(attempt.callback, { cleanup: true }).catch(() => undefined);
                }
                attempt.disposeCallback?.();
            });
            this.changed('snapshot');
            return this.getState();
        }
        /**
         * Cancel only the named attempt; committing attempts settle before returning.
         * @param attemptId - attempt identity from this Host.
         * @returns state after cancellation or an already-started commit.
         */
        async cancelSignIn(attemptId) {
            const attempt = this.attempt;
            if (attempt?.view.id === attemptId) {
                if (attempt.view.phase !== 'committing') {
                    attempt.controller.abort();
                    this.ctx.authorization.cancel(KEY);
                }
                await attempt.done;
            }
            return this.getState();
        }
        /**
         * Remove the local grant while retaining API keys; the provider revokes it in the background.
         * @param client - identity of the requesting UI, captured for the background revocation retries.
         * @returns the signed-out state after local removal; remote failures never restore the grant.
         */
        signOut(client) {
            this.removing ??= (async () => {
                if (this.closed)
                    throw new PlatformAuthError('protocol');
                if (this.attempt !== undefined)
                    await this.cancelSignIn(this.attempt.view.id);
                const record = await this.ctx.credentials.readRecord(KEY);
                if (record !== undefined) {
                    if (record.kind !== 'grant')
                        throw new PlatformAuthError('storage');
                    const parsed = grant.safeParse(record.payload);
                    if (!parsed.success)
                        throw new PlatformAuthError('storage');
                    if (parsed.data.issuer !== this.origin)
                        throw new PlatformAuthError('protocol');
                    await this.ctx.credentials.deleteRecord(KEY);
                    this.revoke(parsed.data.token, platformClientHeaders(this.platform, client));
                }
                this.attempt = undefined;
                this.publishSignedOut();
                this.changed('snapshot');
                return this.getState();
            })().finally(() => { this.removing = undefined; });
            return this.removing;
        }
        /**
         * Register a report of running work that signing out would interrupt. The
         * plugin billing the account to a model route registers one from within
         * `ctx.effect()`; without any report nothing is known to be running.
         * @param report - answers whether such work is running now.
         * @returns the disposer removing the report.
         */
        registerRunningTaskReport(report) {
            this.runningTaskReports.add(report);
            return () => { this.runningTaskReports.delete(report); };
        }
        /**
         * Inspect running work before sign-out.
         * @returns whether a registered report says a running task uses the account; false without reports.
         */
        hasRunningAccountTasks() {
            for (const report of this.runningTaskReports)
                if (report())
                    return true;
            return false;
        }
        /**
         * Subscribe to live credential expiry without replay.
         * @param signal - subscription lifetime; provider disposal also ends it.
         * @returns expiry notifications emitted during the subscription.
         */
        async *watchExpiry(signal) {
            const lifetime = AbortSignal.any([signal, this.logoutLifetime.signal]);
            let pending = 0;
            let wake;
            const stop = this.ctx.on('deepseek-account/session-expired', () => { pending++; wake?.(); });
            const abort = () => { wake?.(); };
            lifetime.addEventListener('abort', abort, { once: true });
            try {
                while (!lifetime.aborted) {
                    if (pending > 0) {
                        pending--;
                        yield 'session-expired';
                        continue;
                    }
                    await new Promise((resolve) => { wake = resolve; });
                }
            }
            finally {
                stop();
                lifetime.removeEventListener('abort', abort);
            }
        }
        /**
         * Subscribe to ordered updates including a complete initial snapshot.
         * @param signal - subscription lifetime; ending it never cancels login.
         * @param includeIdentityChanges - also notify when cached Platform identity changes; defaults to false.
         * @returns complete state with snapshot or credentials-changed event type; credential changes take priority when updates coalesce.
         */
        watch(signal, includeIdentityChanges = false) {
            return this.observeUpdates(signal, includeIdentityChanges);
        }
        /**
         * Stream account state without the Host-only identity subscription option.
         * @param signal - subscription lifetime.
         * @returns initial state, login progress, and credential-change updates.
         */
        watchState(signal) {
            return this.observeUpdates(signal, false);
        }
        async *observeUpdates(signal, includeIdentityChanges) {
            let pending = 'snapshot';
            let wake;
            const changed = (kind) => {
                if (kind === 'identity' && !includeIdentityChanges)
                    return;
                if (kind === 'credentials-changed' || pending === undefined) {
                    pending = kind === 'credentials-changed' ? kind : 'snapshot';
                }
                wake?.();
            };
            const abort = () => { wake?.(); };
            this.listeners.add(changed);
            signal.addEventListener('abort', abort, { once: true });
            try {
                while (!this.closed && !signal.aborted) {
                    if (pending !== undefined) {
                        const type = pending;
                        pending = undefined;
                        const lifetime = this.detailsLifetime;
                        const state = await this.getState();
                        // A credential write during the read owns the next event and its replacement state.
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Abort or disposal can occur during the state read.
                        if (lifetime !== this.detailsLifetime || signal.aborted || this.closed)
                            continue;
                        yield { type, state };
                        continue;
                    }
                    await new Promise((resolve) => { wake = resolve; });
                }
            }
            finally {
                this.listeners.delete(changed);
                signal.removeEventListener('abort', abort);
            }
        }
        revoke(token, headers) {
            if (this.closed)
                return;
            const revocation = revokeAccount(this.origin, token, this.logoutPolicy, this.logoutLifetime.signal, { ...this.requestHeaders, ...headers }).finally(() => { this.revocations.delete(revocation); });
            this.revocations.add(revocation);
        }
        /**
         * Announce a completed sign-out. Listeners run first, so a turn they cancel records that cause before the requests
         * still carrying the signed-out token end. A listener that throws does not keep those requests open.
         */
        publishSignedOut() {
            const signedOut = this.signedOut;
            this.signedOut = new AbortController();
            try {
                this.ctx.emit('deepseek-account/signed-out');
            }
            finally {
                signedOut.abort();
            }
        }
        invalidateDetails() {
            this.lastProfile = undefined;
            this.detailsLifetime.abort();
            this.detailsLifetime = new AbortController();
        }
        changed(kind) {
            for (const listener of this.listeners)
                listener(kind);
        }
        update(attempt, value) {
            const { authorizeUrl: _url, ...rest } = attempt.view;
            attempt.view = { ...rest, ...value };
            this.changed('snapshot');
        }
        async run(session, attempt) {
            const webServer = this.ctx.get('webServer');
            if (webServer === undefined)
                throw new PlatformAuthError('protocol');
            const callbackOrigin = new URL(attempt.origin);
            const verifier = randomBytes(32).toString('base64url');
            const state = randomBytes(32).toString('base64url');
            const challenge = createHash('sha256').update(verifier).digest('base64url');
            let authorizeId;
            const code = Promise.withResolvers();
            // Callback requests may precede initialization settlement; the rejection is observed immediately.
            void code.promise.catch(() => undefined);
            const deadline = new AbortController();
            let expiresAt = Date.now() + this.attemptTimeout;
            const signal = AbortSignal.any([session.signal, deadline.signal]);
            let timer = setTimeout(() => { deadline.abort(); }, this.attemptTimeout);
            const abort = () => { code.reject(new PlatformAuthError('expired')); };
            signal.addEventListener('abort', abort, { once: true });
            try {
                attempt.disposeCallback = this.ctx.on('webserver/request', async (req, res, next) => {
                    let receivedOrigin;
                    try {
                        receivedOrigin = new URL(`http://${req.headers.host ?? ''}`);
                    }
                    catch {
                        await next();
                        return;
                    }
                    if (receivedOrigin.href !== callbackOrigin.href) {
                        await next();
                        return;
                    }
                    let url;
                    try {
                        url = new URL(req.url ?? '/', callbackOrigin);
                    }
                    catch {
                        res.writeHead(400, { 'cache-control': 'no-store' }).end();
                        return;
                    }
                    if (url.origin !== callbackOrigin.origin || url.pathname !== '/oauth/callback') {
                        await next();
                        return;
                    }
                    const receivedCode = url.searchParams.get('code');
                    const receivedState = url.searchParams.get('state') ?? '';
                    const validState = Buffer.byteLength(receivedState) === Buffer.byteLength(state)
                        && timingSafeEqual(Buffer.from(receivedState), Buffer.from(state));
                    if (req.method !== 'GET' || !validState || !receivedCode
                        || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1) {
                        res.writeHead(400, { 'cache-control': 'no-store' }).end();
                        return;
                    }
                    if (signal.aborted || attempt.callback !== undefined || attempt.view.phase !== 'waiting-browser') {
                        res.writeHead(410, { 'cache-control': 'no-store' }).end();
                        return;
                    }
                    attempt.callback = res;
                    code.resolve(receivedCode);
                });
                signal.throwIfAborted();
                const redirectUri = `${attempt.origin}/oauth/callback`;
                const init = initialization.safeParse(await this.request('auth_init', {
                    code_challenge: challenge, code_challenge_method: 'S256', state, redirect_uri: redirectUri, locale: attempt.locale,
                    login_source: attempt.loginSource,
                }, signal, attempt.clientHeaders), { reportInput: true });
                if (!init.success)
                    this.rejectPayload('auth_init', init.error);
                const authorizeUrl = browserUrl(init.data.authorize_url, this.origin, '/dsh/authorize', this.rewriteBrowserOrigin);
                authorizeId = init.data.authorize_id;
                signal.throwIfAborted();
                const now = Date.now();
                expiresAt = Math.min(expiresAt, now + init.data.expires_in * 1000);
                const remaining = expiresAt - now;
                if (remaining <= 0) {
                    deadline.abort();
                    signal.throwIfAborted();
                }
                clearTimeout(timer);
                timer = setTimeout(() => { deadline.abort(); }, remaining);
                this.update(attempt, { phase: 'waiting-browser', authorizeUrl, expiresAt });
                const receivedCode = await code.promise;
                signal.throwIfAborted();
                this.update(attempt, { phase: 'exchanging' });
                const deviceRecord = await this.ctx.credentials.modifyRecord(DEVICE, current => Promise.resolve(current === undefined
                    ? { kind: 'grant', payload: { id: randomUUID() } } : undefined));
                if (deviceRecord?.kind !== 'grant')
                    throw new PlatformAuthError('storage');
                const identity = device.parse(deviceRecord.payload);
                const result = exchange.safeParse(await this.request('auth_exchange', {
                    code: receivedCode, code_verifier: verifier, redirect_uri: redirectUri,
                    device_id: identity.id, device_model: `${platform()}-${arch()}`, os_version: deviceOsVersion(),
                }, signal, attempt.clientHeaders), { reportInput: true });
                if (!result.success)
                    this.rejectPayload('auth_exchange', result.error);
                const completionUrl = new URL(browserUrl(result.data.authorized_url, this.origin, '/dsh/authorized', this.rewriteBrowserOrigin));
                completionUrl.searchParams.set('login_source', attempt.loginSource);
                attempt.completionUrl = completionUrl.href;
                if (Date.now() >= expiresAt)
                    deadline.abort();
                signal.throwIfAborted();
                if (result.data.user != null) {
                    try {
                        attempt.initialProfile = { token: result.data.token, value: { status: 'ready', value: profile(result.data.user) } };
                    }
                    catch (_invalidUser) {
                        // Invalid optional user data falls back to current without discarding a valid authorization.
                    }
                }
                this.update(attempt, { phase: 'committing' });
                clearTimeout(timer);
                try {
                    await session.commit({ kind: 'grant', payload: { version: 1, token: result.data.token, issuer: this.origin } });
                }
                catch {
                    throw new PlatformAuthError('storage');
                }
            }
            catch (error) {
                if (deadline.signal.aborted)
                    throw new PlatformAuthError('expired');
                throw error;
            }
            finally {
                if (signal.aborted && authorizeId !== undefined)
                    this.cancelRequest(authorizeId, verifier, attempt.clientHeaders);
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
                // begin() settles the browser response and removes only this attempt's callback listener.
            }
        }
        rejectPayload(stage, error) {
            console.error('[deepseek-account] payload rejected', {
                stage, issues: error.issues.map(issue => ({
                    path: issue.path, code: issue.code,
                    receivedType: issue.input === null ? 'null' : Array.isArray(issue.input) ? 'array' : typeof issue.input,
                })),
            });
            throw new PlatformAuthError('protocol');
        }
        cancelRequest(authorizeId, verifier, headers) {
            if (this.closed)
                return;
            const cancellation = this.request('auth_cancel', { authorize_id: authorizeId, code_verifier: verifier }, this.logoutLifetime.signal, headers).then(() => undefined, () => {
                // Remote cancellation failures never reverse local cancellation or expose verifier diagnostics.
            }).finally(() => { this.revocations.delete(cancellation); });
            this.revocations.add(cancellation);
        }
        request(method, body, signal, headers) {
            return requestPlatform(this.origin, method, body, AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeout)]), { ...this.requestHeaders, ...headers });
        }
        finishFailedCallback(attempt) {
            if (attempt.loginSource === 'web') {
                const nonce = randomBytes(16).toString('base64url');
                const message = attempt.locale === 'zh_CN' ? '登录失败，请关闭此标签页并在原页面重试。'
                    : 'Sign-in failed. Close this tab and try again in the original tab.';
                attempt.callback?.writeHead(200, {
                    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
                    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
                    'referrer-policy': 'no-referrer',
                }).end(`<!doctype html><html lang="${attempt.locale === 'zh_CN' ? 'zh-CN' : 'en'}"><meta charset="utf-8"><title>${message}</title>`
                    + `<body><p>${message}</p><script nonce="${nonce}">window.close()</script></body></html>`);
            }
            else {
                // Native account subscribers focus the login window; retain the browser’s Platform document.
                attempt.callback?.writeHead(204, { 'cache-control': 'no-store' }).end();
            }
        }
    };
})();
export { DeepSeekAccount };
export default DeepSeekAccount;
/** OS identification shared by login and credential-free identity reads. */
function deviceOsVersion() {
    return `${platform()} ${release()}`;
}
//# sourceMappingURL=index.js.map