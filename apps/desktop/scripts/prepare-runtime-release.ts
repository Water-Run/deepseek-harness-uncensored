/** Resolve the packaged product identity before preparing its CLI and runtime payloads. */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
    engineVersion: manifestVersion(resolve(appRoot, '..', '..', 'package.json'), 'root dsh package'),
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: runtime.node,
    pnpmVersion: runtime.pnpm,
  })
}
