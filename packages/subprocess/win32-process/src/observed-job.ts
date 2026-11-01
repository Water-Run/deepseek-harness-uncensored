/** Independent Job ownership for a trusted bootstrap held before workload dispatch. @module */
import { setTimeout as delay } from 'node:timers/promises'
import { extendWin32ProcessBindings, isNullPtr, throwLastError } from './ffi.ts'
import type { CurrentTokenProcessBindings, NativePtr } from './ffi.ts'
import { closeHandleChecked, isJobEmpty, terminateJob } from './process.ts'
import * as abi from './abi.ts'

/** Kernel identity, captured by the trusted bootstrap before it accepts workload input. */
export interface WindowsProcessIdentity {
  readonly pid: number
  /** Exact process creation FILETIME, in 100 ns ticks since the Windows epoch. */
  readonly creationTime: bigint
}

/** Process observation calls added to the shared Win32 ABI owner. */
export interface ObservedJobBindings extends CurrentTokenProcessBindings {
  getCurrentProcess(): NativePtr
  openProcess(access: number, inherit: number, pid: number): NativePtr | null
  getProcessTimes(process: NativePtr, creation: Buffer, exit: Buffer, kernel: Buffer, user: Buffer): number
}

/** Misidentified processes and premature release never authorize dispatch or policy replacement. */
export class ObservedJobError extends Error {
  /** @param code - Stable ownership failure. @param message - Context without command arguments or credentials. */
  constructor(readonly code: 'invalid-identity' | 'identity-changed' | 'still-running', message: string) {
    super(message)
    this.name = 'ObservedJobError'
  }
}

/* v8 ignore start -- Windows runtime tests exercise these DLL declarations; the injected owner is portable. */
function nativeBindings(): ObservedJobBindings {
  return extendWin32ProcessBindings(({ kernel32, bind }) => ({
    getCurrentProcess: bind(kernel32, 'GetCurrentProcess', 'void *', []),
    openProcess: bind(kernel32, 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']),
    getProcessTimes: bind(kernel32, 'GetProcessTimes', 'int', ['void *', 'void *', 'void *', 'void *', 'void *']),
  })) as ObservedJobBindings
}
/* v8 ignore stop */

function creationTime(api: ObservedJobBindings, process: NativePtr): bigint {
  const created = Buffer.alloc(8), exited = Buffer.alloc(8), kernel = Buffer.alloc(8), user = Buffer.alloc(8)
  if (api.getProcessTimes(process, created, exited, kernel, user) === 0) throwLastError(api, 'GetProcessTimes')
  return created.readBigUInt64LE()
}

/**
 * Capture the current trusted bootstrap's exact kernel identity without allocating a process handle.
 * @param api - Optional injected native bindings for deterministic failure tests.
 * @returns PID and creation time to send over the authenticated startup protocol.
 */
export function currentWindowsProcessIdentity(api: ObservedJobBindings = nativeBindings()): WindowsProcessIdentity {
  return { pid: process.pid, creationTime: creationTime(api, api.getCurrentProcess()) }
}

/** Independently owned Job; release is permitted only after its process accounting reaches zero. */
export interface ObservedWindowsJob {
  /** @returns True once zero members have been observed; this terminal fact remains true after release. */
  isEmpty(): boolean
  /** @param exitCode - Windows exit code assigned to members. No-op after confirmed exit. */
  terminate(exitCode: number): void
  /**
   * Observe the same Job until it is empty, without treating cancellation or an observation failure as exit.
   * @param pollIntervalMs - Positive timer interval supplied by the executor's configuration.
   * @param signal - Optional bound on observation; does not terminate or release the range.
   * @returns False on caller cancellation, true only after zero members were observed.
   */
  waitForExit(pollIntervalMs: number, signal?: AbortSignal): Promise<boolean>
  /** Release owned handles after confirmed exit; active ranges are retained and rejected. Repeated release is harmless. */
  close(): void
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
export function attachObservedWindowsJob(
  identity: WindowsProcessIdentity, api: ObservedJobBindings = nativeBindings(),
): ObservedWindowsJob {
  if (!Number.isSafeInteger(identity.pid) || identity.pid <= 0 || identity.pid > 0xffff_ffff
    || identity.creationTime <= 0n || identity.creationTime > 0xffff_ffff_ffff_ffffn) {
    throw new ObservedJobError('invalid-identity', 'A valid Windows PID and creation time are required.')
  }
  // AssignProcessToJobObject requires SET_QUOTA | TERMINATE; QUERY_LIMITED_INFORMATION verifies creation time.
  const root = api.openProcess(0x00000100 | 0x00000001 | 0x00001000, 0, identity.pid)
  if (isNullPtr(root)) throwLastError(api, 'OpenProcess')
  let job: NativePtr | undefined
  try {
    if (creationTime(api, root) !== identity.creationTime) {
      throw new ObservedJobError('identity-changed', 'The bootstrap PID now identifies a different process.')
    }
    job = api.createJobObjectW(null, null)
    if (isNullPtr(job)) throwLastError(api, 'CreateJobObjectW')
    const limits = Buffer.alloc(abi.JOBOBJECT_EXTENDED_LIMIT_SIZE)
    limits.writeUInt32LE(abi.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, abi.JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET)
    if (!api.setInformationJobObject(job, abi.JobObjectExtendedLimitInformation, limits, limits.length)) {
      throwLastError(api, 'SetInformationJobObject')
    }
    if (!api.assignProcessToJobObject(job, root)) throwLastError(api, 'AssignProcessToJobObject')
  } catch (error) {
    const errors: unknown[] = [error]
    for (const handle of [job, root]) {
      if (isNullPtr(handle)) continue
      try { closeHandleChecked(api, handle, 'unpublished observed Job') } catch (closeError) { errors.push(closeError) }
    }
    if (errors.length > 1) throw new AggregateError(errors, 'Observed Job setup and cleanup failed')
    throw error
  }
  const ownedJob = job
  let empty = false, closed = false
  const observedEmpty = (): boolean => empty ||= isJobEmpty(api, ownedJob)
  return {
    isEmpty: observedEmpty,
    terminate(exitCode) { if (!empty) terminateJob(api, ownedJob, exitCode) },
    async waitForExit(pollIntervalMs, signal) {
      if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0 || pollIntervalMs > 2147483647) {
        throw new RangeError('Job observation requires a positive finite timer interval.')
      }
      while (true) {
        if (empty) return true
        if (signal?.aborted) return false
        if (observedEmpty()) return true
        try { await delay(pollIntervalMs, undefined, signal === undefined ? undefined : { signal }) }
        catch (error) { if (signal?.aborted) return false; throw error }
      }
    },
    close() {
      if (closed) return
      if (!observedEmpty()) throw new ObservedJobError('still-running', 'The native range is not confirmed empty; keep its protection retained.')
      closed = true
      const failures: unknown[] = []
      for (const handle of [ownedJob, root]) {
        try { closeHandleChecked(api, handle, 'confirmed-empty observed Job') } catch (error) { failures.push(error) }
      }
      if (failures.length > 0) throw new AggregateError(failures, 'Observed Job handle cleanup failed after confirmed exit')
    },
  }
}
