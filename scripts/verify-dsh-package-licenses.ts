/**
 * Preserve upstream MIT declarations and the explicit GPL declarations of DSHU modules.
 * @module scripts/verify-dsh-package-licenses
 */

import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DSH_PACKAGE_NAME = /^@deepseek-ai\/dsh(?:-|$)/
const FORK_MODULES = new Set([
  'packages/api/memory-controller/package.json',
  'packages/client/ui-security-proxy/package.json',
  'packages/client/ui-settings-memory/package.json',
  'packages/guard/security-proxy-local/package.json',
  'packages/guard/security-proxy/package.json',
  'packages/guard/spend-limit/package.json',
  'packages/guard/target-protection/package.json',
  'packages/mcp/rea/package.json',
  'packages/memory/memory/package.json',
  'packages/skill/skill-playbooks/package.json',
])

/** Result of checking every DSH package reachable through the root workspace list. */
export interface DshPackageLicenseReport {
  /** Number of DSH package manifests checked. */
  packageCount: number
  /** Repository-relative diagnostics for unexpected license declarations. */
  failures: string[]
}

function readManifest(root: string, file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`verify-dsh-package-licenses: ${file} must contain a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string')
}

function workspaceManifestPaths(root: string): string[] {
  const rootManifest = readManifest(root, 'package.json')
  const workspaces = rootManifest.workspaces
  if (!isStringArray(workspaces)) {
    throw new Error('verify-dsh-package-licenses: package.json workspaces must be a string array.')
  }

  const files = new Set(['package.json'])
  for (const pattern of workspaces) {
    for (const file of globSync(`${pattern}/package.json`, { cwd: root })) {
      files.add(file)
    }
  }
  return [...files].sort()
}

function printable(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

/**
 * Check every DSH npm package declared by the repository workspace.
 * @param root - absolute repository root containing the workspace package.json.
 * @returns the checked package count and every unexpected license declaration.
 */
export function inspectDshPackageLicenses(root: string): DshPackageLicenseReport {
  let packageCount = 0
  const failures: string[] = []
  const distribution = existsSync(resolve(root, 'product.json')) ? readManifest(root, 'product.json').license : 'MIT'
  if (distribution !== 'MIT' && distribution !== 'GPL-3.0-or-later') throw new Error('product.json: unsupported distribution license')

  for (const file of workspaceManifestPaths(root)) {
    const manifest = readManifest(root, file)
    const name = manifest.name
    if (typeof name !== 'string' || !DSH_PACKAGE_NAME.test(name)) continue

    packageCount++
    const normalizedFile = file.split(sep).join('/')
    const forkLicense = normalizedFile === 'package.json' || normalizedFile === 'apps/desktop/package.json' || FORK_MODULES.has(normalizedFile)
    const required = forkLicense ? distribution : 'MIT'
    if (manifest.license !== required) {
      failures.push(
        `${normalizedFile}: ${name} must declare "license": "${required}"; found ${printable(manifest.license)}.`,
      )
    }
  }

  return { packageCount, failures }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const report = inspectDshPackageLicenses(ROOT)
  if (report.failures.length > 0) {
    process.stderr.write('verify-dsh-package-licenses: unexpected DSH package license declarations found:\n')
    for (const failure of report.failures) process.stderr.write(`  ${failure}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(
      `verify-dsh-package-licenses: ${String(report.packageCount)} DSH package(s) match the distribution and upstream license policy.\n`,
    )
  }
}
