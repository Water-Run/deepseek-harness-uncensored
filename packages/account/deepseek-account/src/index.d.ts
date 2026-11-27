import { Context, Service } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import Schema from '@deepseek-ai/schemastery';
import { type AccountNotification, type AccountNotificationBatch, type AccountNotificationEvent, type AccountNotificationId, type AccountClientMetadata, type AccountDetails, type AccountRequestCredential, type AccountUserId, type AccountView, type AccountUpdate, type PlatformSession, type SignInAttemptId } from './types.ts';
export type * from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        deepseekAccount: DeepSeekAccount;
    }
    interface Events {
        /** Local grant removal has completed. After the listeners return, the `revoked` signal of that grant's request credentials aborts.
         * @mode emit
         */
        'deepseek-account/signed-out'(): void;
    }
}
/** Deployment-specific platform and request deadlines. */
export interface Config {
    /** Platform origin serving auth-api and browser pages. */
    platformOrigin?: string;
    /** Harness API origin for account notifications. */
    harnessOrigin?: string;
    /** Native desktop identity for Host API and embedded Platform requests; null identifies the client as web. */
    desktopPlatform?: 'darwin' | 'win32' | null;
    /** Optional frontend deployment selector for embedded Usage and Top-up pages. */
    embeddedPageDist?: string;
    /** Exact HTTP(S) origin allowed to receive account tokens for inference and files. */
    inferenceOrigin?: string;
    /** Allow HTTP only on loopback for the development Mock. */
    allowLoopbackHttp?: boolean;
    /** Map authorization and completion pages to platformOrigin for private development proxies. */
    rewriteBrowserOrigin?: boolean;
    /** Host-only headers for Platform and notification APIs; account authorization cannot be overridden. */
    requestHeaders?: Record<string, string>;
    /** Overrides for profile, balance, notification and embedded Platform requests;
     * Cookie pairs merge by name. Logout retains requestHeaders.
     */
    accountRequestHeaders?: Record<string, string>;
    /** Deadline for each platform HTTP request. */
    requestTimeoutMs?: number;
    /** Deadline for recharge-wallet queries; timeout returns a failed balance outcome. */
    balanceTimeoutMs?: number;
    /** Additional logout attempts after the first request fails, at most five. */
    logoutMaxRetries?: number;
    /** Delay before the first logout retry; each later delay doubles. */
    logoutRetryDelayMs?: number;
    /** Upper bound for the entire local attempt, even if the server advertises a longer TTL. */
    attemptTimeoutMs?: number;
}
/** Account login, credentials, and client-safe Remote operations. */
export declare class DeepSeekAccount extends TypertRemoteService {
    static inject: string[];
    static Config: Schema<Schemastery.ObjectS<NoInfer<{
        platformOrigin: Schema<string, string, "defined">;
        harnessOrigin: Schema<string, string, "defined">;
        desktopPlatform: Schema<"darwin" | "win32" | null, "darwin" | "win32" | null, "defined">;
        embeddedPageDist: Schema<string, string, "defined">;
        inferenceOrigin: Schema<string, string, "defined">;
        allowLoopbackHttp: Schema<boolean, boolean, "defined">;
        rewriteBrowserOrigin: Schema<boolean, boolean, "defined">;
        requestHeaders: Schema<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
        accountRequestHeaders: Schema<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
        requestTimeoutMs: Schema<number, number, "defined">;
        balanceTimeoutMs: Schema<number, number, "defined">;
        logoutMaxRetries: Schema<number, number, "defined">;
        logoutRetryDelayMs: Schema<number, number, "defined">;
        attemptTimeoutMs: Schema<number, number, "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        platformOrigin: Schema<string, string, "defined">;
        harnessOrigin: Schema<string, string, "defined">;
        desktopPlatform: Schema<"darwin" | "win32" | null, "darwin" | "win32" | null, "defined">;
        embeddedPageDist: Schema<string, string, "defined">;
        inferenceOrigin: Schema<string, string, "defined">;
        allowLoopbackHttp: Schema<boolean, boolean, "defined">;
        rewriteBrowserOrigin: Schema<boolean, boolean, "defined">;
        requestHeaders: Schema<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
        accountRequestHeaders: Schema<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "defined">;
        requestTimeoutMs: Schema<number, number, "defined">;
        balanceTimeoutMs: Schema<number, number, "defined">;
        logoutMaxRetries: Schema<number, number, "defined">;
        logoutRetryDelayMs: Schema<number, number, "defined">;
        attemptTimeoutMs: Schema<number, number, "defined">;
    }>>, "plain">;
    private readonly origin;
    private readonly harnessOrigin;
    private readonly embeddedPageDist;
    private readonly inferenceOrigin;
    private readonly rewriteBrowserOrigin;
    private readonly platform;
    private readonly requestHeaders;
    private readonly accountRequestHeaders;
    private readonly requestTimeout;
    private readonly balanceTimeout;
    private readonly attemptTimeout;
    private readonly logoutPolicy;
    private readonly logoutLifetime;
    private readonly revocations;
    private attempt;
    private readonly listeners;
    private readonly runningTaskReports;
    /**
     * Latest ready profile read and the grant token it was read with. Binding the token keeps a
     * cached identity from answering for a credential that has since changed.
     */
    private lastProfile;
    private detailsLifetime;
    /** Aborted at the next sign-out; request credentials of the current sign-in carry its signal. */
    private signedOut;
    private closed;
    private removing;
    /** @param ctx - Host with authorization and credentials services. @param config - deployment options. */
    constructor(ctx: Context, config?: Config);
    [Service.init](): Promise<void>;
    /**
     * Read stored-account presence and the latest login attempt.
     * @returns a snapshot without credentials or PKCE secrets.
     */
    getState(): Promise<AccountView>;
    /**
     * Query Platform profile independently of wallet balances.
     * A ready result whose stable profile ID first becomes available or changes notifies identity-enabled watch
     * consumers, so they re-read getPlatformSession; repeated IDs stay silent.
     * @param client - identity of the requesting UI for this call.
     * @returns profile outcome, or null if signed out or the grant changed during the query.
     */
    getProfile(client: AccountClientMetadata): Promise<AccountDetails['profile'] | null>;
    /**
     * Query Platform recharge and bonus wallet balances independently of profile data.
     * @param client - identity of the requesting UI for this call.
     * @returns balance outcome, or null if signed out or the grant changed during the query.
     */
    getBalance(client: AccountClientMetadata): Promise<AccountDetails['balance'] | null>;
    /**
     * Query unconsumed account notifications in server order without reading profile data.
     * @param client - identity of the requesting UI for this call; its language selects the server-authored message.
     * @returns notifications with their next query delay, or null if signed out or the grant changed during the query.
     */
    getNotifications(client: AccountClientMetadata): Promise<AccountNotificationBatch | null>;
    /**
     * Query localized content of a notification, including one already consumed.
     * @param id - notification whose content is requested.
     * @param client - identity of the requesting UI; its language selects the localized content.
     * @returns content without changing consumption, or null if signed out or the grant changed.
     */
    getNotificationContent(id: AccountNotificationId, client: AccountClientMetadata): Promise<AccountNotification | null>;
    /**
     * Report a notification interaction; the backend decides consumption.
     * @param id - notification the user interacted with.
     * @param event - displayed frame, non-dismiss action click, or explicit dismissal.
     * @param client - identity of the requesting UI for this call.
     * @returns true once the server accepts the event; false if signed out or credentials changed during the call.
     */
    reportNotificationEvent(id: AccountNotificationId, event: AccountNotificationEvent, client: AccountClientMetadata): Promise<boolean>;
    /**
     * Cache one ready profile against the grant token it was read with, so identity reuse cannot cross
     * a credential change. A stable ID that first appears or changes notifies identity-enabled watch consumers, so
     * identity consumers re-read getPlatformSession; repeated IDs stay silent.
     * @param token - grant the profile was read with.
     * @param profile - profile outcome to record when it carries account data.
     */
    private cacheProfile;
    private getDetail;
    /** Deployment account headers plus the client identity headers derived from one call's metadata. */
    private detailHeaders;
    /**
     * Remove an inference-rejected token only while it still matches the stored login.
     * @param token - token captured by the rejected inference request.
     * @returns after matching credentials are removed and the expiry notification is emitted.
     */
    rejectToken(token: string): Promise<void>;
    private expireCredential;
    /**
     * Read existing login identity without creating a device or returning credentials.
     * @returns optional device/account identifiers and the provider's OS version string.
     */
    getDeviceIdentity(): Promise<{
        deviceId?: string;
        userId?: AccountUserId;
        osVersion: string;
    }>;
    /**
     * Read credentials for the configured embedded-page origin, bound to their account environment, and
     * pair them with the account ID from the last successful profile read; no profile request is made.
     * @returns a Host-only snapshot, or null while signed out or when the credential changed during the read.
     */
    getPlatformSession(): Promise<PlatformSession | null>;
    private readCurrentGrant;
    /**
     * Resolve a credential only for the inference origin allowed by the provider.
     * @param url - actual request destination or API base URL.
     * @returns stored token, or undefined for other origins or a signed-out account.
     */
    resolveToken(url: string): Promise<string | undefined>;
    /**
     * Release the account credential for one request to `url` as the request
     * carries it, together with its invalidation, which runs on the account
     * service mounted when it is called, and the signal this service aborts
     * when it signs out of that credential. Host-only.
     * @param url - actual request destination or API base URL.
     * @returns the request credential, or undefined for other origins or a signed-out account.
     */
    resolveRequestCredential(url: string): Promise<AccountRequestCredential | undefined>;
    /**
     * Join an active attempt or start browser authorization.
     * @param client - identity of the requesting UI; a new attempt captures it, and joining retains the original attempt's identity.
     * @param callbackOrigin - browser-accessible loopback HTTP origin, including any SSH local port.
     * @param loginSource - initiating UI, used to return from a failed exchange.
     * @returns the initial snapshot without waiting for browser approval.
     */
    startSignIn(client: AccountClientMetadata, callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<AccountView>;
    /**
     * Cancel only the named attempt; committing attempts settle before returning.
     * @param attemptId - attempt identity from this Host.
     * @returns state after cancellation or an already-started commit.
     */
    cancelSignIn(attemptId: SignInAttemptId): Promise<AccountView>;
    /**
     * Remove the local grant while retaining API keys; the provider revokes it in the background.
     * @param client - identity of the requesting UI, captured for the background revocation retries.
     * @returns the signed-out state after local removal; remote failures never restore the grant.
     */
    signOut(client: AccountClientMetadata): Promise<AccountView>;
    /**
     * Register a report of running work that signing out would interrupt. The
     * plugin billing the account to a model route registers one from within
     * `ctx.effect()`; without any report nothing is known to be running.
     * @param report - answers whether such work is running now.
     * @returns the disposer removing the report.
     */
    registerRunningTaskReport(report: () => boolean): () => void;
    /**
     * Inspect running work before sign-out.
     * @returns whether a registered report says a running task uses the account; false without reports.
     */
    hasRunningAccountTasks(): boolean;
    /**
     * Subscribe to live credential expiry without replay.
     * @param signal - subscription lifetime; provider disposal also ends it.
     * @returns expiry notifications emitted during the subscription.
     */
    watchExpiry(signal: AbortSignal): AsyncIterable<'session-expired'>;
    /**
     * Subscribe to ordered updates including a complete initial snapshot.
     * @param signal - subscription lifetime; ending it never cancels login.
     * @param includeIdentityChanges - also notify when cached Platform identity changes; defaults to false.
     * @returns complete state with snapshot or credentials-changed event type; credential changes take priority when updates coalesce.
     */
    watch(signal: AbortSignal, includeIdentityChanges?: boolean): AsyncIterable<AccountUpdate>;
    /**
     * Stream account state without the Host-only identity subscription option.
     * @param signal - subscription lifetime.
     * @returns initial state, login progress, and credential-change updates.
     */
    watchState(signal: AbortSignal): AsyncIterable<AccountUpdate>;
    private observeUpdates;
    private revoke;
    /**
     * Announce a completed sign-out. Listeners run first, so a turn they cancel records that cause before the requests
     * still carrying the signed-out token end. A listener that throws does not keep those requests open.
     */
    private publishSignedOut;
    private invalidateDetails;
    private changed;
    private update;
    private run;
    private rejectPayload;
    private cancelRequest;
    private request;
    private finishFailedCallback;
}
export default DeepSeekAccount;
//# sourceMappingURL=index.d.ts.map