/**
 * Shared filesystem path helpers for DeepSeek Harness user data.
 *
 * @module @deepseek-ai/dsh-home-paths
 */
import { lstat, opendir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
/** Directory name for the default DeepSeek Harness home under the OS home. */
export const DSH_HOME_DIR_NAME = '.dsh-uncensored';
/** Stable user-facing display form for the default DeepSeek Harness home. */
export const DEFAULT_DSH_HOME_DISPLAY = `~/${DSH_HOME_DIR_NAME}`;
/** Environment variable that overrides the default DeepSeek Harness home. */
export const DSH_HOME_ENV = 'DSH_HOME';
/** Directory name for the default shared agent configuration root under the OS home. */
export const AGENTS_HOME_DIR_NAME = '.agents';
/** Stable user-facing display form for the default shared agent configuration root. */
export const DEFAULT_AGENTS_HOME_DISPLAY = `~/${AGENTS_HOME_DIR_NAME}`;
/** Environment variable that overrides the default shared agent configuration root. */
export const AGENTS_HOME_ENV = 'DSH_AGENTS_HOME';
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
export async function canonicalizeWatchPath(path) {
    return canonicalizePath(path, false);
}
async function canonicalizePath(path, requireResolvableLinks) {
    let current = resolve(path);
    const missing = [];
    while (true) {
        try {
            const canonical = await realpath(current);
            if (missing.length > 0) {
                // A Windows file-as-parent probe reports ENOENT. Opening the resolved
                // ancestor preserves the cross-platform directory requirement.
                const directory = await opendir(canonical);
                await directory.close();
            }
            return join(canonical, ...missing.reverse());
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
            if (requireResolvableLinks) {
                const existing = await lstat(current).catch((statError) => {
                    if (!(statError instanceof Error) || !('code' in statError) || statError.code !== 'ENOENT')
                        throw statError;
                    return undefined;
                });
                if (existing !== undefined)
                    throw error;
            }
            const parent = dirname(current);
            /* v8 ignore next -- a filesystem root exists, so traversal resolves before this guard */
            if (parent === current)
                throw error;
            missing.push(basename(current));
            current = parent;
        }
    }
}
/**
 * Reject overlap with the official DeepSeek Harness home before a launcher writes data.
 * @param home - resolved DSHU home selected for this launch.
 * @param officialHome - official home to protect, defaulting to the OS home followed by `.dsh`.
 * @throws if either directory contains the other, including through existing links, or an existing link cannot be resolved.
 */
export async function assertSeparateDshHome(home, officialHome = join(homedir(), '.dsh')) {
    const overlaps = (first, second) => containsPath(first, second) || containsPath(second, first);
    if (!overlaps(resolve(home), resolve(officialHome))) {
        const [selected, official] = await Promise.all([canonicalizePath(home, true), canonicalizePath(officialHome, true)]);
        if (!overlaps(selected, official))
            return;
    }
    throw new Error('DSHU data directory overlaps the official DeepSeek Harness home.');
}
function containsPath(directory, path) {
    const offset = relative(directory, path);
    return !isAbsolute(offset) && offset !== '..' && !offset.startsWith(`..${sep}`);
}
/**
 * Resolve the default DeepSeek Harness home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
export function defaultDshHome() {
    return join(homedir(), DSH_HOME_DIR_NAME);
}
/**
 * Resolve the default shared agent configuration root using Node's platform path rules.
 * @returns the absolute default shared agent configuration root.
 */
export function defaultAgentsHome() {
    return join(homedir(), AGENTS_HOME_DIR_NAME);
}
/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export function expandHomePath(path) {
    if (path === '~')
        return homedir();
    if (path.startsWith('~/') || path.startsWith('~\\'))
        return join(homedir(), path.slice(2));
    return path;
}
/**
 * Resolve one user-data root from an explicit path, an environment override, and a default.
 * @param configured - explicit path, which has highest precedence.
 * @param env - environment mapping to read.
 * @param envName - environment variable that overrides the default.
 * @param fallback - default root, used when neither the explicit path nor the environment provides one.
 * @returns the normalized absolute root.
 */
function resolveRoot(configured, env, envName, fallback) {
    const fromEnv = env[envName];
    const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : fallback());
    return resolve(expandHomePath(selected));
}
/**
 * Label one resolved user-data root symbolically for user-facing display.
 * @param resolvedRoot - absolute path returned by the matching resolver.
 * @param defaultRoot - absolute default root whose symbolic label applies to a match.
 * @param defaultLabel - symbolic label for the default root.
 * @param envName - environment variable name that labels any other root.
 * @returns the symbolic label.
 */
