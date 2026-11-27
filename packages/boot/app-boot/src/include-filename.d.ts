/** Resolve an Include `path` to the file the Include plugin reads. */
/**
 * Resolve an Include `path` as the vendored Include does: on Windows a drive-letter path is a file path, and every
 * other path is a URL reference resolved against the owning tree's base URL.
 * @param path - literal Include `path`.
 * @param baseUrl - base URL of the tree that owns the Include entry.
 * @param platform - platform whose path rules apply to both branches; defaults to the running one.
 * @returns the absolute filename.
 * @throws when `path` resolves to a URL that is not a `file:` URL.
 */
export declare function includeFilename(path: string, baseUrl: string, platform?: NodeJS.Platform): string;
//# sourceMappingURL=include-filename.d.ts.map