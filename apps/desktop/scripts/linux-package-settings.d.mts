/**
 * Validate Linux package preparation concurrency.
 * @param environment Loaded Linux packaging settings.
 * @returns Positive package worker count, defaulting to four.
 */
export function resolveLinuxPackageSettings(environment: NodeJS.ProcessEnv): { packConcurrency: number }
