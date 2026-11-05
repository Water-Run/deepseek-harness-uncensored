/** Independently reloadable local country data; losing it leaves target enforcement active. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { deadline } from '@deepseek-ai/dsh-timeout'
import schema from '@deepseek-ai/schemastery'
import { CountryDatabase, type CountryDatabaseStatus } from './country.ts'
import { TargetProtectionError } from '@deepseek-ai/dsh-target-protection'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { BUNDLED_COUNTRY_SOURCE } from './country-source.ts'
import { downloadCountry } from './country-download.ts'
import { readLocalSource } from './local-source.ts'

/** Deployment-owned local country source and resource bounds. */
export interface Config {
  /** Empty uses the pinned bundled DB-IP Lite database. */
  path?: string
  /** Maximum file and decompressed bytes, default 32 MiB. */
  maxBytes?: number
  /** Maximum database age in days, default 45. */
  maxAgeDays?: number
  /** Dedicated directory for owner-triggered updates of the bundled DB-IP source. */
  cacheDirectory?: string
  /** Download and validation deadline, default 60 seconds. */
  updateTimeoutMs?: number
}
type ResolvedConfig = Required<Config>

declare module '@deepseek-ai/cordis' {
  interface Context { /** Optional source of locally verified country records. */ targetCountryData: TargetCountryData }
  interface Events {
    /**
     * Invalidate operations using a country-data generation when it activates or is withdrawn.
     * @mode emit
     */
    'target-country/changed'(): void
  }
}

/** Country data is independent of the durable target-rule owner and never supplies a permissive fallback. */
export default class TargetCountryData extends Service {
  static Config: schema<Config, ResolvedConfig> = schema.object({
    path: schema.string().default(''), maxBytes: schema.natural().min(1024).max(268435456).default(33554432),
    maxAgeDays: schema.natural().min(1).max(366).default(45),
    cacheDirectory: schema.string().default(''), updateTimeoutMs: schema.natural().min(1).max(300000).default(60000),
  })
  private readonly config: ResolvedConfig
  private readonly lifetime = new AbortController()
  private database: CountryDatabase | undefined
  private readonly cachePath: string | undefined
  private updating: Promise<CountryDatabaseStatus> | undefined

  /**
   * @param ctx - Country-data provider owner.
   * @param config - Local database selection, size and age policy.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'targetCountryData')
    this.config = TargetCountryData.Config(config)
    if (this.config.path !== '' && this.config.cacheDirectory !== '') {
      throw new TargetProtectionError('invalid', 'An owner-provided country file cannot use the managed DB-IP cache.')
    }
    this.cachePath = this.config.cacheDirectory === '' ? undefined : join(resolve(this.config.cacheDirectory), 'dbip-country-lite.mmdb.gz')
    ctx.effect(() => async () => {
      this.lifetime.abort()
      if (this.updating !== undefined) await Promise.allSettled([this.updating])
      this.database = undefined
      this.notify()
    }, 'target-country-data.lifetime')
  }

  /** Validate and load data before the provider becomes available. */
  protected async [Service.init](): Promise<void> {
    const signal = this.lifetime.signal
    const bundled = await CountryDatabase.open(this.config, signal)
    const cached = this.cachePath === undefined ? undefined : await this.readCache(this.cachePath, signal)
    signal.throwIfAborted()
    this.database = cached !== undefined && cached.status(Date.now()).builtAt > bundled.status(Date.now()).builtAt ? cached : bundled
    this.notify()
  }

  private notify(): void {
    try { this.ctx.emit('target-country/changed') }
    catch (error) { this.ctx.logger.warn('A country data observer failed.', error) }
  }

