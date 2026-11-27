import { globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'tsdown'
import { decoratorPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'
import { workspacePackageGlobs } from './scripts/workspace-package-globs.ts'

/** Packages a compiler aggregate references; the workspace build covers exactly these. */
function referencedPackages(): Set<string> {
  const referenced = new Set<string>()
  for (const aggregate of ['tsconfig.host.json', 'tsconfig.client.json']) {
    for (const reference of JSON.parse(readFileSync(aggregate, 'utf8')).references as { path: string }[]) {
      referenced.add(resolve(dirname(reference.path)))
    }
  }
  return referenced
}

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
  const referenced = referencedPackages()
  const packages = workspacePackageGlobs(globSync(['vendor/*/package.json', 'packages/*/*/package.json'], { cwd: import.meta.dirname }))
    .filter(workspace => referenced.has(resolve(workspace)))
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
