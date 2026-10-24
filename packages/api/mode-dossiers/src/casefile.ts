/**
 * Case ledger parsing, validation, mutation, and report rendering.
 *
 * The document is the one `assets/shared/scripts/casefile.mjs` writes and
 * reads: `.security/<slug>/case.json` or `.reverse/<slug>/case.json`, format
 * version 1, with `targets`, `evidence`, `findings`, and `notes` arrays. This
 * module owns the same validation vocabulary so a file the script accepts is
 * accepted here, and a file that drifts is reported rather than rewritten.
 *
 * Fields this build does not model are never dropped: mutations edit the
 * parsed object in place, so unknown top-level keys and unknown record fields
 * travel back to disk unchanged.
 */

import type {
  CaseCollection,
  CaseDocument,
  CaseEvidence,
  CaseEvidenceInput,
  CaseFinding,
  CaseFindingInput,
  CaseMutation,
  CaseNote,
  CaseNoteInput,
  CaseSummary,
  CaseTarget,
  CaseTargetInput,
  DossierKind,
} from './types.ts'
import { DossierProblemError, isRecord, numberField, stringArrayField, stringField } from './files.ts'

/** Case format version this build reads and writes. */
export const CASE_VERSION = 1

/** Record collections, in report order. */
export const CASE_COLLECTIONS: readonly CaseCollection[] = ['targets', 'evidence', 'findings', 'notes']

/** Severity vocabulary accepted by `casefile.mjs`. */
export const CASE_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const

/** Id prefix per collection, matching the script's generated ids. */
const ID_PREFIX: Readonly<Record<CaseCollection, string>> = {
  targets: 'T', evidence: 'E', findings: 'F', notes: 'N',
}

/** Upper bound on one stored text field; long enough for real notes, short enough to stay reviewable. */
const MAX_FIELD_LENGTH = 20_000

/** One parsed case ledger: the on-disk object beside its typed view. */
export interface CaseFile {
  /** The parsed JSON object, including keys this build does not model. */
  readonly raw: Record<string, unknown>
  readonly document: CaseDocument
  /** Top-level keys outside the modelled vocabulary, for display. */
  readonly extraKeys: readonly string[]
}

/** Keys this module models inside `case.json`. */
const KNOWN_KEYS = new Set(['version', 'kind', 'slug', 'objective', 'createdAt', 'updatedAt', ...CASE_COLLECTIONS])

/**
 * Directory name of one mode's case store, as `casefile.mjs` names it.
 * @param kind - dossier kind.
 * @returns `.security` for security cases, `.reverse` for reverse-engineering cases.
 */
export function caseRoot(kind: DossierKind): string {
  return kind === 'security' ? '.security' : '.reverse'
}

/**
 * Workspace-relative path of one case ledger.
 * @param kind - dossier kind.
 * @param slug - case directory name.
 * @returns the ledger's workspace-relative path.
 */
export function casePath(kind: DossierKind, slug: string): string {
  return `${caseRoot(kind)}/${slug}/case.json`
}

/**
 * Validate a slug as a single directory name.
 * @param slug - caller-supplied case directory name.
 * @returns the slug unchanged.
 * @throws {DossierProblemError} when the slug is not a plain directory name.
 */
export function validateSlug(slug: string): string {
  if (!/^[A-Za-z0-9._-]+$/u.test(slug) || slug === '.' || slug === '..') {
    throw new DossierProblemError(
      'corrupt',
      `"${slug}" is not a case directory name; use letters, digits, dot, underscore and hyphen only`,
    )
  }
  return slug
}

/** Reject a text field that is longer than one record can reasonably carry. */
function bounded(value: string, field: string): string {
  if (value.length > MAX_FIELD_LENGTH) {
    throw new DossierProblemError('corrupt', `${field} is longer than ${MAX_FIELD_LENGTH} characters`)
  }
  return value
}

/** Normalize one target record. */
function targetOf(record: Record<string, unknown>, label: string): CaseTarget {
  const id = stringField(record, 'id')
  if (id.length === 0) throw new DossierProblemError('corrupt', `${label} holds a target without an id`)
  return {
    id,
    value: stringField(record, 'value'),
    label: stringField(record, 'label'),
    note: stringField(record, 'note'),
    addedAt: stringField(record, 'addedAt'),
  }
}

/** Normalize one evidence record. */
function evidenceOf(record: Record<string, unknown>, label: string): CaseEvidence {
  const id = stringField(record, 'id')
  if (id.length === 0) throw new DossierProblemError('corrupt', `${label} holds an evidence record without an id`)
  return {
    id,
    kind: stringField(record, 'kind'),
    ref: stringField(record, 'ref'),
    note: stringField(record, 'note'),
    addedAt: stringField(record, 'addedAt'),
  }
}

