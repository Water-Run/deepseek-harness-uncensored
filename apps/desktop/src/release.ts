/** Immutable version identity of one Electron shell and the dsh engine it bundles. */

import { valid } from 'semver'
import { DESKTOP_HOST_PROTOCOL_VERSION } from './host-protocol.ts'

/** Release facts embedded in the bundled runtime descriptor. */
export interface DesktopRelease {
  readonly schemaVersion: 2
  /** Product version of the Electron shell; update checks compare this value. */
  readonly version: string
  /** Exact version shared by the bundled `@deepseek-ai/dsh` and Desktop Host packages. */
  readonly engineVersion: string
  readonly hostProtocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION
  readonly nodeVersion: string
  readonly pnpmVersion: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && valid(value) !== null
}

/** Validate release data read from an installed or packaged filesystem resource. */
export function parseDesktopRelease(value: unknown): DesktopRelease {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isVersion(value.version) || !isVersion(value.engineVersion)
    || value.hostProtocolVersion !== DESKTOP_HOST_PROTOCOL_VERSION
    || !isVersion(value.nodeVersion) || !isVersion(value.pnpmVersion)) {
    throw new Error('dsh desktop: invalid desktop release metadata')
  }
  return {
    schemaVersion: 2,
    version: value.version,
    engineVersion: value.engineVersion,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: value.nodeVersion,
    pnpmVersion: value.pnpmVersion,
  }
}
