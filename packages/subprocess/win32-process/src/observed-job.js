/** Independent Job ownership for a trusted bootstrap held before workload dispatch. @module */
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { extendWin32ProcessBindings, isNullPtr, throwLastError } from "./ffi.js";
import { closeHandleChecked, isJobEmpty, terminateJob } from "./process.js";
import * as abi from "./abi.js";
/**
 * Locate the private bootstrap shipped with this Win32 process package.
 * @returns Absolute asset path shared by source and built command providers.
 */
export function observedWindowsBootstrapPath() {
    return fileURLToPath(new URL('../assets/native-bootstrap.mjs', import.meta.url));
}
/** Misidentified processes and premature release never authorize dispatch or policy replacement. */
export class ObservedJobError extends Error {
    code;
    /** @param code - Stable ownership failure. @param message - Context without command arguments or credentials. */
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ObservedJobError';
    }
}
/* v8 ignore start -- Windows runtime tests exercise these DLL declarations; the injected owner is portable. */
function nativeBindings() {
    return extendWin32ProcessBindings(({ kernel32, bind }) => ({
        getCurrentProcess: bind(kernel32, 'GetCurrentProcess', 'void *', []),
        openProcess: bind(kernel32, 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']),
        getProcessTimes: bind(kernel32, 'GetProcessTimes', 'int', ['void *', 'void *', 'void *', 'void *', 'void *']),
    }));
}
/* v8 ignore stop */
function creationTime(api, process) {
    const created = Buffer.alloc(8), exited = Buffer.alloc(8), kernel = Buffer.alloc(8), user = Buffer.alloc(8);
    if (api.getProcessTimes(process, created, exited, kernel, user) === 0)
        throwLastError(api, 'GetProcessTimes');
    return created.readBigUInt64LE();
}
/**
 * Capture the current trusted bootstrap's exact kernel identity without allocating a process handle.
 * @param api - Optional injected native bindings for deterministic failure tests.
 * @returns PID and creation time to send over the authenticated startup protocol.
 */
export function currentWindowsProcessIdentity(api = nativeBindings()) {
    return { pid: process.pid, creationTime: creationTime(api, api.getCurrentProcess()) };
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
export function attachObservedWindowsJob(identity, api = nativeBindings()) {
    if (!Number.isSafeInteger(identity.pid) || identity.pid <= 0 || identity.pid > 0xffff_ffff
        || identity.creationTime <= 0n || identity.creationTime > 0xffffffffffffffffn) {
        throw new ObservedJobError('invalid-identity', 'A valid Windows PID and creation time are required.');
    }
    // AssignProcessToJobObject requires SET_QUOTA | TERMINATE; QUERY_LIMITED_INFORMATION verifies creation time.
    const root = api.openProcess(0x00000100 | 0x00000001 | 0x00001000, 0, identity.pid);
    if (isNullPtr(root))
        throwLastError(api, 'OpenProcess');
    let job;
    try {
        if (creationTime(api, root) !== identity.creationTime) {
            throw new ObservedJobError('identity-changed', 'The bootstrap PID now identifies a different process.');
        }
        job = api.createJobObjectW(null, null);
        if (isNullPtr(job))
            throwLastError(api, 'CreateJobObjectW');
        const limits = Buffer.alloc(abi.JOBOBJECT_EXTENDED_LIMIT_SIZE);
        limits.writeUInt32LE(abi.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, abi.JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET);
        if (!api.setInformationJobObject(job, abi.JobObjectExtendedLimitInformation, limits, limits.length)) {
            throwLastError(api, 'SetInformationJobObject');
        }
        if (!api.assignProcessToJobObject(job, root))
            throwLastError(api, 'AssignProcessToJobObject');
    }
    catch (error) {
        const errors = [error];
        for (const handle of [job, root]) {
            if (isNullPtr(handle))
                continue;
            try {
                closeHandleChecked(api, handle, 'unpublished observed Job');
            }
            catch (closeError) {
                errors.push(closeError);
            }
        }
        if (errors.length > 1)
            throw new AggregateError(errors, 'Observed Job setup and cleanup failed');
        throw error;
    }
    const ownedJob = job;
    let empty = false, closed = false;
    const observedEmpty = () => empty ||= isJobEmpty(api, ownedJob);
    return {
        borrowHandle() {
            if (closed || observedEmpty())
                throw new ObservedJobError('already-exited', 'An exited Job cannot admit another observer.');
            return ownedJob;
        },
        isEmpty: observedEmpty,
        terminate(exitCode) { if (!empty)
            terminateJob(api, ownedJob, exitCode); },
        async waitForExit(pollIntervalMs, signal) {
            if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0 || pollIntervalMs > 2147483647) {
                throw new RangeError('Job observation requires a positive finite timer interval.');
            }
            while (true) {
                if (empty)
                    return true;
                if (signal?.aborted)
                    return false;
                if (observedEmpty())
                    return true;
                try {
                    await delay(pollIntervalMs, undefined, signal === undefined ? undefined : { signal });
                }
                catch (error) {
                    if (signal?.aborted)
                        return false;
                    throw error;
                }
            }
        },
        close() {
            if (closed)
                return;
            if (!observedEmpty())
                throw new ObservedJobError('still-running', 'The native range is not confirmed empty; keep its protection retained.');
            closed = true;
            const failures = [];
            for (const handle of [ownedJob, root]) {
                try {
                    closeHandleChecked(api, handle, 'confirmed-empty observed Job');
                }
                catch (error) {
                    failures.push(error);
                }
            }
            if (failures.length > 0)
                throw new AggregateError(failures, 'Observed Job handle cleanup failed after confirmed exit');
        },
    };
}
//# sourceMappingURL=observed-job.js.map