function rootDisplay(resolvedRoot, defaultRoot, defaultLabel, envName) {
    return resolvedRoot === resolve(defaultRoot) ? defaultLabel : `$${envName}`;
}
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
export function resolveDshHome(configured, env = process.env) {
    if (configured !== undefined)
        return resolve(expandHomePath(configured));
    const dedicated = env.DSH_UNCENSORED_HOME;
    if (dedicated !== undefined && dedicated.trim() !== '')
        return resolve(expandHomePath(dedicated));
    const inherited = env[DSH_HOME_ENV];
    if (inherited !== undefined && resolve(expandHomePath(inherited)) === resolve(homedir(), '.dsh')) {
        return defaultDshHome();
    }
    return resolveRoot(undefined, env, DSH_HOME_ENV, defaultDshHome);
}
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
export function resolveAgentsHome(configured, env = process.env) {
    return resolveRoot(configured, env, AGENTS_HOME_ENV, defaultAgentsHome);
}
/**
 * Join path segments onto the resolved DeepSeek Harness home. It addresses the
 * existing top-level entries; a new path uses {@link dshPath} with its category.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
export function dshHomePath(...segments) {
    return join(resolveDshHome(), ...segments);
}
/**
 * Join path segments onto the resolved Harness home's `cache` directory without creating it; no arguments returns the directory itself.
 * @param optionsOrSegment - explicit home override, or the first path segment; omission uses the default home resolution.
 * @param segments - additional path segments after the first child, if any.
 * @returns the normalized absolute cache path.
 */
export function dshCachePath(optionsOrSegment = {}, ...segments) {
    if (typeof optionsOrSegment === 'string')
        return dshPath('cache', optionsOrSegment, ...segments);
    return dshPath({ category: 'cache', dshHome: optionsOrSegment.dshHome }, ...segments);
}
/**
 * Join path segments onto one category directory of the Harness home without
 * creating it. An owner passes its own directory name, normally its package
 * name without the `@deepseek-ai/dsh-` prefix, as the first segment.
 * @param location - category under the resolved home, or a category with an explicit home override.
 * @param segments - path segments appended to the category directory; an empty list returns the directory itself.
 * @returns the normalized absolute path.
 */
export function dshPath(location, ...segments) {
    const { category, dshHome } = typeof location === 'string' ? { category: location, dshHome: undefined } : location;
    return join(resolveDshHome(dshHome), category, ...segments);
}
/**
 * Describe a resolved harness home symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default home is labelled
 * `~/.dsh`, and any configured home is labelled `$DSH_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveDshHome}.
 * @returns `~/.dsh` for the default home, otherwise `$DSH_HOME`.
 */
export function dshHomeDisplay(resolvedHome) {
    return rootDisplay(resolvedHome, defaultDshHome(), DEFAULT_DSH_HOME_DISPLAY, DSH_HOME_ENV);
}
/**
 * Describe a resolved shared agent configuration root symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default root is labelled
 * `~/.agents`, and any configured root is labelled `$DSH_AGENTS_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveAgentsHome}.
 * @returns `~/.agents` for the default root, otherwise `$DSH_AGENTS_HOME`.
 */
export function agentsHomeDisplay(resolvedHome) {
    return rootDisplay(resolvedHome, defaultAgentsHome(), DEFAULT_AGENTS_HOME_DISPLAY, AGENTS_HOME_ENV);
}
//# sourceMappingURL=index.js.map