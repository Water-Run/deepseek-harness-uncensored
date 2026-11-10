/** Validate the assembled application, including native Office conversion outside ASAR. */
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { desktopArtifactOutput, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'
import { withPackagedSmokePath } from './packaged-smoke-path.ts'
import { verifyElectronNotices } from './verify-runtime-archive.ts'

/** Product name the packaged application is built under. */
const DESKTOP_PRODUCT_NAME = 'DeepSeek Harness Uncensored'

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false }, 'skip-notarization': { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const linux = target === 'linux-x64'
const artifacts = desktopArtifactOutput(paths, { unsigned: values.unsigned, skipNotarization: values['skip-notarization'] }).directory
const application = windows ? join(artifacts, 'win-unpacked')
  : linux ? join(artifacts, 'linux-unpacked')
    : join(artifacts, target === 'mac-arm64' ? 'mac-arm64' : 'mac', `${DESKTOP_PRODUCT_NAME}.app`, 'Contents')
if (windows || linux) await verifyElectronNotices(paths.electron, application)
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
  resolveDesktopPackageTarget(target))
if (windows && !values.unsigned) await verifyWindowsCode(application)
const verify = async (path: string): Promise<void> => {
  const resources = join(path, windows || linux ? 'resources' : 'Resources')
  const executable = windows ? join(path, `${DESKTOP_PRODUCT_NAME}.exe`)
    : linux ? join(path, 'deepseek-harness-uncensored') : join(path, 'MacOS', DESKTOP_PRODUCT_NAME)
  await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor)
}
if (windows) await withPackagedSmokePath(application, verify)
else await verify(application)
