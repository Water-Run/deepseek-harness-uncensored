/** Build-time selection of the pinned engine without its unused Worker-client bootstrap. */

/**
 * Keep the upstream engine and its notices, omitting the separate Worker API client.
 * @param source - Browser ESM shipped by the pinned sqlite-wasm dependency.
 * @returns Standalone engine module with the same default initializer.
 * @throws When upstream region or export markers change and need review.
 */
export function sqliteCore(source: string): string {
  const boundary = '//#region src/bin/sqlite3-worker1-promiser.mjs'
  const parts = source.split(boundary)
  const core = parts[0]
  if (parts.length !== 2 || core === undefined || !core.startsWith('//#region src/bin/sqlite3-bundler-friendly.mjs')
    || !core.includes('var sqlite3_bundler_friendly_default = sqlite3InitModule$1;')) {
    throw new Error('sqlite-wasm browser entry changed; review the engine-only bundle before building')
  }
  return `${core}\nexport default sqlite3_bundler_friendly_default;\n`
}
