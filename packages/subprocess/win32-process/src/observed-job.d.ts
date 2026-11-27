import type { CurrentTokenProcessBindings, NativePtr } from './ffi.ts';
/** Kernel identity, captured by the trusted bootstrap before it accepts workload input. */
export interface WindowsProcessIdentity {
    readonly pid: number;
    /** Exact process creation FILETIME, in 100 ns ticks since the Windows epoch. */
    readonly creationTime: bigint;
}
/**
 * Locate the private bootstrap shipped with this Win32 process package.
 * @returns Absolute asset path shared by source and built command providers.
 */
export declare function observedWindowsBootstrapPath(): string;
/** Process observation calls added to the shared Win32 ABI owner. */
export interface ObservedJobBindings extends CurrentTokenProcessBindings {
    getCurrentProcess(): NativePtr;
    openProcess(access: number, inherit: number, pid: number): NativePtr | null;
    getProcessTimes(process: NativePtr, creation: Buffer, exit: Buffer, kernel: Buffer, user: Buffer): number;
}
/** Misidentified processes and premature release never authorize dispatch or policy replacement. */
export declare class ObservedJobError extends Error {
    readonly code: 'invalid-identity' | 'identity-changed' | 'still-running' | 'already-exited';
    /** @param code - Stable ownership failure. @param message - Context without command arguments or credentials. */
    constructor(code: 'invalid-identity' | 'identity-changed' | 'still-running' | 'already-exited', message: string);
}
/**
 * Capture the current trusted bootstrap's exact kernel identity without allocating a process handle.
 * @param api - Optional injected native bindings for deterministic failure tests.
 * @returns PID and creation time to send over the authenticated startup protocol.
 */
export declare function currentWindowsProcessIdentity(api?: ObservedJobBindings): WindowsProcessIdentity;
/** Independently owned Job; release is permitted only after its process accounting reaches zero. */
export interface ObservedWindowsJob {
    /**
     * Borrow a process-local Job handle for an authenticated observer to duplicate.
     * The caller must retain this owner until duplication completes; borrowing neither duplicates nor transfers ownership.
     * @returns Exact numeric handle, only while the range remains active.
     */
    borrowHandle(): bigint;
    /** @returns True once zero members have been observed; this terminal fact remains true after release. */
    isEmpty(): boolean;
    /** @param exitCode - Windows exit code assigned to members. No-op after confirmed exit. */
    terminate(exitCode: number): void;
    /**
     * Observe the same Job until it is empty, without treating cancellation or an observation failure as exit.
     * @param pollIntervalMs - Positive timer interval supplied by the executor's configuration.
     * @param signal - Optional bound on observation; does not terminate or release the range.
     * @returns False on caller cancellation, true only after zero members were observed.
     */
    waitForExit(pollIntervalMs: number, signal?: AbortSignal): Promise<boolean>;
    /** Release owned handles after confirmed exit; active ranges are retained and rejected. Repeated release is harmless. */
    close(): void;
}
/**
 * Attach a trusted bootstrap to a private kill-on-close Job before sending it any workload instructions.
 * Existing descendants are not captured: the caller must keep the bootstrap at its startup barrier until this returns.
 * Before attachment, the bootstrap must neither spawn children nor join additional Jobs. Preloaders that create
 * breakaway Jobs can prevent later descendants from inheriting this Job; launch the bootstrap without those hooks.
 * @param identity - Identity received from the expected bootstrap, including its verified startup nonce at the caller.
 * @param api - Optional injected native bindings for deterministic failure tests.
 * @returns A Job that owns the root and every descendant it creates after attachment.
 * @throws On identity mismatch or native failure. Mismatched processes are never assigned or terminated.
 */
export declare function attachObservedWindowsJob(identity: WindowsProcessIdentity, api?: ObservedJobBindings): ObservedWindowsJob;
//# sourceMappingURL=observed-job.d.ts.map