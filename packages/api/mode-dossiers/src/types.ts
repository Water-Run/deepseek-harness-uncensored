/**
 * Wire vocabulary for the mode dossier service.
 *
 * Every type here is lossless JSON: these values cross the Remote boundary,
 * and the generated Client declarations are built from them. The storage files
 * themselves are owned by `casefile.mjs` and the writing playbooks, so the
 * field names below follow those on-disk formats rather than inventing a
 * parallel model.
 */

/** Specialized modes whose materials this service manages. */
export type DossierKind = 'security' | 'reverse'

/** Record collections inside one case ledger. */
export type CaseCollection = 'targets' | 'evidence' | 'findings' | 'notes'

/** Severity vocabulary accepted by `casefile.mjs`. */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** Which writing document family a material belongs to. */
export type StorySection = 'style' | 'bible'

/** One target recorded in a case ledger. */
export interface CaseTarget {
  readonly id: string
  readonly value: string
  readonly label: string
  readonly note: string
  readonly addedAt: string
}

/** One evidence reference recorded in a case ledger. */
export interface CaseEvidence {
  readonly id: string
  readonly kind: string
  readonly ref: string
  readonly note: string
  readonly addedAt: string
}

/** One finding recorded in a case ledger. */
export interface CaseFinding {
  readonly id: string
  readonly title: string
  readonly severity: string
  readonly target: string
  readonly cvss: string
  readonly evidence: readonly string[]
  readonly note: string
  readonly status: string
  readonly addedAt: string
}

/** One free-form note recorded in a case ledger. */
export interface CaseNote {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly addedAt: string
}

/** The `case.json` document as this service reads and validates it. */
export interface CaseDocument {
  readonly version: number
  readonly kind: string
  readonly slug: string
  readonly objective: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly targets: readonly CaseTarget[]
  readonly evidence: readonly CaseEvidence[]
  readonly findings: readonly CaseFinding[]
  readonly notes: readonly CaseNote[]
}

/** Counts and metadata shown in a case list. */
export interface CaseSummary {
  readonly slug: string
  readonly kind: DossierKind
  readonly objective: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly targets: number
  readonly evidence: number
  readonly findings: number
  readonly notes: number
  /** Top-level keys this service does not model; they stay on disk untouched. */
  readonly extraKeys: readonly string[]
}

/** One opened case ledger with its freshness token. */
export interface DossierCaseView {
  readonly slug: string
  readonly kind: DossierKind
  /** Opaque filesystem version the read produced; a write must echo it. */
  readonly version: string
  readonly document: CaseDocument
  /** Top-level keys this service does not model; they stay on disk untouched. */
  readonly extraKeys: readonly string[]
}

/** Caller-supplied fields of a new or edited target. */
export interface CaseTargetInput {
  readonly value: string
  readonly label: string
  readonly note: string
}

/** Caller-supplied fields of a new or edited evidence reference. */
export interface CaseEvidenceInput {
  readonly kind: string
  readonly ref: string
  readonly note: string
}

/** Caller-supplied fields of a new or edited finding. */
export interface CaseFindingInput {
  readonly title: string
  readonly severity: string
  readonly target: string
  readonly cvss: string
  readonly evidence: readonly string[]
  readonly note: string
  readonly status: string
}

/** Caller-supplied fields of a new or edited note. */
export interface CaseNoteInput {
  readonly title: string
  readonly body: string
}

/** One edit applied to a case ledger under its version guard. */
export type CaseMutation =
  | { readonly op: 'objective'; readonly objective: string }
  | { readonly op: 'append'; readonly collection: 'targets'; readonly record: CaseTargetInput }
  | { readonly op: 'append'; readonly collection: 'evidence'; readonly record: CaseEvidenceInput }
  | { readonly op: 'append'; readonly collection: 'findings'; readonly record: CaseFindingInput }
  | { readonly op: 'append'; readonly collection: 'notes'; readonly record: CaseNoteInput }
  | { readonly op: 'update'; readonly collection: 'targets'; readonly id: string; readonly record: CaseTargetInput }
  | { readonly op: 'update'; readonly collection: 'evidence'; readonly id: string; readonly record: CaseEvidenceInput }
  | { readonly op: 'update'; readonly collection: 'findings'; readonly id: string; readonly record: CaseFindingInput }
  | { readonly op: 'update'; readonly collection: 'notes'; readonly id: string; readonly record: CaseNoteInput }
  | { readonly op: 'delete'; readonly collection: CaseCollection; readonly id: string }

/** A structured condition the surface reports instead of an exception. */
export interface DossierProblem {
  readonly code: DossierProblemCode
  readonly detail: string
}