  private async readCache(path: string, signal: AbortSignal): Promise<CountryDatabase | undefined> {
    try {
      const bytes = await readLocalSource(path, this.config.maxBytes, signal)
      const database = await CountryDatabase.decode(bytes, this.config, false, signal)
      const status = database.status(Date.now())
      if (status.databaseType !== 'DBIP-Country-Lite' || status.state === 'future') throw new Error('Unsupported cached country data.')
      return database
    } catch (error) {
      signal.throwIfAborted()
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        this.ctx.logger.warn('The managed DB-IP country cache could not be validated.')
      }
      return undefined
    }
  }

  /**
   * Report whether the Host can check for a managed DB-IP update.
   * @returns Whether this active provider has an owner-managed DB-IP cache.
   */
  canUpdate(): boolean { return this.cachePath !== undefined && this.database !== undefined && !this.lifetime.signal.aborted }

  /**
   * Acquire a newer official dataset and atomically replace the managed cache after validation.
   * @param caller - Owner request cancellation.
   * @returns Status of the currently accepted database, including when it is already current.
   */
  async update(caller: AbortSignal): Promise<CountryDatabaseStatus> {
    if (!this.canUpdate() || this.cachePath === undefined) {
      throw new TargetProtectionError('unavailable', 'Managed country updates are unavailable.')
    }
    if (this.updating !== undefined) throw new TargetProtectionError('busy', 'A country update is already running.')
    const signal = AbortSignal.any([caller, this.lifetime.signal])
    using bounded = deadline(signal, this.config.updateTimeoutMs, 'TARGET_COUNTRY_UPDATE_TIMEOUT')
    const operation = this.replaceCache(this.cachePath, bounded.signal)
    this.updating = operation
    try { return await operation }
    catch (error) {
      signal.throwIfAborted()
      if (error instanceof TargetProtectionError) throw error
      throw new TargetProtectionError(
        'unavailable', 'The DB-IP country update did not complete. Refresh to check the active data.', { cause: error },
      )
    } finally { this.updating = undefined }
  }

  private async replaceCache(path: string, signal: AbortSignal): Promise<CountryDatabaseStatus> {
    const { bytes, month } = await downloadCountry(Date.now(), this.config.maxBytes, signal)
    const candidate = await CountryDatabase.decode(bytes, this.config, false, signal)
    const status = candidate.status(Date.now())
    if (status.state !== 'ready' || status.databaseType !== 'DBIP-Country-Lite' || !status.builtAt.startsWith(`${month}-`)) {
      throw new TargetProtectionError('unavailable', 'DB-IP returned an unexpected or expired country database.')
    }
    signal.throwIfAborted()
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    return await withFileLock(path, async () => {
      const cached = await this.readCache(path, signal)
      const active = this.status()
      const cachedDate = cached?.status(Date.now()).builtAt ?? ''
      signal.throwIfAborted()
      if (status.builtAt > active.builtAt && status.builtAt > cachedDate) {
        await writeFileAtomic(path, bytes, { mode: 0o600 })
        this.database = candidate
        this.notify()
        return status
      }
      if (cached !== undefined && cachedDate > active.builtAt) {
        this.database = cached
        this.notify()
        return cached.status(Date.now())
      }
      return active
    }, { signal })
  }

  /**
   * Read current freshness and attribution for management and audit.
   * @returns The actual local source status; a disposed provider throws.
   */
  status(): CountryDatabaseStatus {
    if (this.database === undefined || this.lifetime.signal.aborted) throw new TargetProtectionError('unavailable', 'Country data is unavailable.')
    return this.database.status(Date.now())
  }

  /**
   * Identify the local source that guarded file executors must preserve.
   * @returns The configured or bundled source and, when present, the managed cache directory.
   */
  sourcePaths(): readonly string[] {
    const source = this.config.path ? resolve(this.config.path)
      : fileURLToPath(new URL(`./assets/${BUNDLED_COUNTRY_SOURCE.filename}`,
        import.meta.resolve('@deepseek-ai/dsh-target-protection/package.json')))
    return this.cachePath === undefined ? [source] : [source, dirname(this.cachePath)]
  }

  /**
   * Classify actual pinned addresses without a remote geolocation request.
   * @param addresses - Every address the transport may connect to.
   * @returns CN, outside or unknown; disposal and expired data return unknown.
   */
  mainland(addresses: readonly string[]): 'yes' | 'no' | 'unknown' {
    if (this.database === undefined || this.lifetime.signal.aborted) return 'unknown'
    return this.database.mainland(addresses, Date.now())
  }
}
