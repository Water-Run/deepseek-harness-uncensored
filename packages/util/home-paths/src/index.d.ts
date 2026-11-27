/**
 * Shared filesystem path helpers for DeepSeek Harness user data.
 *
 * @module @deepseek-ai/dsh-home-paths
 */
/** Directory name for the default DeepSeek Harness home under the OS home. */
export declare const DSH_HOME_DIR_NAME = ".dsh-uncensored";
/** Stable user-facing display form for the default DeepSeek Harness home. */
export declare const DEFAULT_DSH_HOME_DISPLAY = "~/.dsh-uncensored";
/** Environment variable that overrides the default DeepSeek Harness home. */
export declare const DSH_HOME_ENV = "DSH_HOME";
/** Directory name for the default shared agent configuration root under the OS home. */
export declare const AGENTS_HOME_DIR_NAME = ".agents";
/** Stable user-facing display form for the default shared agent configuration root. */
export declare const DEFAULT_AGENTS_HOME_DISPLAY = "~/.agents";
/** Environment variable that overrides the default shared agent configuration root. */
export declare const AGENTS_HOME_ENV = "DSH_AGENTS_HOME";
/**
 * Give a native filesystem watcher one canonical spelling of a path, even
 * when its final components do not exist yet. The deepest existing ancestor
 * is resolved through {@link realpath}; when a suffix is missing, that
 * ancestor is also proved to be an enumerable directory before the suffix is
 * restored. This prevents Windows from treating a regular-file ancestor as
 * ordinary absence, and prevents short-name aliases from being mixed with
 * long paths emitted by the native watcher backend.
 * @param path - Watch target or root, resolved against the current directory.
 * @returns the target with its existing ancestor canonicalized.
 * @throws when ancestor traversal encounters an error other than absence, or
 * the existing ancestor of a missing suffix is not an enumerable directory.
 */
export declare function canonicalizeWatchPath(path: string): Promise<string>;
/**
 * Reject overlap with the official DeepSeek Harness home before a launcher writes data.
 * @param home - resolved DSHU home selected for this launch.
 * @param officialHome - official home to protect, defaulting to the OS home followed by `.dsh`.
 * @throws if either directory contains the other, including through existing links, or an existing link cannot be resolved.
 */
export declare function assertSeparateDshHome(home: string, officialHome?: string): Promise<void>;
/**
 * Resolve the default DeepSeek Harness home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
export declare function defaultDshHome(): string;
/**
 * Resolve the default shared agent configuration root using Node's platform path rules.
 * @returns the absolute default shared agent configuration root.
 */
export declare function defaultAgentsHome(): string;
/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export declare function expandHomePath(path: string): string;
/**
 * Resolve the single-root DeepSeek Harness home.
 *
 * Precedence, highest first: an explicit configured path, `$DSH_UNCENSORED_HOME`,
 * a custom `$DSH_HOME`, then `~/.dsh-uncensored`. The official default `~/.dsh`
 * is ignored when inherited through the environment. An explicit configured
 * path may still select it. The harness keeps all user data under one root. An empty or
 * whitespace-only `$DSH_HOME` is treated as unset, so a blank override never
 * resolves the home to the current working directory.
 * @param configured - explicit harness-home override, which has highest precedence.
 * @param env - environment mapping used to read `DSH_HOME`.
 * @returns the normalized absolute harness home path.
 */
export declare function resolveDshHome(configured?: string, env?: Record<string, string | undefined>): string;
/**
 * Resolve the shared agent configuration root.
 *
 * Precedence, highest first: an explicit configured path, `$DSH_AGENTS_HOME`,
 * then `~/.agents`. The root holds configuration shared with other agent tools,
 * so it stays independent of the DeepSeek Harness home. An empty or
 * whitespace-only `$DSH_AGENTS_HOME` is treated as unset, so a blank override
 * never resolves the root to the current working directory.
 * @param configured - explicit shared-root override, which has highest precedence.
 * @param env - environment mapping used to read `DSH_AGENTS_HOME`.
 * @returns the normalized absolute shared agent configuration root.
 */
export declare function resolveAgentsHome(configured?: string, env?: Record<string, string | undefined>): string;
/**
 * Join path segments onto the resolved DeepSeek Harness home. It addresses the
 * existing top-level entries; a new path uses {@link dshPath} with its category.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
export declare function dshHomePath(...segments: string[]): string;
/**
 * Join path segments onto the resolved Harness home's `cache` directory without creating it; no arguments returns the directory itself.
 * @param optionsOrSegment - explicit home override, or the first path segment; omission uses the default home resolution.
 * @param segments - additional path segments after the first child, if any.
 * @returns the normalized absolute cache path.
 */
export declare function dshCachePath(optionsOrSegment?: {
    dshHome?: string;
} | string, ...segments: string[]): string;
/**
 * Category directory under the Harness home, named after the XDG Base Directory
 * kinds. A new file kept under `$DSH_HOME` belongs to exactly one category, and
 * the category directory name equals the category. Existing top-level entries,
 * such as `sessions/`, `profiles/`, and `.credentials.yaml`, keep their current
 * locations; the [home path categories proposal](../../../../.agents/notes/proposed/architecture/2026-11-04-dsh-home-path-categories.md)
 * lists every path and its category:
 *
 * - `config`: files a person writes or edits to configure the harness.
 * - `data`: durable records whose loss loses user work, sign-ins, or installed
 *   software, such as Sessions, profiles, attachments, credentials, and runtimes.
 * - `state`: records that persist across runs but whose loss only resets
 *   history or derived indexes, such as logs, upload indexes, and ids.
 * - `cache`: content that can be rebuilt or downloaded again.
 * - `backup`: backup archives the harness writes; deleting them never affects
 *   a running harness or the records they copy.
 */
export type DshHomeCategory = 'config' | 'data' | 'state' | 'cache' | 'backup';
/** A category directory under an explicitly configured Harness home. */
export interface DshPathLocation {
    /** Category directory to join under. */
    category: DshHomeCategory;
    /** Explicit harness-home override, resolved by {@link resolveDshHome}; omission uses `$DSH_HOME`, then `~/.dsh`. */
    dshHome?: string | undefined;
}
/**
 * Join path segments onto one category directory of the Harness home without
 * creating it. An owner passes its own directory name, normally its package
 * name without the `@deepseek-ai/dsh-` prefix, as the first segment.
 * @param location - category under the resolved home, or a category with an explicit home override.
 * @param segments - path segments appended to the category directory; an empty list returns the directory itself.
 * @returns the normalized absolute path.
 */
export declare function dshPath(location: DshHomeCategory | DshPathLocation, ...segments: string[]): string;
/**
 * Describe a resolved harness home symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default home is labelled
 * `~/.dsh`, and any configured home is labelled `$DSH_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveDshHome}.
 * @returns `~/.dsh` for the default home, otherwise `$DSH_HOME`.
 */
export declare function dshHomeDisplay(resolvedHome: string): string;
/**
 * Describe a resolved shared agent configuration root symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default root is labelled
 * `~/.agents`, and any configured root is labelled `$DSH_AGENTS_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveAgentsHome}.
 * @returns `~/.agents` for the default root, otherwise `$DSH_AGENTS_HOME`.
 */
export declare function agentsHomeDisplay(resolvedHome: string): string;
//# sourceMappingURL=index.d.ts.map