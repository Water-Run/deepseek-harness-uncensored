/**
 * Service Definition for the same-world process-confinement capability seam: wrap exact subprocess argv under a
 * host-path file policy. Containers, microVMs, and remote execution replace the
 * surrounding capability seam instead; this service shares the host kernel and filesystem.
 * @module @deepseek-ai/dsh-sandbox
 */
import { Service } from '@deepseek-ai/cordis';
import { HarnessError } from '@deepseek-ai/dsh-llm';
export { ESCALATION_TARGETS, SANDBOX_ESCALATION_ERROR_CODES, SandboxEscalationError, WIDER_MODES, approveEscalation, escalationHintMarker, sandboxDenialMarker, sandboxPermissionsDescription, validateEscalationArgs, } from "./escalation.js";
export { canonicalPath, workspaceWritableRoots, writableRoots, SandboxInvalidRootError } from "./roots.js";
/**
 * Error code for a requested confined mode when no backend is usable. The
 * provider fails closed, and `HarnessError` carries the code through
 * `tool/result` so callers can distinguish missing confinement from command
 * failure.
 */
export const SANDBOX_UNAVAILABLE = 'SANDBOX_UNAVAILABLE';
/**
 * Thrown when {@link SandboxProvider.confine} cannot enforce the requested
 * mode. Carries {@link SANDBOX_UNAVAILABLE} through the structured error
 * channel.
 */
export class SandboxUnavailableError extends HarnessError {
    constructor(mode, detail) {
        super(`sandbox mode "${mode}" is requested but no sandbox backend is usable on this host; `
            + 'refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing '
            + 'kernel (Linux), ensure sandbox-exec is usable (macOS), or ensure the ACL '
            + 'restricted-token runner can start (Windows) — otherwise switch the consumer to '
            + 'danger-full-access.'
            + (detail === undefined ? '' : ` Runner failure: ${detail}`), SANDBOX_UNAVAILABLE);
        this.name = 'SandboxUnavailableError';
    }
}
/**
 * Every {@link SandboxPreparationError} code:
 * - `SANDBOX_PREPARATION_FAILED` — the provider could not set up host state the confined process needs, such as a
 *   Windows ACL grant or a private temp directory; `cause` holds the platform failure.
 * - `SANDBOX_INVALID_TEMP_ROOT` — the host temp root lies inside the workspace, so a private temp directory would
 *   inherit the workspace grant; move the temp root or the workspace.
 */
export const SANDBOX_PREPARATION_ERROR_CODES = ['SANDBOX_PREPARATION_FAILED', 'SANDBOX_INVALID_TEMP_ROOT'];
/**
 * Thrown by {@link SandboxProvider.confine} when host preparation for an
 * enforceable mode fails. The provider rolls back what it prepared before
 * throwing, and the command never runs.
 */
export class SandboxPreparationError extends HarnessError {
    code;
    /**
     * @param message - names the preparation step and the safe next step.
     * @param code - the failure class consumers route on.
     * @param options - the platform failure, or an `AggregateError` with the cleanup failures, as `cause`.
     */
    constructor(message, code, options) {
        super(message, code, options);
        this.name = 'SandboxPreparationError';
        this.code = code;
    }
}
/**
 * Abstract process-sandbox service. {@link confine} must return enforcing argv
 * or fail closed at wrap or runner-execution time; silent unconfined passthrough
 * is forbidden. Functional probes arbitrate multi-runner chains and may be
 * skipped for a sole candidate, whose own refusal remains the fail-closed end.
 */
export class SandboxProvider extends Service {
    /* v8 ignore next -- abstract service construction is covered through concrete provider packages. */
    constructor(ctx) {
        super(ctx, 'sandbox');
    }
}
export default SandboxProvider;
export { classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature } from "./diagnostics.js";
//# sourceMappingURL=index.js.map