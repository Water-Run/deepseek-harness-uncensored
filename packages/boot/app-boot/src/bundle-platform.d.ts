/** Host operating-system admission for optional bundle layers. */
import { type HostEnvironmentFacts } from '@deepseek-ai/dsh-native-command';
/** A valid bundle declaration excludes the operating system running DSH. */
export declare class UnsupportedBundlePlatformError extends Error {
    /**
     * @param platforms Node platform names or `wsl` supported by the bundle.
     * @param platform Operating system of the DSH Host.
     */
    constructor(platforms: readonly string[], platform: string);
}
/**
 * Validate package metadata and reject an unsupported Host before selecting or composing a bundle.
 * @param platforms The optional `dsh.bundle.platforms` field read from package.json.
 * @param platform Operating system of the DSH Host, from Node's `process.platform`.
 * @param facts Environment and kernel facts used to admit `wsl` on a Linux Host.
 * @throws When the declaration is malformed or excludes the Host; omission allows every platform.
 */
export declare function assertBundlePlatform(platforms: unknown, platform: string, facts?: Omit<HostEnvironmentFacts, 'platform'>): void;
//# sourceMappingURL=bundle-platform.d.ts.map