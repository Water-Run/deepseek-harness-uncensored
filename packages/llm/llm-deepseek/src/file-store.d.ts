/** DeepSeek Files API upload reuse, invalidation, and quota recovery. @module dsh-llm-deepseek/file-store */
import { type TimeoutReason } from '@deepseek-ai/dsh-timeout';
import type { RequestImageAttachment } from '@deepseek-ai/dsh-attachment';
import { DeepSeekUploadIndex } from './upload-index.ts';
import type { DeepSeekUploadRecord } from './upload-index.ts';
export { MAX_IMAGE_BYTES } from './defaults.ts';
/** Per-image deadline whose expiry during upload starts Files backoff. */
export declare const FILES_API_TIMEOUT = "DEEPSEEK_FILES_API_TIMEOUT";
/** Resolved file-store policy from the plugin configuration. */
export interface DeepSeekFilePolicy {
    expiresAfterSeconds: number;
    refreshMarginSeconds: number;
    quotaCleanupBatch: number;
    /** Maximum simultaneous file resolutions in one model request. */
    uploadConcurrency: number;
    /** Per-image resolution deadline, including retry delays. */
    uploadTimeoutMs: number;
    /** Additional attempts shared by rate-limit and quota recovery. */
    uploadMaxRetries: number;
    /** Local delay after HTTP 429, in milliseconds. */
    uploadRetryDelayMs: number;
}
/** Connection facts needed by file operations. */
export interface DeepSeekFileConnection {
    baseURL: string;
    /** Provider-resolved authentication headers for this endpoint. */
    headers: Readonly<Record<string, string>>;
}
/** Result of one file-id resolution. */
export interface DeepSeekFileReference {
    record: DeepSeekUploadRecord;
    uploaded: boolean;
}
interface FileStoreOptions {
    index?: DeepSeekUploadIndex;
    now?: () => number;
    fetch?: typeof fetch;
}
/** Timeout decision shared by all cache misses in one model request on the same endpoint and credential. */
export interface FileRequestBackoff {
    /** Undefined before the first cache miss, null when uploads are admitted, or the timeout behind the skip. */
    skippedAfter?: TimeoutReason | null;
}
/** User-scoped durable file-id reuse for the DeepSeek route. */
export declare class DeepSeekFileStore {
    private readonly index;
    private readonly now;
    private readonly fetchImpl;
    private readonly backoffs;
    private readonly inflight;
    /** Unclaimed slots from the preceding cleanup in each active Files namespace. */
    private readonly quotaRecoveries;
    /**
     * @param options - testable index, clock, and transport boundaries.
     */
    constructor(options?: FileStoreOptions);
    private client;
    /**
     * Resolve or upload one deterministic request image. Concurrent calls share one upload while retaining independent waits.
     * @param version - deterministic model-request bytes and complete transformation identity.
     * @param connection - endpoint and API-key snapshot.
     * @param policy - expiry and quota-recovery policy.
     * @param signal - cancellation of this wait; shared transport stops when no waiter remains.
     * @param request - timeout backoff decision shared by images in the same request; standalone calls count independently.
     * @returns a reusable file id and whether this call published a new upload.
     * @throws During backoff the first cache miss consumes one skip for the request. Skipped uploads reject with FILES_API_SKIPPED.
     */
    ensureUploaded(version: RequestImageAttachment, connection: DeepSeekFileConnection, policy: DeepSeekFilePolicy, signal?: AbortSignal, request?: FileRequestBackoff): Promise<DeepSeekFileReference>;
    private uploadOnce;
    /** Overlapping quota failures claim distinct deleted slots, listing again only when the batch runs out. */
    private reserveQuotaSlot;
    /**
     * Invalidate exact local mappings in one index update after a model request rejects their remote ids.
     * @param generations - request-image variants with the exact file id the request used for each.
     * @param connection - endpoint and API-key snapshot.
     */
    invalidate(generations: readonly Pick<DeepSeekUploadRecord, 'variantId' | 'fileId'>[], connection: DeepSeekFileConnection): Promise<void>;
    /**
     * Delete the indexed remote file for one attachment and remove its local mapping.
     * @param version - exact request-image version to release.
     * @param connection - endpoint and API-key snapshot.
     * @param policy - expiry policy used to locate a reusable mapping.
     * @param signal - request cancellation.
     * @returns whether an indexed file existed and was deleted.
     */
    release(version: RequestImageAttachment, connection: DeepSeekFileConnection, policy: DeepSeekFilePolicy, signal?: AbortSignal): Promise<boolean>;
    /**
     * Delete the oldest provider files whose names identify harness ownership.
     * @param connection - endpoint and API-key snapshot.
     * @param count - positive maximum number of files to delete.
     * @param signal - request cancellation.
     * @returns number of successfully deleted files.
     */
    reclaimOldestOwned(connection: DeepSeekFileConnection, count: number, signal?: AbortSignal): Promise<number>;
    /**
     * Delete every remote harness-owned file in the active API-key namespace and clear its index.
     * @param connection - endpoint and API-key snapshot.
     * @param signal - request cancellation.
     * @returns number of deleted files.
     */
    releaseAll(connection: DeepSeekFileConnection, signal?: AbortSignal): Promise<number>;
}
//# sourceMappingURL=file-store.d.ts.map