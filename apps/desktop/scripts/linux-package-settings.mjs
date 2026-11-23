/** Resolve Linux packaging worker concurrency and installer formats. */

/**
 * List the installer formats one Linux architecture publishes.
 * RPM ships with the x64 release only; the arm64 release publishes the Debian package and the portable tar.
 * @param {string} arch Linux payload architecture.
 * @returns {readonly ('deb' | 'rpm' | 'tar.gz')[]} Formats electron-builder builds for this architecture.
 */
export function linuxPackageFormats(arch) {
  if (arch === 'x64') return ['deb', 'rpm', 'tar.gz']
  if (arch === 'arm64') return ['deb', 'tar.gz']
  throw new Error(`desktop package: unsupported Linux architecture ${String(arch)}`)
}

/**
 * Validate the package preparation limit without platform signing settings.
 * @param {NodeJS.ProcessEnv} environment Loaded Linux packaging settings.
 * @returns {{packConcurrency: number}} Package workers, defaulting to four.
 */
export function resolveLinuxPackageSettings(environment) {
  const value = environment.DSH_DESKTOP_LINUX_PACK_CONCURRENCY ?? '4'
  if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error('desktop package: DSH_DESKTOP_LINUX_PACK_CONCURRENCY must be a positive integer')
  }
  return { packConcurrency: Number(value) }
}
