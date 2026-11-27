import type { ListingSettings } from './listing-config.ts';
import type { ModelListing } from './listing.ts';
/** Host-owned inputs of one cache instance. */
export interface ListingCacheDependencies {
    /** Latest route configuration for automatic refresh; `undefined` stops following the listing. */
    readonly settings: () => ListingSettings | undefined;
    /** Headers carrying the credential the route sends to `url`, or `undefined` when it has none. */
    readonly credential: (url: string) => Promise<Readonly<Record<string, string>> | undefined>;
    /** Perform one listing request sending `headers`; `signal` carries the {@link LISTING_TIMEOUT} request deadline. */
    readonly load: (url: string, headers: Readonly<Record<string, string>>, signal: AbortSignal) => Promise<ModelListing>;
    /** Wall clock used for listing age. */
    readonly now: () => number;
    /** Report a loaded listing. */
    readonly info: (message: string) => void;
    /** Report the first failure of a failing streak. */
    readonly warn: (message: string) => void;
    /** Publish a changed view; readers can immediately read `current()`. */
    readonly changed: () => void;
}
/** What request resolution reads. */
export interface ListingView {
    /** Whether a credential is available for the listing endpoint. */
    readonly authenticated: boolean;
    /** Last successful listing for this scope; `undefined` until one succeeds. */
    readonly listing: ModelListing | undefined;
}
/** One route's listing cache; each endpoint and credential pair has its own scope. */
export declare class ModelListingCache {
    private readonly dependencies;
    private scope;
    private listing;
    /** Settle time of the latest load in this scope; `undefined` before the first one settles. */
    private settledAt;
    private inflight;
    private request;
    private generation;
    private failing;
    private closed;
    private timer;
    private readonly pending;
    /** @param dependencies - credential, transport, clock, and diagnostic callbacks. */
    constructor(dependencies: ListingCacheDependencies);
    /**
     * The last published view, without I/O.
     * @returns the credential state and listing of the current scope.
     */
    current(): ListingView;
    /**
     * Resolve the view for the current credential. The first access of a scope
     * waits for its load, which the request deadline bounds; later accesses
     * return at once and refresh a stale listing in the background. After a load settles,
     * automatic refresh uses the latest route settings; failures retain the last successful listing, including badges.
     * @param settings - endpoint and timing of the caller's configuration generation.
     * @param signal - abandons this wait only; the shared load continues.
     * @returns the view after any first load of the scope settles.
     */
    view(settings: ListingSettings, signal?: AbortSignal): Promise<ListingView>;
    /** Discard the listing and abort any in-flight load; the next access loads again and waits like a first access. */
    invalidate(): void;
    /**
     * Stop automatic refresh and abort loads; later results and accesses change nothing.
     * @returns completion of all admitted loads and automatic credential lookups.
     */
    dispose(): Promise<void>;
    private rescope;
    private start;
    private notify;
    private schedule;
    private refresh;
}
//# sourceMappingURL=listing-cache.d.ts.map