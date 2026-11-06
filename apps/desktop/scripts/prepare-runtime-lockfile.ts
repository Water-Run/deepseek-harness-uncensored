/** Keep Desktop registry resolutions tied to the checked-in workspace lockfile. */
import { createHash } from 'node:crypto'
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import yaml from 'js-yaml'
import { valid } from 'semver'
import { z } from 'zod'
import { desktopCorePackageSpec, type DesktopCorePackageSet } from '../src/core-package-set.ts'

const packageSchema = z.object({
  resolution: z.object({ integrity: z.string().optional() }).passthrough(),
  os: z.array(z.string()).optional(), cpu: z.array(z.string()).optional(),
}).passthrough()
const lockSchema = z.object({ lockfileVersion: z.literal('9.0'), packages: z.record(z.string(), packageSchema) })
const nativeSchema = z.object({
  name: z.string(), version: z.string(), os: z.array(z.string()).nonempty(), cpu: z.array(z.string()).nonempty(),
})
const workspaceSchema = z.object({ overrides: z.record(z.string(), z.string()).optional() }).passthrough()

/** Captured source resolutions, local archive integrities and unshipped optional native metadata. */
export interface PreparedRuntimeLockfile {
  sourceSha256: string
  registry: ReadonlyMap<string, z.infer<typeof packageSchema>>
  local: ReadonlyMap<string, string>
  omittedNative: ReadonlyMap<string, z.infer<typeof nativeSchema>>
}

/**
 * Seed the build-only project from the source lockfile and pin unshipped native variants.
 * Source files remain unchanged; failures stop preparation before production installation.
 * @param projectRoot Disposable project with staged core packages and patch configuration.
 * @param repositoryRoot Source workspace containing the committed lockfile and native manifests.
 * @param packageSet Verified core tarballs selected for this target.
 * @param target Platform and architecture that will receive the runtime.
 * @returns Captured expectations for checking pnpm's resolved build-only lockfile.
 */
export function prepareRuntimeLockfile(
  projectRoot: string, repositoryRoot: string, packageSet: DesktopCorePackageSet,
  target: { platform: string; arch: string },
): PreparedRuntimeLockfile {
  if (resolve(projectRoot) === resolve(repositoryRoot)) throw new Error('desktop lockfile: destination must not be the source workspace')
  const bytes = readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'))
  const source = lockSchema.parse(yaml.load(bytes.toString('utf8')))
  const settingsPath = join(projectRoot, 'pnpm-workspace.yaml')
  const settings = workspaceSchema.parse(yaml.load(readFileSync(settingsPath, 'utf8')))
  const overrides = { ...settings.overrides }
  const omittedNative = new Map<string, z.infer<typeof nativeSchema>>()
  const nativeRoot = join(repositoryRoot, 'native/system/packages')
  const entryPath = join(nativeRoot, 'entry/package.json')
  if (existsSync(entryPath)) {
    const entry = z.object({ optionalDependencies: z.record(z.string(), z.string()) }).parse(JSON.parse(readFileSync(entryPath, 'utf8')))
    for (const path of globSync('*/package.json', { cwd: nativeRoot })) {
      if (basename(dirname(path)) === 'entry') continue
      const native = nativeSchema.parse(JSON.parse(readFileSync(join(nativeRoot, path), 'utf8')))
      if (native.name !== `@deepseek-ai/node-addon-system-${basename(dirname(path))}` || valid(native.version) !== native.version
        || !Object.hasOwn(entry.optionalDependencies, native.name)) throw new Error(`desktop lockfile: invalid native variant ${path}`)
      if (packageSet.packages.some(pkg => pkg.name === native.name)) continue
      if (native.os.includes(target.platform) && native.cpu.includes(target.arch)) {
        throw new Error(`desktop lockfile: target native package must come from local tarballs: ${native.name}`)
      }
      if (overrides[native.name] !== undefined && overrides[native.name] !== native.version) {
        throw new Error(`desktop lockfile: conflicting native version for ${native.name}`)
      }
      overrides[native.name] = native.version
      omittedNative.set(`${native.name}@${native.version}`, native)
    }
  }
  writeFileSync(settingsPath, yaml.dump({ ...settings, overrides }))
  writeFileSync(join(projectRoot, 'pnpm-lock.yaml'), bytes)
  return {
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    registry: new Map(Object.entries(source.packages)),
    local: new Map(packageSet.packages.map(pkg => [`${pkg.name}@${desktopCorePackageSpec(pkg).replace('file:./', 'file:')}`, pkg.integrity])),
    omittedNative,
  }
}

/**
 * Reject new registry versions or changed resolutions before the frozen production install.
 * Only local core archives and source-pinned native variants excluded from this target may differ.
 * @param projectRoot Build-only project after pnpm resolved its seeded lockfile.
 * @param plan Expectations captured before resolution.
 */
export function verifyRuntimeLockfile(projectRoot: string, plan: PreparedRuntimeLockfile): void {
  const lock = lockSchema.parse(yaml.load(readFileSync(join(projectRoot, 'pnpm-lock.yaml'), 'utf8')))
  for (const spec of plan.local.keys()) {
    if (!Object.hasOwn(lock.packages, spec)) throw new Error(`desktop lockfile: missing local archive ${spec}`)
  }
  for (const [spec, pkg] of Object.entries(lock.packages)) {
    const local = plan.local.get(spec)
    if (local !== undefined) {
      if (pkg.resolution.integrity !== local || pkg.resolution.tarball !== spec.slice(spec.indexOf('@file:') + 1)) {
        throw new Error(`desktop lockfile: local archive resolution changed: ${spec}`)
      }
      continue
    }
    const native = plan.omittedNative.get(spec)
    if (native !== undefined && /^sha512-[A-Za-z0-9+/]{86}==$/u.test(pkg.resolution.integrity ?? '')
      && Object.keys(pkg.resolution).every(key => key === 'integrity')
      && isDeepStrictEqual(pkg.os, native.os) && isDeepStrictEqual(pkg.cpu, native.cpu)) continue
    const expected = plan.registry.get(spec)
    if (expected === undefined || !isDeepStrictEqual(pkg.resolution, expected.resolution)) {
      throw new Error(`desktop lockfile: unreviewed registry resolution ${spec}; update the workspace dependency and lockfile first`)
    }
  }
}
