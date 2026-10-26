/** Local MMDB country classification with integrity, format and freshness checks. @module */
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { Reader, type CountryResponse } from 'mmdb-lib'
import { z } from 'zod'
import { BUNDLED_COUNTRY_SOURCE } from './country-source.ts'
import { canonicalTargetHost } from './rules.ts'
import { TargetProtectionError } from './errors.ts'
import { readLocalSource } from './local-source.ts'

/** Deployment input resolved before opening a database. */
export interface CountryDatabaseOptions {
  /** Empty selects the bundled compressed database; otherwise a trusted local MMDB or gzip file. */
  path: string
  /** Maximum compressed and decompressed size. */
  maxBytes: number
  /** Maximum accepted age relative to the database's embedded build timestamp. */
  maxAgeDays: number
}

/** Data identity and attribution, suitable for an owner-facing status page. */
export interface CountryDatabaseStatus {
  state: 'ready' | 'expired' | 'future'
  databaseType: string
  builtAt: string
  sha256: string
  bundled: boolean
  attribution: string
  attributionUrl: string
}

const countryRecord = z.object({ country: z.object({ iso_code: z.string().regex(/^[A-Z]{2}$/u) }) })
const decompress = promisify(gunzip)

/** Immutable local country dataset; lookup never sends an address to an external API. */
export class CountryDatabase {
  private constructor(
    private readonly reader: Reader<CountryResponse>,
    private readonly options: CountryDatabaseOptions,
    private readonly sha256: string,
    private readonly bundled: boolean,
  ) {}

  /**
   * Open and validate one local database, verifying pinned bytes for the bundled copy.
   * @param options - Explicit file selection, bounds and freshness policy.
   * @param signal - Cancels acquisition; a native decompression may finish unused.
   * @returns An owned reader over immutable bytes, or a visible unavailable-data failure.
   */
  static async open(options: CountryDatabaseOptions, signal: AbortSignal): Promise<CountryDatabase> {
    const bundled = options.path === ''
    const path = bundled
      ? new URL(`./assets/${BUNDLED_COUNTRY_SOURCE.filename}`, import.meta.resolve('@deepseek-ai/dsh-target-protection/package.json'))
      : options.path
    try {
      const source = await readLocalSource(path, options.maxBytes, signal)
      if (bundled && createHash('sha256').update(source).digest('hex') !== BUNDLED_COUNTRY_SOURCE.compressedSha256) {
        throw new TargetProtectionError('unavailable', 'Bundled country archive failed its integrity check.')
      }
      const bytes = source[0] === 0x1f && source[1] === 0x8b
        ? await decompress(source, { maxOutputLength: options.maxBytes }) : source
      signal.throwIfAborted()
      const hash = createHash('sha256').update(bytes).digest('hex')
      if (bundled && hash !== BUNDLED_COUNTRY_SOURCE.sha256) throw new TargetProtectionError('unavailable', 'Country database failed its integrity check.')
      const reader = new Reader<CountryResponse>(bytes)
      if (reader.metadata.binaryFormatMajorVersion !== 2 || !reader.metadata.databaseType.includes('Country')
        || !Number.isFinite(reader.metadata.buildEpoch.getTime())) {
        throw new TargetProtectionError('unavailable', 'Unsupported country database format.')
      }
      return new CountryDatabase(reader, { ...options }, hash, bundled)
    } catch (error) {
      if (error instanceof TargetProtectionError) throw error
      throw new TargetProtectionError('unavailable', 'Country data could not be loaded.', { cause: error })
    }
  }

  /**
   * Describe the actual data and whether it is fresh at the supplied time.
   * @param nowMs - Current UTC time from the execution owner.
   * @returns Status and attribution; expired or future data must not authorize an unmarked target.
   */
  status(nowMs: number): CountryDatabaseStatus {
    const built = this.reader.metadata.buildEpoch.getTime()
    const state = nowMs < built ? 'future' : nowMs - built > this.options.maxAgeDays * 86400000 ? 'expired' : 'ready'
    const dbip = this.reader.metadata.databaseType.startsWith('DBIP-')
    return { state, databaseType: this.reader.metadata.databaseType, builtAt: this.reader.metadata.buildEpoch.toISOString(),
      sha256: this.sha256, bundled: this.bundled,
      attribution: dbip ? BUNDLED_COUNTRY_SOURCE.attribution : 'Owner-provided country data',
      attributionUrl: dbip ? BUNDLED_COUNTRY_SOURCE.attributionUrl : '',
    }
  }

  /**
   * Classify pinned addresses, treating partial coverage as unknown.
   * @param addresses - The transport's actual connection address set.
   * @param nowMs - Current UTC time from the execution owner.
   * @returns Mainland, outside, or unknown; CN wins over mixed or unknown answers.
   */
  mainland(addresses: readonly string[], nowMs: number): 'yes' | 'no' | 'unknown' {
    if (this.status(nowMs).state !== 'ready' || addresses.length === 0) return 'unknown'
    let unknown = false
    for (const address of addresses) {
      const ip = canonicalTargetHost(address)
      if (!isIP(ip)) { unknown = true; continue }
      const record = countryRecord.safeParse(this.reader.get(ip))
      if (!record.success) { unknown = true; continue }
      if (record.data.country.iso_code === 'CN') return 'yes'
    }
    return unknown ? 'unknown' : 'no'
  }
}
