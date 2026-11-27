/** Tool definitions and invocation data shared by registries and executors. @module */
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { TOOL_CONTEXT_UNAVAILABLE } from "./error-codes.js";
/** Reserved model-facing program transport name. */
export const RUN_CODE_NAME = 'run_code';
/** Failure to determine a tool's step-time availability. */
export class ToolActivationError extends HarnessError {
    /**
     * Preserve a condition failure without treating it as normal unavailability.
     * @param name - tool whose condition rejected.
     * @param cause - underlying condition failure.
     */
    constructor(name, cause) {
        super(`cannot resolve availability of tool "${name}"`, 'TOOL_ACTIVATION_FAILED', { cause });
        this.name = 'ToolActivationError';
    }
}
/** Canonical error code for cancellation after a tool body was invoked. */
export const TOOL_ABORTED = 'ABORTED';
/** Canonical error code for cancellation before a tool body was invoked. */
export const TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH';
/**
 * Thrown (internally) when the model requests a tool that isn't registered.
 * Extends {@link HarnessError} (`code: 'UNKNOWN_TOOL'`) so an unknown-tool
 * failure is as routable as a tool-thrown one — retry/sandbox/replay code can
 * distinguish it from a tool body's own error.
 */
export class ToolNotFoundError extends HarnessError {
    /**
     * @param toolName - the name the caller asked for.
     * @param reachableFrom - how the model reaches this tool instead, when the
     *   name IS visible and only the presentation denies calling it directly.
     *   Omitted for a name that is registered nowhere.
     */
    constructor(toolName, reachableFrom) {
        super(reachableFrom === undefined
            ? `unknown tool "${toolName}"`
            : `unknown tool "${toolName}": ${reachableFrom}`, 'UNKNOWN_TOOL');
        this.name = 'ToolNotFoundError';
    }
}
/**
 * Thrown by a tool body when its composition or call lacks context the tool
 * requires, such as a calling Agent, an injected service, or an open turn.
 * The failure is not an argument the model can correct; `message` names the
 * missing context.
 */
export class ToolContextUnavailableError extends HarnessError {
    /**
     * @param message - names the tool and the missing context.
     * @param options - standard `cause` chaining.
     */
    constructor(message, options) {
        super(message, TOOL_CONTEXT_UNAVAILABLE, options);
        this.name = 'ToolContextUnavailableError';
    }
}
/** Thrown when a tool body or post-policy value violates its declared output. */
export class ToolOutputError extends HarnessError {
    /** Schema/value violations in validation order. */
    violations;
    constructor(toolName, violations) {
        super(`tool "${toolName}" returned invalid output: ${violations.join('; ')}`, 'INVALID_TOOL_OUTPUT');
        this.name = 'ToolOutputError';
        this.violations = violations;
    }
}
//# sourceMappingURL=contracts.js.map