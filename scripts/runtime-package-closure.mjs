/** Locate installed production dependencies that must remain readable by standalone Node. */
import { existsSync } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, sep } from 'node:path'

/**
 * Follow installed dependency resolution without evaluating package code or requiring package.json exports.
 * @param {string} staging - Prepared symlink-free Node project.
 * @param {string[]} entries - Absolute entry package directories.
 * @param {{ platform: string, arch: string }} target - Distribution platform and CPU.
 * @param {string[]} excluded - Dependencies explicitly selected and supplied separately by the caller.
 * @returns {Promise<string[]>} Sorted physical package directories; required missing or outside packages reject.
 */
export async function runtimePackageDirectories(staging, entries, target, excluded = []) {
  const root = await realpath(staging)
  const packages = new Set()
  const ignored = new Set(excluded)
  async function visit(directory) {
    const physical = await realpath(directory)
    const suffix = relative(root, physical)
    if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`)) {
      throw new Error(`Runtime dependency is outside the deployed closure: ${directory}`)
    }
    if (packages.has(physical)) return
    const manifestPath = join(physical, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    packages.add(physical)
    const require = createRequire(manifestPath)
    for (const name of new Set([...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})])) {
      if (ignored.has(name)) continue
      const optional = manifest.optionalDependencies?.[name] !== undefined || manifest.peerDependenciesMeta?.[name]?.optional === true
      const dependency = (require.resolve.paths(name) ?? []).map(path => join(path, name))
        .find(path => existsSync(path))
      if (dependency === undefined) {
        if (optional) continue
        throw new Error(`Runtime dependency ${name} required by ${manifest.name} is missing.`)
      }
      if (optional) {
        const metadata = JSON.parse(await readFile(join(dependency, 'package.json'), 'utf8'))
        if (!supports(metadata.os, target.platform) || !supports(metadata.cpu, target.arch)) continue
      }
      await visit(dependency)
    }
  }
  for (const entry of entries) await visit(entry)
  return [...packages].sort()
}

/** @param {string[] | undefined} values - npm selectors. @param {string} value - Target. @returns {boolean} Target compatibility. */
function supports(values, value) {
  return values === undefined || (!values.includes(`!${value}`)
    && (values.every(item => item.startsWith('!')) || values.includes(value) || values.includes('any')))
}
