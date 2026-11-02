/** Resolve owner overrides or the REA runtime shipped with this installation. @module */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { ReaOptions } from './types.ts'

/** Physical defaults supplied by the application carrier. */
export interface ReaLaunchDefaults {
  /** Node executable compatible with the pinned REA release. */
  nodePath: string
  /** Resolve the installed upstream entry only when no owner override exists. */
  cliPath: () => string
}

/**
 * Translate the installed package path to files visible to ordinary Node outside Electron.
 * @param manifest - Absolute installed rea-agents/package.json path.
 * @returns Its physical CLI entry; Desktop unpacks the complete dependency closure.
 */
export function bundledReaEntry(manifest: string): string {
  return join(dirname(manifest), 'scripts', 'rea.mjs').replace(/([\\/])app\.asar([\\/])/u, '$1app.asar.unpacked$2')
}

/**
 * Resolve empty path preferences without writing installation-specific paths into user settings.
 * @param options - Persisted owner preferences.
 * @param defaults - Application runtime, or this Node process and installed npm package for source launches.
 * @returns Complete launch preferences passed to the connection owner.
 */
export function resolveReaLaunch(options: ReaOptions, defaults: ReaLaunchDefaults = {
  nodePath: process.env.DSH_REA_NODE_PATH || process.execPath,
  cliPath: () => bundledReaEntry(createRequire(import.meta.url).resolve('rea-agents/package.json')),
}): ReaOptions {
  return { ...options, nodePath: options.nodePath.trim() || defaults.nodePath,
    cliPath: options.cliPath.trim() || defaults.cliPath() }
}
