/**
 * Durable settings for the security-mode egress proxy, and the validation every
 * write passes before it reaches the file. The file holds no credential: the
 * upstream password lives in the credential store under
 * {@link PROXY_PASSWORD_REF} and is resolved per operation.
 * @module @deepseek-ai/dsh-security-proxy-local/settings
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type {
  SecurityProxyProtocol,
  SecurityProxySettings,
  SecurityProxySettingsPatch,
} from '@deepseek-ai/dsh-security-proxy/types'

/** Version of the settings document; a future incompatible layout bumps it. */
export const SETTINGS_VERSION = 1

/** Environment-style reference the upstream password is stored under. */
export const PROXY_PASSWORD_REF = 'DSH_SECURITY_PROXY_PASSWORD'

/** Stored settings lack the credential-presence flag, which is read from the credential store. */
export type StoredSettings = Omit<SecurityProxySettings, 'hasPassword'>

/** Defaults an absent file supplies: the feature is off and warns about nothing. */
export const DEFAULT_SETTINGS: StoredSettings = {
  enabled: false,
  protocol: 'http',
  host: '',
  port: 8080,
  authEnabled: false,
  username: '',
  warnWhenDisabled: false,
  capturePaused: false,
  maxFlows: 500,
  maxBodyBytes: 65_536,
  retentionMinutes: 1_440,
}

/** Bounds the settings surface and the capture store both enforce. */
export const SETTINGS_BOUNDS = {
  maxFlows: { min: 1, max: 5_000 },
  maxBodyBytes: { min: 1_024, max: 1_048_576 },
  retentionMinutes: { min: 1, max: 10_080 },
} as const

const protocol = z.enum(['http', 'https'])

const storedSettingsSchema = z.object({
  enabled: z.boolean(),
  protocol,
  host: z.string(),
  port: z.number().int().min(1).max(65_535),
  authEnabled: z.boolean(),
  username: z.string(),
  warnWhenDisabled: z.boolean(),
  capturePaused: z.boolean(),
  maxFlows: z.number().int().min(SETTINGS_BOUNDS.maxFlows.min).max(SETTINGS_BOUNDS.maxFlows.max),
  maxBodyBytes: z.number().int().min(SETTINGS_BOUNDS.maxBodyBytes.min).max(SETTINGS_BOUNDS.maxBodyBytes.max),
  retentionMinutes: z.number().int().min(SETTINGS_BOUNDS.retentionMinutes.min).max(SETTINGS_BOUNDS.retentionMinutes.max),
})

/** The persisted document's outer envelope, validated on load. */
const settingsFileSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  settings: storedSettingsSchema,
})

/** A value the settings surface rejected; the message names the field, never a secret. */
export class SettingsValidationError extends Error {
  override readonly name = 'SettingsValidationError'
}

/**
 * Validate one host/port pair as a usable upstream address.
 * @param host - candidate host name or IP literal.
 * @param port - candidate TCP port.
 * @throws {SettingsValidationError} when either half is unusable.
 */
export function assertUpstream(host: string, port: number): void {
  if (host.trim() === '') throw new SettingsValidationError('upstream host is required')
  if (/\s/.test(host)) throw new SettingsValidationError('upstream host must not contain whitespace')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new SettingsValidationError('upstream port must be an integer between 1 and 65535')
  }
}

/**
 * Merge one validated patch over the stored settings.
 * @param current - the settings in force.
 * @param patch - fields the owner changed; omitted fields keep their value.
 * @returns the next settings, valid by construction.
 * @throws {SettingsValidationError} when a supplied field is out of bounds.
 */
