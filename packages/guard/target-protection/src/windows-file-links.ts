/** Complete Windows hard-link names, including the volume's mounted drive paths. @module */
import { win32 } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { extendWin32ProcessBindings, type NativePtr } from '@deepseek-ai/dsh-win32-process'
import { TargetProtectionError } from './errors.ts'

// Win32 extended paths are bounded by 32,767 UTF-16 characters plus their terminator.
const PATH_CHARS = 32768
const ERROR_HANDLE_EOF = 38
const INVALID_HANDLE = 0xffff_ffff_ffff_ffffn

/** Native calls used by one enumeration; all handles belong to that call. */
export interface WindowsLinkBindings {
  getLastError(this: void): number
  getVolumePathName(this: void, path: string, output: Buffer, length: number): number
  getVolumeName(this: void, path: string, output: Buffer, length: number): number
  getVolumePaths(this: void, name: string, output: Buffer, length: number, needed: Buffer): number
  findFirst(this: void, path: string, flags: number, length: Buffer, output: Buffer): NativePtr | null
  findNext(this: void, handle: NativePtr, length: Buffer, output: Buffer): number
  findClose(this: void, handle: NativePtr): number
}

function failed(api: WindowsLinkBindings, operation: string): never {
  throw new TargetProtectionError('unavailable', `Windows file aliases could not be verified (${operation}, Win32 ${api.getLastError()}).`)
}

function text(buffer: Buffer): string {
  const value = buffer.toString('utf16le'), end = value.indexOf('\0')
  if (end < 0) throw new TargetProtectionError('unavailable', 'Windows returned an unterminated file name.')
  return value.slice(0, end)
}

/**
 * Enumerate every native link name without accepting partial or changing results.
 * @param api - Native filesystem bindings; the caller owns their library lifetime.
 * @param path - Canonical existing local file.
 * @param expectedLinks - Link count from the same file's metadata.
 * @param signal - Cancels between native calls and closes the enumeration.
 * @returns Absolute paths for each link through every mounted drive path.
 */
export async function enumerateWindowsLinks(
  api: WindowsLinkBindings, path: string, expectedLinks: bigint, signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted()
  const output = Buffer.alloc(PATH_CHARS * 2), needed = Buffer.alloc(4)
  if (!api.getVolumePathName(path, output, PATH_CHARS)) failed(api, 'GetVolumePathNameW')
  const mount = text(output)
  output.fill(0)
  if (!api.getVolumeName(mount, output, PATH_CHARS)) failed(api, 'GetVolumeNameForVolumeMountPointW')
  const volume = text(output)
  output.fill(0)
  if (!api.getVolumePaths(volume, output, PATH_CHARS, needed)) failed(api, 'GetVolumePathNamesForVolumeNameW')
  const mounts = output.toString('utf16le').split('\0').filter(Boolean)
  if (mounts.length === 0 || mounts.some(value => !/^[a-z]:\\/iu.test(value))) {
    throw new TargetProtectionError('unavailable', 'Windows volume aliases require verified local drive paths.')
  }
  needed.writeUInt32LE(PATH_CHARS)
  output.fill(0)
  const handle = api.findFirst(path, 0, needed, output)
  if (handle === null || BigInt.asUintN(64, handle) === INVALID_HANDLE || handle === 0n) failed(api, 'FindFirstFileNameW')
  const names = new Set<string>()
  try {
    while (true) {
      signal.throwIfAborted()
      const name = text(output)
      if (!name.startsWith('\\') || name.startsWith('\\\\') || name.split('\\').includes('..') || names.has(name)) {
        throw new TargetProtectionError('unavailable', 'Windows returned an ambiguous file alias.')
      }
      names.add(name)
      if (BigInt(names.size) > expectedLinks) throw new TargetProtectionError('unavailable', 'File aliases changed during inspection.')
      await setImmediate(undefined, { signal })
      needed.writeUInt32LE(PATH_CHARS)
      output.fill(0)
      if (api.findNext(handle, needed, output)) continue
      if (api.getLastError() !== ERROR_HANDLE_EOF) failed(api, 'FindNextFileNameW')
      break
    }
  } finally {
    if (!api.findClose(handle)) failed(api, 'FindClose')
  }
  if (BigInt(names.size) !== expectedLinks) throw new TargetProtectionError('unavailable', 'File aliases changed during inspection.')
  return [...new Set(mounts.flatMap(root => [...names].map(name => win32.join(root, name.slice(1)))))]
}

/**
 * Read Windows hard-link names using the shared process-owned native libraries.
 * @param path - Canonical existing local file.
 * @param expectedLinks - Native link count to verify against the completed enumeration.
 * @param signal - Inspection cancellation.
 * @returns All mounted names; unsupported hosts and incomplete enumeration fail closed.
 */
export function windowsFileLinks(path: string, expectedLinks: bigint, signal: AbortSignal): Promise<string[]> {
  /* v8 ignore start -- Windows file-effect tests cover native declarations; portable tests cover enumeration and cleanup. */
  if (process.platform !== 'win32') throw new TargetProtectionError('unavailable', 'Windows file aliases require a Windows executor.')
  const api = extendWin32ProcessBindings(({ kernel32, bind }) => ({
    getVolumePathName: bind(kernel32, 'GetVolumePathNameW', 'int', ['str16', 'void *', 'uint32']),
    getVolumeName: bind(kernel32, 'GetVolumeNameForVolumeMountPointW', 'int', ['str16', 'void *', 'uint32']),
    getVolumePaths: bind(kernel32, 'GetVolumePathNamesForVolumeNameW', 'int', ['str16', 'void *', 'uint32', 'void *']),
    findFirst: bind(kernel32, 'FindFirstFileNameW', 'void *', ['str16', 'uint32', 'void *', 'void *']),
    findNext: bind(kernel32, 'FindNextFileNameW', 'int', ['void *', 'void *', 'void *']),
    findClose: bind(kernel32, 'FindClose', 'int', ['void *']),
  })) as WindowsLinkBindings
  return enumerateWindowsLinks(api, path, expectedLinks, signal)
  /* v8 ignore stop */
}
