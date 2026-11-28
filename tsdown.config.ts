import { existsSync, globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig } from 'tsdown'
import { decoratorPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'
import { workspacePackageGlobs } from './scripts/workspace-package-globs.ts'

function isBuildFaceClient(value: unknown): boolean {
  if (value === undefined || value === 'host') return false
  if (value === 'client') return true
  throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(value)}`)
}

/**
 * The ordinary workspace build consumes JavaScript emitted by the Host
 * TypeScript project after source-only Typert generation. The Client pass selects packages that
 * declare a browser bundle and lets their package-local configs emit both
 * their Node loader entry and browser artifact. `apps/desktop` bundles after
 * this pass (root package.json `build:lib:host`): its main bundle inlines
 * workspace devDependencies from their lib/ output, and tsdown builds
 * workspace members concurrently without ordering them.
 */
export default defineConfig(({ env }) => {
  const client = isBuildFaceClient(env?.DSH_BUILD_FACE)
  // A package whose TypeScript face emitted no entry has nothing to bundle; skipping it keeps the
  // workspace build aligned with the compiler output instead of failing on an unresolved entry.
  // In the Client pass only packages with a client entry are bundled, plus the statically linked
  // libraries whose shell manifest is built from their host entry.
  const staticLinkedLibrary = (dir: string): boolean => {
    const configPath = join(dir, 'tsdown.config.ts')
    if (!existsSync(configPath)) return false
    const text = readFileSync(configPath, 'utf8')
    return text.includes('staticLinked(') || text.includes('clientShell(')
  }
  const emitted = (workspace: string): boolean => {
    const dir = resolve(workspace)
    if (client) {
      return existsSync(join(dir, 'lib/types/client/index.js'))
        || (existsSync(join(dir, 'lib/types/index.js')) && staticLinkedLibrary(dir))
    }
    return ['lib/types/index.js', 'lib/types/startup.js'].some(candidate => existsSync(join(dir, candidate)))
  }
  const packages = workspacePackageGlobs(globSync(['vendor/*/package.json', 'packages/*/*/package.json'], { cwd: import.meta.dirname }))
    .filter(emitted)
  return {
    workspace: [...packages, 'apps/cli', ...client ? [] : ['apps/desktop-host']],
    entry: client ? '' : ['lib/types/{index,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: client ? [] : [decoratorPlugin()],
  }
})
