/** Immutable malformed authored fixtures retained as negative reader inputs, never as released-writer examples. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

interface AuthoredRejection {
  readonly sha256: string
  readonly layout: string | null
  readonly restore: { readonly name: string; readonly message: string }
}

/** Exact negative inputs whose selected V4 successors remain ordinary replay fixtures. */
export const authoredSessionRejections: Readonly<Partial<Record<string, AuthoredRejection>>> = {
  'snapshots/session/management-target-protection/session.v3.jsonl': {
    sha256: 'dec532f7deaca71835288fcfd02f6b5c189bd769361f87293793ed03e7722179',
    layout: 'session snapshot line 17: format v3 tool/result at seq 15 carries error metadata for a non-error tool result',
    restore: { name: 'Error', message: 'session snapshot line 17: format v3 tool/result at seq 15 carries error metadata for a non-error tool result' },
  },
  'snapshots/session/ptc-target-protection/session.v3.jsonl': {
    sha256: 'efafe8948517b1a1342d61536f35b6261aacc0bd036f6f1dc2f1376157c28f53',
    layout: null,
    restore: { name: 'SessionFormatUnsupportedMigrationError', message: 'session snapshot line 17: @deepseek-ai/dsh-session-format-v3-to-v4 refuses this format v3 Session: format v3 tool/result at seq 15 requires exactly one tool-result wrapper matching its tool source' },
  },
}

/**
 * Verify a known malformed authored input without permitting its bytes or reader outcome to change.
 * @param path - Repository-relative fixture path with forward slashes.
 * @param source - Committed JSONL text; Git line endings do not change its identity.
 * @param check - Source-codec layout admission or migration into the current format.
 * @param operation - The unmodified reader or layout check used by the calling gate.
 * @returns Whether this path is an inventoried negative input; unknown paths remain subject to normal gates.
 */
export function verifyAuthoredSessionRejection(path: string, source: string, check: 'layout' | 'restore', operation: () => unknown): boolean {
  const record = authoredSessionRejections[path]
  if (record === undefined) return false
  assert.equal(createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex'), record.sha256,
    `${path}: malformed authored fixture bytes changed`)
  if (check === 'layout' && record.layout === null) assert.doesNotThrow(operation)
  else assert.throws(operation, check === 'layout'
    ? { name: 'Error', message: `${path}: ${record.layout}` }
    : record.restore, `${path}: exact malformed fixture refusal`)
  return true
}