/** Normalize one finding record. */
function findingOf(record: Record<string, unknown>, label: string): CaseFinding {
  const id = stringField(record, 'id')
  if (id.length === 0) throw new DossierProblemError('corrupt', `${label} holds a finding without an id`)
  return {
    id,
    title: stringField(record, 'title'),
    severity: stringField(record, 'severity'),
    target: stringField(record, 'target'),
    cvss: stringField(record, 'cvss'),
    evidence: stringArrayField(record, 'evidence'),
    note: stringField(record, 'note'),
    status: stringField(record, 'status'),
    addedAt: stringField(record, 'addedAt'),
  }
}

/** Normalize one note record. */
function noteOf(record: Record<string, unknown>, label: string): CaseNote {
  const id = stringField(record, 'id')
  if (id.length === 0) throw new DossierProblemError('corrupt', `${label} holds a note without an id`)
  return {
    id,
    title: stringField(record, 'title'),
    body: stringField(record, 'body'),
    addedAt: stringField(record, 'addedAt'),
  }
}

/** Read one record array; absence is an empty collection, a non-array is corruption. */
function recordsOf(raw: Record<string, unknown>, collection: CaseCollection, label: string): Record<string, unknown>[] {
  const value = raw[collection]
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new DossierProblemError('corrupt', `${label}: "${collection}" is not an array`)
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new DossierProblemError('corrupt', `${label}: ${collection}[${index}] is not an object`)
    return entry
  })
}

/**
 * Build the typed view of a parsed case object.
 * @param raw - parsed JSON object.
 * @param label - path used in diagnostics.
 * @returns the normalized file, including the keys this build does not model.
 * @throws {DossierProblemError} for an unknown format version or a malformed collection.
 */
export function normalizeCase(raw: Record<string, unknown>, label: string): CaseFile {
  const version = numberField(raw, 'version', 0)
  if (version > CASE_VERSION) {
    throw new DossierProblemError(
      'unsupported-version',
      `${label} uses case format version ${version}; this build reads version ${CASE_VERSION}`,
    )
  }
  if (version !== CASE_VERSION) throw new DossierProblemError('corrupt', `${label} has no supported case format version`)
  const kind = stringField(raw, 'kind')
  if (kind !== 'security' && kind !== 'reverse') {
    throw new DossierProblemError('corrupt', `${label} names case kind "${kind}"; expected security or reverse`)
  }
  const document: CaseDocument = {
    version,
    kind,
    slug: stringField(raw, 'slug'),
    objective: stringField(raw, 'objective'),
    createdAt: stringField(raw, 'createdAt'),
    updatedAt: stringField(raw, 'updatedAt'),
    targets: recordsOf(raw, 'targets', label).map(record => targetOf(record, label)),
    evidence: recordsOf(raw, 'evidence', label).map(record => evidenceOf(record, label)),
    findings: recordsOf(raw, 'findings', label).map(record => findingOf(record, label)),
    notes: recordsOf(raw, 'notes', label).map(record => noteOf(record, label)),
  }
  return { raw, document, extraKeys: Object.keys(raw).filter(key => !KNOWN_KEYS.has(key)).sort() }
}

/**
 * Parse one stored case file.
 * @param text - complete file text.
 * @param label - path used in diagnostics.
 * @returns the normalized file.
 * @throws {DossierProblemError} when the text is not a case object this build reads.
 */
export function parseCase(text: string, label: string): CaseFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new DossierProblemError('corrupt', `${label} is not valid JSON`)
  }
  if (!isRecord(parsed)) throw new DossierProblemError('corrupt', `${label} does not hold a JSON object`)
  return normalizeCase(parsed, label)
}

/**
 * Build the empty ledger `casefile.mjs init` writes.
 * @param kind - dossier kind.
 * @param slug - case directory name.
 * @param objective - engagement objective.
 * @param now - creation timestamp.
 * @returns the ledger object, ready for serialization.
 */
export function emptyCase(kind: DossierKind, slug: string, objective: string, now: string): Record<string, unknown> {
  return {
    version: CASE_VERSION,
    kind,
    slug,
    objective,
    createdAt: now,
    updatedAt: now,
    targets: [],
    evidence: [],
    findings: [],
    notes: [],
  }
}

