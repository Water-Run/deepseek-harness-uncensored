/** Select a checksum shipped in the locked Electron npm package. */

/**
 * Require the exact target archive's SHA-256 before downloading or reusing a cache entry.
 * @param version Electron package version.
 * @param target Target operating system and architecture.
 * @param checksums Parsed checksums.json from that same installed package.
 * @returns One archive/checksum entry for @electron/get's normal integrity verification.
 */
export function electronArchiveChecksum(
  version: string, target: { platform: string; arch: string }, checksums: unknown,
): Record<string, string> {
  const name = `electron-v${version}-${target.platform}-${target.arch}.zip`
  const value: unknown = typeof checksums === 'object' && checksums !== null && Object.hasOwn(checksums, name)
    ? Reflect.get(checksums, name) : undefined
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/iu.test(value)) {
    throw new Error(`desktop runtime: Electron package has no valid SHA-256 for ${name}; reinstall the locked dependency`)
  }
  return { [name]: value }
}