export function applyPatch(current: StoredSettings, patch: SecurityProxySettingsPatch): StoredSettings {
  const next: StoredSettings = {
    ...current,
    ...patch.enabled === undefined ? {} : { enabled: patch.enabled },
    ...patch.protocol === undefined ? {} : { protocol: patch.protocol },
    ...patch.host === undefined ? {} : { host: patch.host.trim() },
    ...patch.port === undefined ? {} : { port: patch.port },
    ...patch.authEnabled === undefined ? {} : { authEnabled: patch.authEnabled },
    ...patch.username === undefined ? {} : { username: patch.username },
    ...patch.warnWhenDisabled === undefined ? {} : { warnWhenDisabled: patch.warnWhenDisabled },
    ...patch.capturePaused === undefined ? {} : { capturePaused: patch.capturePaused },
    ...patch.maxFlows === undefined ? {} : { maxFlows: patch.maxFlows },
    ...patch.maxBodyBytes === undefined ? {} : { maxBodyBytes: patch.maxBodyBytes },
    ...patch.retentionMinutes === undefined ? {} : { retentionMinutes: patch.retentionMinutes },
  }
  if (next.protocol !== 'http' && next.protocol !== 'https') {
    throw new SettingsValidationError('upstream protocol must be http or https')
  }
  if (next.authEnabled && next.username.trim() === '') {
    throw new SettingsValidationError('authentication requires a user name')
  }
  assertBounds(next)
  if (next.enabled) assertUpstream(next.host, next.port)
  return next
}

/** Reject a complete settings value whose bounded numbers fall outside {@link SETTINGS_BOUNDS}. */
function assertBounds(settings: StoredSettings): void {
  for (const field of ['maxFlows', 'maxBodyBytes', 'retentionMinutes'] as const) {
    const { min, max } = SETTINGS_BOUNDS[field]
    const value = settings[field]
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new SettingsValidationError(`${field} must be an integer between ${String(min)} and ${String(max)}`)
    }
  }
}

/** The persisted document this store writes. */
interface SettingsDocument {
  readonly version: typeof SETTINGS_VERSION
  readonly settings: StoredSettings
}

/**
 * One settings file shared by every Agent this Host runs.
 *
 * Writes are serialized and atomic: a temporary sibling is written and renamed
 * over the target, so a crash leaves either the previous or the next document,
 * never a partial one. A load failure keeps the defaults in memory and reports
 * the diagnostic instead of taking the Host down.
 */
export class SettingsStore {
  private current: StoredSettings
  private writeChain: Promise<void> = Promise.resolve()
  private loadFailureDetail: string | null = null

  private constructor(
    private readonly path: string,
    initial: StoredSettings,
  ) {
    this.current = initial
  }

  /**
   * Open the settings file, falling back to defaults when it is absent.
   * @param path - absolute settings file path.
   * @returns the opened store; a malformed document is reported through {@link failure}.
   */
  static async open(path: string): Promise<SettingsStore> {
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new SettingsStore(path, { ...DEFAULT_SETTINGS })
      const store = new SettingsStore(path, { ...DEFAULT_SETTINGS })
      store.loadFailureDetail = `settings file is unreadable: ${String(error)}`
      return store
    }
    try {
      const parsed = settingsFileSchema.parse(JSON.parse(text) as unknown)
      return new SettingsStore(path, parsed.settings)
    } catch (error: unknown) {
      const store = new SettingsStore(path, { ...DEFAULT_SETTINGS })
      store.loadFailureDetail = `settings file is not a valid security proxy document: ${String(error)}`
      return store
    }
  }

  /** The settings in force. */
  get value(): StoredSettings {
    return this.current
  }

  /** Why the last load failed, or null when the document was readable. */
  get failure(): string | null {
    return this.loadFailureDetail
  }

  /**
   * Replace the settings and wait for the write to commit.
   * @param next - validated settings to persist.
   */
  async write(next: StoredSettings): Promise<void> {
    assertBounds(next)
    const document: SettingsDocument = { version: SETTINGS_VERSION, settings: next }
    const body = `${JSON.stringify(document, null, 2)}\n`
    const write = this.writeChain.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.tmp`
      await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.path)
      this.current = next
      this.loadFailureDetail = null
    })
    this.writeChain = write.catch(() => {
      // A failed write keeps the previous document; the caller receives the rejection
      // from `write` and the chain stays usable for the next attempt.
    })
    await write
  }
}

/** Narrow one protocol string from untrusted JSON; used by tests and the store. */
export function isProtocol(value: string): value is SecurityProxyProtocol {
  return value === 'http' || value === 'https'
}
