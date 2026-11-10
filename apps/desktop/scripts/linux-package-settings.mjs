/** Resolve Linux packaging worker concurrency. */

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
