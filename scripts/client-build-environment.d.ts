/** Non-public selector used by build orchestration to request a named client profile. */
export declare const CLIENT_BUILD_PROFILE_SELECTOR = "DSH_BUILD_CLIENT_PROFILE";
/** Repository-relative path of the complete client build record. */
export declare const CLIENT_BUILD_RECORD_PATH = ".dsh-build/client-build-environment.json";
/** Public values embedded in one set of client artifacts. */
export type ClientBuildEnvironment = Readonly<Record<string, string>>;
/**
 * Resolve the short source commit used by browser build metadata.
 * @param root - repository root used when no explicit value is supplied.
 * @param environment - environment that may already carry a commit value.
 * @returns lowercase 7-character Git commit prefix.
 */
export declare function repositoryCommitHash(root: string, environment?: NodeJS.ProcessEnv): string;
/**
 * Resolve the repository package version used by browser build metadata.
 * @param root - repository root containing the authoritative package.json.
 * @returns the repository's semver-compatible package version.
 */
export declare function repositoryVersion(root: string): string;
/**
 * Read whether Git reports any staged, unstaged, untracked, or submodule change.
 * @param root - repository root whose worktree is inspected.
 * @returns true or false inside a Git worktree; undefined without Git metadata.
 */
export declare function repositoryGitDirty(root: string): boolean | undefined;
/**
 * Resolve the public environment for a complete default build from one checkout.
 * Repository-owned metadata replaces inherited values; other public values pass through.
 * @param root - repository root supplying version and Git metadata.
 * @param environment - caller environment supplying optional commit and public extensions.
 * @returns complete public client environment for the default build.
 */
export declare function repositoryClientBuildEnvironment(root: string, environment?: NodeJS.ProcessEnv): ClientBuildEnvironment;
/**
 * Resolve the exact public values required by an official build at one commit.
 * @param root - repository root whose HEAD must match the built source.
 * @param environment - optional explicit commit source for non-Git build environments.
 * @returns complete official client environment.
 */
export declare function officialClientBuildEnvironment(root: string, environment?: NodeJS.ProcessEnv): Readonly<Record<`DSH_CLIENT_${string}`, string>>;
/** Digest of every client artifact produced by the complete root build. */
interface ClientArtifactDigest {
    /** Number of files covered by the digest. */
    readonly fileCount: number;
    /** Lowercase SHA-256 digest of sorted paths and file contents. */
    readonly sha256: string;
}
/** Durable description of one complete root client build. */
export interface ClientBuildRecord {
    /** Record schema version. */
    readonly formatVersion: number;
    /** Exact public environment embedded by Vite and tsdown. */
    readonly environment: ClientBuildEnvironment;
    /** Digest that binds the environment to the current artifacts. */
    readonly artifacts: ClientArtifactDigest;
}
/**
 * Resolve the exact public environment selected for a complete client build.
 * Named profiles discard inherited public overrides. Local builds retain the supplied
 * commit, version, and true dirty marker; repositoryClientBuildEnvironment supplies that metadata.
 * @param environment - parent process environment.
 * @param profile - explicit profile, or the non-public selector when omitted.
 * @returns the inherited public values when no profile is selected, otherwise the named profile.
 */
export declare function resolveClientBuildEnvironment(environment: NodeJS.ProcessEnv, profile?: string | undefined): ClientBuildEnvironment;
/**
 * Construct a subprocess environment containing exactly the selected public values.
 * @param environment - parent process environment.
 * @param clientEnvironment - complete public environment selected for the build.
 * @returns the parent environment with selectors and inherited public values replaced.
 */
export declare function clientBuildProcessEnvironment(environment: NodeJS.ProcessEnv, clientEnvironment: ClientBuildEnvironment): NodeJS.ProcessEnv;
/**
 * Require the public client environment to match an artifact profile exactly.
 *
 * An exact key set matters because every prefixed value is eligible for
 * inlining: an unexpected variable can change published bytes just as surely
 * as a missing or incorrect required value.
 *
 * @param environment - public environment from a build process or build record.
 * @param expected - complete public client environment for the artifact profile.
 */
export declare function assertClientBuildEnvironment(environment: Readonly<Record<string, string | undefined>>, expected: Readonly<Record<`DSH_CLIENT_${string}`, string>>): void;
/**
 * Create bundler substitutions for public client build environment variables.
 *
 * The empty `process.env` fallback makes an unset static property read
 * evaluate to `undefined` without providing a browser `process` global.
 * Exact substitutions remain longer matches than that fallback. Dynamic
 * property reads and enumeration deliberately observe the empty object.
 *
 * @param environment - environment inherited by the build process.
 * @returns deterministic Vite/tsdown `define` expressions.
 */
export declare function clientBuildEnvironmentDefines(environment: NodeJS.ProcessEnv): Record<string, string>;
/**
 * Create Node-face substitutions that fix each public client build value into the artifact.
 * `process.env` itself stays untouched, so Host code keeps reading its other variables at runtime.
 * @param environment - environment inherited by the build process.
 * @returns one deterministic tsdown `define` expression per public value the build sets.
 */
export declare function clientBuildValueDefines(environment: NodeJS.ProcessEnv): Record<string, string>;
/**
 * Write the build record after a complete root build succeeds.
 * @param root - repository root containing the generated artifacts.
 * @param environment - exact public environment supplied to both bundlers.
 * @returns the record written to disk.
 */
export declare function writeClientBuildRecord(root: string, environment: ClientBuildEnvironment): ClientBuildRecord;
/**
 * Read a complete build record and prove it still describes the current artifacts.
 * @param root - repository root containing the record and generated artifacts.
 * @param expected - optional exact public environment required by a consumer.
 * @returns the parsed and artifact-verified record.
 */
export declare function readClientBuildRecord(root: string, expected?: Readonly<Record<`DSH_CLIENT_${string}`, string>>): ClientBuildRecord;
export {};
//# sourceMappingURL=client-build-environment.d.ts.map