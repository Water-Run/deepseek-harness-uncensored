/** Physical Stagehand resources passed to Chrome outside Electron's archive reader. */
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { runtimeArchivePath } from './runtime-archive.ts'

/**
 * Locate the shipped extension on the real filesystem for Stagehand's SDK.
 * Prepared runtimes retain the SDK's ordinary package-relative lookup.
 * @param runtimeDir - Prepared or ASAR-contained Desktop runtime.
 * @returns Explicit SDK environment for an archived runtime, or an empty overlay.
 * @throws When the archived installation lacks its physical extension manifest.
 */
export function stagehandExtensionEnvironment(runtimeDir: string): Readonly<Record<string, string>> {
  const archive = runtimeArchivePath(runtimeDir)
  if (archive === undefined) return {}
  const directory = join(`${archive}.unpacked`, 'dsh', 'node_modules', '@browserbasehq', 'stagehand', 'dist', 'extension')
  if (!statSync(join(directory, 'manifest.json')).isFile()) {
    throw new Error('Desktop Stagehand extension manifest is not a file')
  }
  return { STAGEHAND_EXTENSION_DIRECTORY_PATH: directory }
}
