/** Resolve the packaged product identity before preparing its CLI and runtime payloads. */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { valid } from 'semver'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { parseDesktopRelease, type DesktopRelease } from '../src/release.ts'
import { resolveDesktopBuildVersion } from './desktop-build-version.mjs'

function manifestVersion(path: string, subject: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error(`desktop runtime: ${subject} has no version`)
  return manifest.version
}

/**
 * Read the selected build version, falling back to the package version outside packaging.
 * @param appRoot - Desktop package directory.
 * @param environment - Build environment supplied to the preparation stage.
 * @returns Product version encoded for manifests and update comparisons.
 */
export function readPreparedProductVersion(appRoot: string, environment: NodeJS.ProcessEnv): string {
  return resolveDesktopBuildVersion(environment, manifestVersion(join(appRoot, 'package.json'), 'desktop package'))
}

/**
 * Verify that the build's engine version matches the upstream identity shown in About.
 * @param appRoot - Desktop package directory under the repository's apps directory.
 * @returns The root DSH package version used to select the CLI and Host payloads.
 */
export function readPreparedEngineVersion(appRoot: string): string {
  const repository = resolve(appRoot, '..', '..')
  const engineVersion = manifestVersion(join(repository, 'package.json'), 'root dsh package')
  const product: unknown = JSON.parse(readFileSync(join(repository, 'product.json'), 'utf8'))
  if (valid(engineVersion) === null || typeof product !== 'object' || product === null
    || !('upstreamVersion' in product) || product.upstreamVersion !== engineVersion) {
    throw new Error('desktop runtime: product.json upstreamVersion must match the root DSH package version')
  }
  if (!('upstreamCommit' in product) || typeof product.upstreamCommit !== 'string' || !/^[\da-f]{40}$/iu.test(product.upstreamCommit)) {
    throw new Error('desktop runtime: product.json must identify the full upstream DSH commit')
  }
  return engineVersion
}

/**
 * Read release metadata with an independent product version and DSH engine version.
 * @param appRoot - Desktop package directory under the repository's apps directory.
 * @param runtimeRoot - Prepared interpreters directory containing versions.json.
 * @param environment - Build environment supplied to the preparation stage.
 * @returns Validated release metadata for the CLI, runtime descriptor and profile.
 */
export function readPreparedDesktopRelease(appRoot: string, runtimeRoot: string, environment: NodeJS.ProcessEnv): DesktopRelease {
  const runtime = JSON.parse(readFileSync(join(runtimeRoot, 'versions.json'), 'utf8')) as Record<string, unknown>
  return parseDesktopRelease({
    schemaVersion: 2,
    version: readPreparedProductVersion(appRoot, environment),
    engineVersion: readPreparedEngineVersion(appRoot),
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: runtime.node,
    pnpmVersion: runtime.pnpm,
  })
}
