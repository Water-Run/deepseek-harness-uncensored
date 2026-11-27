/**
 * Durable settings for the security-mode egress proxy, and the validation every
 * write passes before it reaches the file. The file holds no credential: the
 * upstream password lives in the credential store under
 * {@link PROXY_PASSWORD_REF} and is resolved per operation.
 * @module @deepseek-ai/dsh-security-proxy-local/settings
 */
import type { SecurityProxyProtocol, SecurityProxySettings, SecurityProxySettingsPatch } from '@deepseek-ai/dsh-security-proxy/types';
/** Version of the settings document; a future incompatible layout bumps it. */
export declare const SETTINGS_VERSION = 1;
/** Environment-style reference the upstream password is stored under. */
export declare const PROXY_PASSWORD_REF = "DSH_SECURITY_PROXY_PASSWORD";
/** Stored settings lack the credential-presence flag, which is read from the credential store. */
export type StoredSettings = Omit<SecurityProxySettings, 'hasPassword'>;
/** Defaults an absent file supplies: the feature is off and warns about nothing. */
export declare const DEFAULT_SETTINGS: StoredSettings;
/** Bounds the settings surface and the capture store both enforce. */
export declare const SETTINGS_BOUNDS: {
    readonly maxFlows: {
        readonly min: 1;
        readonly max: 5000;
    };
    readonly maxBodyBytes: {
        readonly min: 1024;
        readonly max: 4194304;
    };
    readonly retentionMinutes: {
        readonly min: 1;
        readonly max: 10080;
    };
};
/** A value the settings surface rejected; the message names the field, never a secret. */
export declare class SettingsValidationError extends Error {
    readonly name = "SettingsValidationError";
}
/**
 * Validate one host/port pair as a usable upstream address.
 * @param host - candidate host name or IP literal.
 * @param port - candidate TCP port.
 * @throws {SettingsValidationError} when either half is unusable.
 */
export declare function assertUpstream(host: string, port: number): void;
/**
 * Merge one validated patch over the stored settings.
 * @param current - the settings in force.
 * @param patch - fields the owner changed; omitted fields keep their value.
 * @returns the next settings, valid by construction.
 * @throws {SettingsValidationError} when a supplied field is out of bounds.
 */
export declare function applyPatch(current: StoredSettings, patch: SecurityProxySettingsPatch): StoredSettings;
/**
 * One settings file shared by every Agent this Host runs.
 *
 * Writes are serialized and atomic: a temporary sibling is written and renamed
 * over the target, so a crash leaves either the previous or the next document,
 * never a partial one. A load failure keeps the defaults in memory and reports
 * the diagnostic instead of taking the Host down.
 */
export declare class SettingsStore {
    private readonly path;
    private current;
    private writeChain;
    private loadFailureDetail;
    private constructor();
    /**
     * Open the settings file, falling back to defaults when it is absent.
     * @param path - absolute settings file path.
     * @returns the opened store; a malformed document is reported through {@link failure}.
     */
    static open(path: string): Promise<SettingsStore>;
    /** The settings in force. */
    get value(): StoredSettings;
    /** Why the last load failed, or null when the document was readable. */
    get failure(): string | null;
    /**
     * Replace the settings and wait for the write to commit.
     * @param next - validated settings to persist.
     */
    write(next: StoredSettings): Promise<void>;
}
/**
 * Whether a raw string names one supported upstream transport.
 * @param value - candidate transport name.
 * @returns true for http or https.
 */
export declare function isProtocol(value: string): value is SecurityProxyProtocol;
//# sourceMappingURL=settings.d.ts.map