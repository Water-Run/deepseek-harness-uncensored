/** The one Remote failure class shared by owners, the Gateway, and consumers. */
import { HarnessError } from '@deepseek-ai/dsh-error';
/**
 * One Remote call failure: a `HarnessError` carrying its stable code and typed
 * details. Owners throw it at the failure point; the Host Gateway encodes it
 * onto the wire unchanged; the Client face rebuilds an instance for the
 * `RemoteResult` error branch, so `throw result.error` keeps throw semantics.
 * A tool body that throws it records `name: 'RemoteError'` and its Remote code
 * on `tool/result`. Discrimination is always by `code`, never by instanceof.
 */
export class RemoteError extends HarnessError {
    code;
    details;
    /** Structural marker: cross-realm/bundle identification never uses instanceof. */
    isDSHRemoteError = true;
    /**
     * @param code - stable failure code declared in {@link RemoteErrorDetailsMap}.
     * @param message - human diagnostic carried across the wire.
     * @param details - structured payload typed by the code.
     * @param options - standard Error options (`cause` survives in-process only).
     */
    constructor(code, message, details, options) {
        super(message, code, options);
        this.code = code;
        this.details = details;
        this.name = 'RemoteError';
    }
}
/**
 * Structurally identify a RemoteError thrown across module or realm copies of
 * this class. Mechanism-internal: the Gateway and test assertions use it;
 * business code receives typed failures and never needs it.
 * @param value - a caught value.
 * @returns the failure when the marker matches, otherwise undefined.
 */
export function remoteErrorOf(value) {
    // Structural, not instanceof: an Error thrown in another realm (iframe, VM)
    // fails instanceof Error here, so the marker plus the code field is the test.
    if (typeof value === 'object' && value !== null
        && value.isDSHRemoteError === true
        && typeof value.code === 'string') {
        return value;
    }
    return undefined;
}
//# sourceMappingURL=remote-error.js.map