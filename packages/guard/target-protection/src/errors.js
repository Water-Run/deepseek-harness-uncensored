/** Typed registry and configuration failures. @module */
import { HarnessError } from '@deepseek-ai/dsh-llm';
/** A remote file request cannot obtain its required audit acknowledgement; no rollback is implied. */
export class TargetAuditError extends HarnessError {
    /** @param code - Whether execution was stopped before dispatch or its final acknowledgement is unavailable.
     * @param message - Credential-free recovery instructions. @param options - Original storage, Session or cleanup failure. */
    constructor(code, message, options) {
        super(message, code, options);
        this.name = 'TargetAuditError';
    }
}
/** Failed configuration or durable access, preserving an underlying diagnostic cause. */
export class TargetProtectionError extends Error {
    code;
    /**
     * @param code - Stable handling category.
     * @param message - Credential-free diagnostic.
     * @param options - Underlying failure when available.
     */
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'TargetProtectionError';
    }
}
//# sourceMappingURL=errors.js.map