/** Next free id for one collection, one past the highest numeric suffix already stored. */
function nextRecordId(raw: Record<string, unknown>, collection: CaseCollection): string {
  const prefix = ID_PREFIX[collection]
  let highest = 0
  for (const entry of recordsOf(raw, collection, collection)) {
    const id = stringField(entry, 'id')
    const suffix = Number.parseInt(id.slice(prefix.length + 1), 10)
    if (id.startsWith(`${prefix}-`) && Number.isFinite(suffix) && suffix > highest) highest = suffix
  }
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`
}

/** Require one non-empty field on a mutation record. */
function required(value: string, field: string): string {
  if (value.trim().length === 0) throw new DossierProblemError('corrupt', `${field} must not be empty`)
  return bounded(value, field)
}

/** Validate a severity before it reaches the ledger. */
function severityOf(value: string): string {
  const severity = value.trim().toLowerCase()
  if (!(CASE_SEVERITIES as readonly string[]).includes(severity)) {
    throw new DossierProblemError('corrupt', `severity "${value}" must be one of ${CASE_SEVERITIES.join(', ')}`)
  }
  return severity
}

/** Validate that every cited evidence id exists in the ledger. */
function evidenceIds(raw: Record<string, unknown>, cited: readonly string[]): string[] {
  const known = new Set(recordsOf(raw, 'evidence', 'evidence').map(entry => stringField(entry, 'id')))
  for (const id of cited) {
    if (!known.has(id)) throw new DossierProblemError('corrupt', `unknown evidence id ${id}`)
  }
  return [...cited]
}

/** Fields the mutation replaces on a target record. */
function targetFields(input: CaseTargetInput): Record<string, unknown> {
  return { value: required(input.value, 'target value'), label: bounded(input.label, 'target label'), note: bounded(input.note, 'target note') }
}

/** Fields the mutation replaces on an evidence record. */
function evidenceFields(input: CaseEvidenceInput): Record<string, unknown> {
  return {
    kind: input.kind.trim().length === 0 ? 'note' : bounded(input.kind, 'evidence kind'),
    ref: required(input.ref, 'evidence reference'),
    note: bounded(input.note, 'evidence note'),
  }
}

/** Fields the mutation replaces on a finding record. */
function findingFields(input: CaseFindingInput, raw: Record<string, unknown>): Record<string, unknown> {
  return {
    title: required(input.title, 'finding title'),
    severity: severityOf(input.severity),
    target: bounded(input.target, 'finding target'),
    cvss: bounded(input.cvss, 'finding CVSS'),
    evidence: evidenceIds(raw, input.evidence),
    note: bounded(input.note, 'finding note'),
    status: input.status.trim().length === 0 ? 'open' : bounded(input.status, 'finding status'),
  }
}

/** Fields the mutation replaces on a note record. */
function noteFields(input: CaseNoteInput): Record<string, unknown> {
  return { title: required(input.title, 'note title'), body: bounded(input.body, 'note body') }
}

/** Index of the record carrying `id`, or -1. */
function indexOfId(raw: Record<string, unknown>, collection: CaseCollection, id: string): number {
  return recordsOf(raw, collection, collection).findIndex(entry => stringField(entry, 'id') === id)
}

/** Replace one collection array on the raw object. */
function setRecords(raw: Record<string, unknown>, collection: CaseCollection, records: Record<string, unknown>[]): void {
  raw[collection] = records
}

/**
 * Apply one edit to a parsed ledger.
 *
 * The object is edited in place so unmapped fields survive, and the returned
 * document is the normalized result of that edit. The caller owns persistence.
 * @param file - parsed ledger.
 * @param mutation - edit to apply.
 * @param now - timestamp stored on new records and on `updatedAt`.
 * @returns the ledger's document after the edit.
 * @throws {DossierProblemError} when the edit names a missing record or an invalid field.
 */
export function applyCaseMutation(file: CaseFile, mutation: CaseMutation, now: string): CaseDocument {
  const { raw } = file
  if (mutation.op === 'objective') {
    raw.objective = bounded(mutation.objective, 'objective')
  } else if (mutation.op === 'delete') {
    const index = indexOfId(raw, mutation.collection, mutation.id)
    if (index < 0) throw new DossierProblemError('corrupt', `no ${mutation.collection} record with id ${mutation.id}`)
    const records = recordsOf(raw, mutation.collection, mutation.collection).filter((_entry, at) => at !== index)
    setRecords(raw, mutation.collection, records)
  } else if (mutation.op === 'append') {
    const records = recordsOf(raw, mutation.collection, mutation.collection)
    const fields = mutation.collection === 'targets'
      ? targetFields(mutation.record)
      : mutation.collection === 'evidence'
        ? evidenceFields(mutation.record)
        : mutation.collection === 'findings'
          ? findingFields(mutation.record, raw)
          : noteFields(mutation.record)
    setRecords(raw, mutation.collection, [...records, {
      id: nextRecordId(raw, mutation.collection), ...fields, addedAt: now,
    }])
  } else {
    const records = recordsOf(raw, mutation.collection, mutation.collection)
    const index = indexOfId(raw, mutation.collection, mutation.id)
    if (index < 0) throw new DossierProblemError('corrupt', `no ${mutation.collection} record with id ${mutation.id}`)
    const fields = mutation.collection === 'targets'
      ? targetFields(mutation.record)
      : mutation.collection === 'evidence'
        ? evidenceFields(mutation.record)
        : mutation.collection === 'findings'
          ? findingFields(mutation.record, raw)
          : noteFields(mutation.record)
    // Spread the stored record first: fields another writer added stay put.
    const updated = records.map((entry, at) => (at === index ? { ...entry, ...fields } : entry))
    setRecords(raw, mutation.collection, updated)
  }
  raw.updatedAt = now
  return normalizeCase(raw, file.document.slug).document
}

/**
 * Serialize a ledger for storage.
 * @param file - parsed ledger whose raw object may have been edited.
 * @returns the exact file text this service writes.
 */
export function serializeCase(file: CaseFile): string {
  return `${JSON.stringify(file.raw, null, 2)}\n`
}

/**
 * Summarize one ledger for the case list.
 * @param file - parsed ledger.
 * @param kind - dossier kind the list belongs to.
 * @returns counts and metadata for the list row.
 */
export function caseSummaryOf(file: CaseFile, kind: DossierKind): CaseSummary {
  const { document } = file
  return {
    slug: document.slug,
    kind,
    objective: document.objective,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    targets: document.targets.length,
    evidence: document.evidence.length,
    findings: document.findings.length,
    notes: document.notes.length,
    extraKeys: file.extraKeys,
  }
}

/** Render one cell without letting a stored value break the table it sits in. */
function cell(value: string): string {
  return value.replace(/\r?\n/gu, ' ').replace(/\|/gu, '\\|')
}

/**
 * Render a case ledger as the Markdown report `casefile.mjs report` prints.
 * @param document - validated ledger.
 * @returns the report text.
 */
export function renderCaseReport(document: CaseDocument): string {
  const lines: string[] = []
  lines.push(`# ${document.slug} — ${document.kind === 'reverse' ? 'reverse-engineering case' : 'security engagement'}`, '')
  if (document.objective) lines.push(`**Objective:** ${document.objective}`, '')
  lines.push(`**Created:** ${document.createdAt}`, `**Updated:** ${document.updatedAt}`, '')
  lines.push('## Targets', '', '| ID | Target | Label | Note |', '| --- | --- | --- | --- |')
  for (const target of document.targets) {
    lines.push(`| ${target.id} | \`${cell(target.value)}\` | ${cell(target.label)} | ${cell(target.note)} |`)
  }
  lines.push('', '## Findings', '', '| ID | Title | Severity | CVSS | Target | Evidence |', '| --- | --- | --- | --- | --- | --- |')
  for (const finding of document.findings) {
    lines.push(`| ${finding.id} | ${cell(finding.title)} | ${cell(finding.severity)} | ${cell(finding.cvss)} | ${cell(finding.target)} | ${finding.evidence.join(', ')} |`)
  }
  for (const finding of document.findings) {
    const bullets = [`- Severity: ${finding.severity}`]
    if (finding.cvss) bullets.push(`- CVSS: ${finding.cvss}`)
    if (finding.target) bullets.push(`- Target: ${finding.target}`)
    bullets.push(`- Evidence: ${finding.evidence.join(', ') || 'none'}`)
    lines.push('', `### ${finding.id} — ${finding.title}`, '', ...bullets, '', finding.note || '_No description recorded._')
  }
  lines.push('', '## Evidence', '', '| ID | Kind | Reference | Note |', '| --- | --- | --- | --- |')
  for (const entry of document.evidence) {
    lines.push(`| ${entry.id} | ${cell(entry.kind)} | \`${cell(entry.ref)}\` | ${cell(entry.note)} |`)
  }
  if (document.notes.length > 0) {
    lines.push('', '## Notes')
    for (const note of document.notes) lines.push('', `### ${note.id} — ${note.title}`, '', note.body)
  }
  return `${lines.join('\n')}\n`
}
