/**
 * The one definition of a well-formed API key, shared by every consumer that
 * puts a resolved key in an HTTP header. A consumer words its own diagnostic
 * for a key that is not.
 * @module @deepseek-ai/dsh-credentials/api-key
 */
/** Why a supplied API key cannot be used. */
export type ApiKeyRejection = 'empty' | 'illegalCharacters';
/** The verdict on one supplied API key. */
export type ApiKeyCheck = {
    readonly ok: true;
    readonly value: string;
} | {
    readonly ok: false;
    readonly reason: ApiKeyRejection;
};
/**
 * Judge one *supplied* API key, trimming surrounding whitespace first.
 *
 * Trimming is silent because a padded key has one unambiguous reading; every
 * other defect is reported. Absence is a configuration state this function
 * never sees — a profile naming no credential authenticates through the
 * provider's own ambient discovery or OAuth — so callers decide whether a
 * value was supplied before asking.
 * @param raw - the key exactly as configured, stored, or typed.
 * @returns the trimmed key, or why it cannot be used.
 */
export declare function normalizeApiKey(raw: string): ApiKeyCheck;
//# sourceMappingURL=api-key.d.ts.map