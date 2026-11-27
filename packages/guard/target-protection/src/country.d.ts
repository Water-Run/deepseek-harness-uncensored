/** Deployment input resolved before opening a database. */
export interface CountryDatabaseOptions {
    /** Empty selects the bundled compressed database; otherwise a trusted local MMDB or gzip file. */
    path: string;
    /** Maximum compressed and decompressed size. */
    maxBytes: number;
    /** Maximum accepted age relative to the database's embedded build timestamp. */
    maxAgeDays: number;
}
/** Data identity and attribution, suitable for an owner-facing status page. */
export interface CountryDatabaseStatus {
    state: 'ready' | 'expired' | 'future';
    databaseType: string;
    builtAt: string;
    sha256: string;
    bundled: boolean;
    attribution: string;
    attributionUrl: string;
}
/** Immutable local country dataset; lookup never sends an address to an external API. */
export declare class CountryDatabase {
    private readonly reader;
    private readonly options;
    private readonly sha256;
    private readonly bundled;
    private constructor();
    /**
     * Open and validate one local database, verifying pinned bytes for the bundled copy.
     * @param options - Explicit file selection, bounds and freshness policy.
     * @param signal - Cancels acquisition; a native decompression may finish unused.
     * @returns An owned reader over immutable bytes, or a visible unavailable-data failure.
     */
    static open(options: CountryDatabaseOptions, signal: AbortSignal): Promise<CountryDatabase>;
    /**
     * Validate a complete, bounded country archive before it can be published.
     * @param source - Acquired MMDB bytes or gzip archive.
     * @param options - Configured size and freshness policy.
     * @param bundled - Verify the pinned digest for distribution data.
     * @param signal - Cancels after native decompression settles.
     * @returns A reader over validated data and its content digest.
     */
    static decode(source: Buffer, options: CountryDatabaseOptions, bundled: boolean, signal: AbortSignal): Promise<CountryDatabase>;
    /**
     * Describe the actual data and whether it is fresh at the supplied time.
     * @param nowMs - Current UTC time from the execution owner.
     * @returns Status and attribution; expired or future data must not authorize an unmarked target.
     */
    status(nowMs: number): CountryDatabaseStatus;
    /**
     * Classify pinned addresses, treating partial coverage as unknown.
     * @param addresses - The transport's actual connection address set.
     * @param nowMs - Current UTC time from the execution owner.
     * @returns Mainland, outside, or unknown; CN wins over mixed or unknown answers.
     */
    mainland(addresses: readonly string[], nowMs: number): 'yes' | 'no' | 'unknown';
}
//# sourceMappingURL=country.d.ts.map