/** Compile the patched ConPTY loader before sealing Windows Desktop resources. */
import { execFile } from 'node:child_process'
import { copyFileSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { desktopNodeEnvironment } from '../src/node-environment.ts'

const require = createRequire(import.meta.url)

/**
 * Replace the Windows prebuild with the long-path-capable source build.
 * The package must be a private, disposable runtime installation, never the pnpm store.
 * Requires MSVC with Spectre libraries and Python; compilation failures abort packaging.
 * @param packageRoot Installed node-pty package with the workspace patch applied.
 * @param node Electron executable providing the packaged Node version.
 * @param bin Directory containing the packaging Node command launcher.
 * @param nodeVersion Node headers matching the packaged runtime.
 * @param arch Target Windows architecture.
 * @returns Resolves when the compiled addon has replaced the target prebuild.
 */
export async function prepareWindowsPty(
  packageRoot: string, node: string, bin: string, nodeVersion: string, arch: string,
): Promise<void> {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version?: unknown }
  if (manifest.version !== '1.2.0-beta.15') throw new Error('desktop ConPTY: review the native patch before upgrading node-pty')
  const { stdout, stderr } = await promisify(execFile)(node, [
    require.resolve('node-gyp/bin/node-gyp.js'), 'rebuild', `--directory=${packageRoot}`, `--target=${nodeVersion}`, `--arch=${arch}`,
    // node-gyp otherwise inherits Electron's process.config instead of the Node-API target headers.
    `--dist-url=${process.env.NODEJS_ORG_MIRROR ?? 'https://nodejs.org/dist'}`,
  ], {
    windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    env: desktopNodeEnvironment(node, bin, { ...process.env, NODE_OPTIONS: '' }),
  }).catch((error: unknown) => {
    if (error instanceof Error) {
      if ('stdout' in error && typeof error.stdout === 'string') process.stdout.write(error.stdout)
      if ('stderr' in error && typeof error.stderr === 'string') process.stderr.write(error.stderr)
    }
    throw error
  })
  process.stdout.write(stdout)
  process.stderr.write(stderr)
  copyFileSync(join(packageRoot, 'build/Release/conpty.node'), join(packageRoot, `prebuilds/win32-${arch}/conpty.node`))
  // node-pty prefers build/Release over prebuilds; publish one selected addon only.
  rmSync(join(packageRoot, 'build'), { recursive: true, force: true })
}
