import { type NativePtr } from '@deepseek-ai/dsh-win32-process';
/** Native calls used by one enumeration; all handles belong to that call. */
export interface WindowsLinkBindings {
    getLastError(this: void): number;
    getVolumePathName(this: void, path: string, output: Buffer, length: number): number;
    getVolumeName(this: void, path: string, output: Buffer, length: number): number;
    getVolumePaths(this: void, name: string, output: Buffer, length: number, needed: Buffer): number;
    findFirst(this: void, path: string, flags: number, length: Buffer, output: Buffer): NativePtr | null;
    findNext(this: void, handle: NativePtr, length: Buffer, output: Buffer): number;
    findClose(this: void, handle: NativePtr): number;
}
/**
 * Enumerate every native link name without accepting partial or changing results.
 * @param api - Native filesystem bindings; the caller owns their library lifetime.
 * @param path - Canonical existing local file.
 * @param expectedLinks - Link count from the same file's metadata.
 * @param signal - Cancels between native calls and closes the enumeration.
 * @returns Absolute paths for each link through every mounted drive path.
 */
export declare function enumerateWindowsLinks(api: WindowsLinkBindings, path: string, expectedLinks: bigint, signal: AbortSignal): Promise<string[]>;
/**
 * Read Windows hard-link names using the shared process-owned native libraries.
 * @param path - Canonical existing local file.
 * @param expectedLinks - Native link count to verify against the completed enumeration.
 * @param signal - Inspection cancellation.
 * @returns All mounted names; unsupported hosts and incomplete enumeration fail closed.
 */
export declare function windowsFileLinks(path: string, expectedLinks: bigint, signal: AbortSignal): Promise<string[]>;
//# sourceMappingURL=windows-file-links.d.ts.map