/** Fixed trusted broker invocation inside a strict Job that precedes every SDK call. @module */
import { dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { launchWindowsJob, type ManagedProcessLaunch } from '@deepseek-ai/dsh-subprocess-local/managed'
import { requireNativeRuntime } from './native-runtime.ts'

/**
 * Start the fixed broker inside an owned Windows Job; caller configuration is sent through its pipe afterward.
 * @param graceMs - Caller-owned process grace, preserved on the managed launch request.
 * @param signal - Preparation cancellation, checked before allocating the broker.
 * @returns The strict outer range, including SDK children even when SDK startup fails before publishing a handle.
 */
export function launchNativeBroker(graceMs: number, signal: AbortSignal): ManagedProcessLaunch {
  signal.throwIfAborted()
  requireNativeRuntime(process.platform, process.versions.node, 'pkg' in process)
  const source = extname(fileURLToPath(import.meta.url)) === '.ts'
  const entry = fileURLToPath(new URL(source ? './native-broker-entry.ts' : './native-broker-entry.js', import.meta.url))
  const environment = scrubbedParentEnv()
  for (const key of Object.keys(environment)) if (/^(NODE_|TSX_)/i.test(key)) Reflect.deleteProperty(environment, key)
  if (source) environment.TSX_TSCONFIG_PATH = fileURLToPath(new URL('../../../../tsconfig.base.json', import.meta.url))
  return launchWindowsJob({
    argv: [process.execPath, ...source ? ['--import', import.meta.resolve('tsx/esm')] : [], entry],
    cwd: dirname(entry), stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs,
  }, environment)
}
