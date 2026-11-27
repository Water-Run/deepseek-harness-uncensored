/** Shared provider limits and Chat Files API defaults. */
/** Provider hard encoded-byte limit for one request image. */
export declare const MAX_IMAGE_BYTES: number;
/** Default maximum idle interval while an adapter stream read is outstanding. */
export declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Default combined request/response context capacity. */
export declare const DEFAULT_CONTEXT_WINDOW = 1000000;
/** Default per-request output-token cap. */
export declare const DEFAULT_MAX_TOKENS = 256000;
/** Default bound on accumulated base64 image payload after Files API fallback. */
export declare const DEFAULT_MAX_INLINE_REQUEST_IMAGE_BYTES: number;
/** Deterministic raw-byte removal step. */
export declare const DEFAULT_IMAGE_OFFLOAD_BYTE_QUANTUM: number;
/** Deterministic base64-byte removal step after Files API fallback. */
export declare const DEFAULT_INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM: number;
/** Deterministic image-count removal step. */
export declare const DEFAULT_IMAGE_OFFLOAD_COUNT_QUANTUM = 20;
/** Default explicit lifetime for uploaded images. */
export declare const DEFAULT_FILE_EXPIRY_SECONDS: number;
/** Default proactive refresh window for indexed file ids. */
export declare const DEFAULT_FILE_REFRESH_MARGIN_SECONDS: number;
/** Default number of oldest harness-owned files removed on quota recovery. */
export declare const DEFAULT_FILE_QUOTA_CLEANUP_BATCH = 100;
/** Maximum simultaneous Files uploads per model request. */
export declare const MAX_FILE_UPLOAD_CONCURRENCY = 3;
/** Maximum additional upload attempts per image. */
export declare const MAX_FILE_UPLOAD_RETRIES = 2;
/** Local wait after an upload is rate limited, in milliseconds. */
export declare const DEFAULT_FILE_UPLOAD_RETRY_DELAY_MS = 500;
/** Default deadline for resolving one request image through the Files API. */
export declare const DEFAULT_FILES_API_TIMEOUT_MS = 20000;
//# sourceMappingURL=defaults.d.ts.map