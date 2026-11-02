/** Host prerequisites shared by the strict broker launcher and native SDK loader. @module */
import { NativeProtocolError } from './native-protocol.ts'

/**
 * Require the supported Windows runtime before native setup, without selecting a weaker fallback.
 * @param platform - Actual execution host platform.
 * @param nodeVersion - Actual Node runtime version.
 * @param packaged - Whether the host lacks the private worker layout in a single-file executable.
 * @returns Nothing when the native broker can load its runtime.
 */
export function requireNativeRuntime(platform: NodeJS.Platform, nodeVersion: string, packaged: boolean): void {
  const major = Number(nodeVersion.split('.')[0])
  if (platform !== 'win32' || !Number.isSafeInteger(major) || major < 24 || packaged) {
    throw new NativeProtocolError('This native broker requires an unpacked Windows Node 24 runtime.')
  }
}
