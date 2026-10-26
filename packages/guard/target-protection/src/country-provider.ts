/** Independently reloadable local country data; losing it leaves target enforcement active. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { CountryDatabase, type CountryDatabaseStatus } from './country.ts'
import { TargetProtectionError } from './errors.ts'

/** Deployment-owned local country source and resource bounds. */
export interface Config {
  /** Empty uses the pinned bundled DB-IP Lite database. */
  path?: string
  /** Maximum file and decompressed bytes, default 32 MiB. */
  maxBytes?: number
  /** Maximum database age in days, default 45. */
  maxAgeDays?: number
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
  })
  private readonly config: ResolvedConfig
  private readonly lifetime = new AbortController()
  private database: CountryDatabase | undefined

  /**
   * @param ctx - Country-data provider owner.
   * @param config - Local database selection, size and age policy.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'targetCountryData')
    this.config = TargetCountryData.Config(config)
    ctx.effect(() => () => {
      this.lifetime.abort(); this.database = undefined
      ctx.emit('target-country/changed')
    }, 'target-country-data.lifetime')
  }

  /** Validate and load data before the provider becomes available. */
  protected async [Service.init](): Promise<void> {
    const database = await CountryDatabase.open(this.config, this.lifetime.signal)
    this.lifetime.signal.throwIfAborted()
    this.database = database
    this.ctx.emit('target-country/changed')
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
   * Classify actual pinned addresses without a remote geolocation request.
   * @param addresses - Every address the transport may connect to.
   * @returns CN, outside or unknown; disposal and expired data return unknown.
   */
  mainland(addresses: readonly string[]): 'yes' | 'no' | 'unknown' {
    if (this.database === undefined || this.lifetime.signal.aborted) return 'unknown'
    return this.database.mainland(addresses, Date.now())
  }
}
