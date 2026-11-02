/** Installed production dependencies that standalone Node must read outside an archive. */
/**
 * Follow installed dependency resolution without executing packages.
 * @param staging - Prepared symlink-free Node project.
 * @param entries - Absolute entry package directories.
 * @param target - Distribution platform and architecture.
 * @param excluded - Dependencies selected separately by the caller.
 * @returns Sorted physical package directories; incomplete or outside dependencies reject.
 */
export function runtimePackageDirectories(
  staging: string, entries: string[], target: { platform: string; arch: string }, excluded?: string[],
): Promise<string[]>
