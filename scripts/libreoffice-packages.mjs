/** Locate the complete installed Office package closure used by standalone CLI processes. */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runtimePackageDirectories } from './runtime-package-closure.mjs'

/**
 * Require the declared native engine, or use WASM on other targets.
 * @param {{ optionalDependencies?: Record<string, string> }} manifest - Installed kit manifest.
 * @param {{ platform: string, arch: string }} target - Distribution platform and CPU.
 * @returns {string} Engine package suffix.
 */
export function selectOfficeEngine(manifest, target) {
  const native = `${target.platform}-${target.arch}`
  return Object.hasOwn(manifest.optionalDependencies ?? {}, `@deepseek-ai/libreoffice-kit-${native}`) ? native : 'wasm'
}

/**
 * Find every required package, retaining its installed dependency resolution and target engine.
 * @param {string} staging - Symlink-free installed Node project.
 * @param {{ platform: string, arch: string }} target - Distribution platform and CPU.
 * @returns {Promise<string[]>} Absolute package directories; rejects missing dependencies and paths outside staging.
 */
export async function officePackageDirectories(staging, target) {
  const entry = join(staging, 'node_modules', '@deepseek-ai', 'libreoffice-kit')
  const manifest = JSON.parse(await readFile(join(entry, 'package.json'), 'utf8'))
  const engineName = `@deepseek-ai/libreoffice-kit-${selectOfficeEngine(manifest, target)}`
  const engines = Object.keys(manifest.optionalDependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/libreoffice-kit-'))
  const packages = await runtimePackageDirectories(staging, [entry], target, engines)
  const engineDirectory = join(staging, 'node_modules', engineName)
  if (!existsSync(engineDirectory)) throw new Error(`Office engine ${engineName} required for ${target.platform}/${target.arch} is missing.`)
  const engine = await runtimePackageDirectories(staging, [engineDirectory], target, engines)
  return [...new Set([...packages, ...engine])].sort()
}