/** Conditions a dossier surface can show without failing the whole request. */
export type DossierProblemCode =
  /** No workspace is selected, so no dossier root can be named. */
  | 'no-workspace'
  /** The selected workspace is registered but its directory is gone. */
  | 'workspace-missing'
  /** The directory exists but could not be read with the composed filesystem. */
  | 'unreadable'
  /** A stored file is not valid JSON. */
  | 'corrupt'
  /** A stored file declares a format version this build does not understand. */
  | 'unsupported-version'
  /** The file changed after it was opened, so the pending edit was not applied. */
  | 'conflict'

/** The workspace a dossier surface is bound to. */
export interface DossierWorkspace {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
}

/** One case ledger that could not be read, shown beside the usable ones. */
export interface CaseProblemEntry {
  readonly slug: string
  readonly problem: DossierProblem
}

/** One case list, with the reason it could not be read when that applies. */
export interface CaseCollectionView {
  readonly cases: readonly CaseSummary[]
  /** Ledgers that exist but cannot be shown; the surface reports each one. */
  readonly broken: readonly CaseProblemEntry[]
  readonly problem?: DossierProblem
}

/** One writing material shown in the registry. */
export interface StoryEntryView {
  /** Workspace-relative path, always POSIX-separated. */
  readonly path: string
  readonly title: string
  readonly section: StorySection
  /** Whether writing requests currently receive this material. */
  readonly selected: boolean
  /** Whether the registry holds a record for the path. */
  readonly registered: boolean
  /** Whether the registered file is absent from the workspace. */
  readonly missing: boolean
  readonly bytes?: number
}

/** The writing registry beside the files the workspace already holds. */
export interface StoryListing {
  readonly entries: readonly StoryEntryView[]
  /** Markdown files in `story/` that the registry does not record yet. */
  readonly unregistered: readonly StoryEntryView[]
  readonly selected: readonly string[]
  readonly problem?: DossierProblem
}

/** One writing material's content with its freshness token. */
export interface StoryEntryDocument {
  readonly path: string
  readonly title: string
  readonly section: StorySection
  readonly version: string
  readonly markdown: string
}

/** Whether one reverse-engineering tool is actually reachable from this Host. */
export interface ToolStatus {
  readonly id: string
  readonly name: string
  readonly kind: 'builtin' | 'external'
  readonly available: boolean
  readonly detail: string
}

/** Everything the settings surface renders for the selected workspace. */
export interface DossierInventory {
  readonly workspace?: DossierWorkspace
  readonly problem?: DossierProblem
  readonly security: CaseCollectionView
  readonly reverse: CaseCollectionView
  readonly writing: StoryListing
  readonly tools: readonly ToolStatus[]
}

/** Read-only facts extracted from one sample file. */
export interface SampleInspection {
  /** Workspace-relative path when it stays inside the workspace, else the display path. */
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  readonly magic: string
  readonly formats: readonly string[]
  readonly entropy: number
  /** Bounded printable runs, in file order. */
  readonly strings: readonly string[]
  /** Whether more strings were found than the cap returned. */
  readonly stringsTruncated: boolean
}

/** Selects the workspace whose materials are managed. */
export interface DossierScopeRequest {
  /** Registered workspace identity; omitted while no workspace is selected. */
  readonly workspaceId?: string
}

/** Names one case ledger. */
export interface DossierCaseRequest extends DossierScopeRequest {
  readonly kind: DossierKind
  readonly slug: string
}

/** Applies one edit to an opened case ledger. */
export interface DossierCaseMutationRequest extends DossierCaseRequest {
  /** Version of the document the edit was written against. */
  readonly expectedVersion: string
  readonly mutation: CaseMutation
}

/** Creates one case ledger. */
export interface DossierCaseCreateRequest extends DossierScopeRequest {
  readonly kind: DossierKind
  /** Directory name under `.security/` or `.reverse/`. */
  readonly slug: string
  readonly objective: string
}

/** Names one writing material by workspace-relative path. */
export interface DossierStoryRequest extends DossierScopeRequest {
  readonly path: string
}

/** Replaces one writing material's content. */
export interface DossierStoryWriteRequest extends DossierStoryRequest {
  readonly expectedVersion: string
  readonly markdown: string
}

/** Creates one writing material and registers it. */
export interface DossierStoryCreateRequest extends DossierScopeRequest {
  readonly section: StorySection
  readonly title: string
  /** File stem; letters, digits, dot, underscore and hyphen only. */
  readonly name: string
  readonly markdown: string
}

/** Replaces the set of materials writing requests receive. */
export interface DossierSelectionRequest extends DossierScopeRequest {
  readonly selected: readonly string[]
}

/** Names one sample file for read-only inventory. */
export interface DossierSampleRequest extends DossierScopeRequest {
  readonly path: string
}

/** Rendered Markdown report for one case. */
export interface DossierReport {
  readonly markdown: string
}
export type { ReaOptions, ReaProbe } from '@deepseek-ai/dsh-rea/types'
