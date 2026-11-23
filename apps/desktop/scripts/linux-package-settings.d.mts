/**
 * List the installer formats one Linux architecture publishes.
 * RPM ships with the x64 release only; the arm64 release publishes the Debian package and the portable tar.
 * @param arch Linux payload architecture.
 * @returns Formats electron-builder builds for this architecture.
 */
export function linuxPackageFormats(arch: string): readonly ('deb' | 'rpm' | 'tar.gz')[]

/**
 * Validate Linux package preparation concurrency.
 * @param environment Loaded Linux packaging settings.
 * @returns Positive package worker count, defaulting to four.
 */
export function resolveLinuxPackageSettings(environment: NodeJS.ProcessEnv): { packConcurrency: number }
