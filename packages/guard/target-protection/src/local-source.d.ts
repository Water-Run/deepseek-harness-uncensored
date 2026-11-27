/**
 * Read one local source without allocating beyond its configured byte cap.
 * @param path - Source file or file URL.
 * @param maxBytes - Maximum accepted bytes, supplied by validated deployment configuration.
 * @param signal - Acquisition cancellation.
 * @returns Complete file bytes; the descriptor is closed on every outcome.
 */
export declare function readLocalSource(path: string | URL, maxBytes: number, signal: AbortSignal): Promise<Buffer>;
//# sourceMappingURL=local-source.d.ts.map