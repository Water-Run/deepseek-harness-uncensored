/**
 * Mode-owned dossier management: the `modeDossiers` Remote namespace and the
 * writing-material request context.
 *
 * Security and reverse-engineering materials are the case ledgers
 * `casefile.mjs` maintains; writing materials are the documents under
 * `story/` plus the registry that records which ones the settings surface
 * manages. Every read and write goes through the composed filesystem with a
 * workspace-relative path, so a request can never name a file outside the
 * workspace it was bound to, and writes carry the version the editor opened.
 *
 * The writing materials also enter model requests: each step of a Writing-mode
 * conversation receives the selected documents as a durable user-role context
 * message, so replay, compaction, and the session log all show exactly what
 * the model saw.
 *
 * @module @deepseek-ai/dsh-api-mode-dossiers
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { FileSystem, FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type {
  CaseCollectionView,
  CaseProblemEntry,
  CaseSummary,
  DossierCaseCreateRequest,
  DossierCaseMutationRequest,
  DossierCaseRequest,
  DossierCaseView,
  DossierInventory,
  DossierKind,
  DossierProblemCode,
  DossierReport,
  DossierSampleRequest,
  DossierScopeRequest,
  DossierSelectionRequest,
  DossierStoryCreateRequest,
  DossierStoryRequest,
  DossierStoryWriteRequest,
  DossierWorkspace,
  SampleInspection,
  StoryEntryDocument,
  StoryListing,
} from './types.ts'
import {
  applyCaseMutation,
  casePath,
  caseRoot,
  caseSummaryOf,
  emptyCase,
  parseCase,
  renderCaseReport,
  serializeCase,
  validateSlug,
  type CaseFile,
} from './casefile.ts'
import {
  DossierProblemError,
  nowIso,
  problemOf,
  readTextIfPresent,
  resolveInside,
} from './files.ts'
import {
  adoptStoryEntry,
  createStoryEntry,
  listStory,
  readSelectedMaterials,
  readStoryEntry,
  removeStoryEntry,
  renderMaterials,
  setStorySelection,
  writeStoryEntry,
} from './story.ts'
import { inspectSample } from './sample.ts'
import { toolStatuses } from './tools.ts'

export type * from './types.ts'
export { renderCaseReport } from './casefile.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Durable context this service injected on the user's behalf. */
    'mode-dossiers': { readonly kind: 'mode-dossiers' } & ContextFormed
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No workspace is selected, so the request names no dossier root. */
    'mode-dossier/no-workspace': { readonly code: string }
    /** The selected workspace is registered but its directory is unavailable. */
    'mode-dossier/workspace-missing': { readonly code: string }
    /** A dossier path could not be read with the composed filesystem. */
    'mode-dossier/unreadable': { readonly code: string }
    /** A stored file is malformed, or the edit conflicts with a newer version. */
    'mode-dossier/corrupt': { readonly code: string }
    /** A stored file declares a format version this build does not read. */
    'mode-dossier/unsupported-version': { readonly code: string }
    /** The file changed after it was opened, so the pending edit was not applied. */
    'mode-dossier/conflict': { readonly code: string }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `modeDossiers` Remote namespace. */
    modeDossiers: ModeDossiers
  }
}

/** Agent preset whose requests receive the selected writing materials. */
const WRITING_PRESET = 'writing'

/**
 * Render the writing materials one request should receive.
 *
 * Only a Writing-mode request carries materials, and only the documents the
 * registry marks as selected are read: a file under `story/` that the user did
 * not select never reaches the model through this path.
 * @param fs - composed filesystem.
 * @param rootPath - the session's workspace directory.
 * @param preset - the preset composed for the agent.
 * @param budget - inclusive byte budget; 0 disables the context.
 * @param signal - request cancellation.
 * @returns the context text, or an empty string when nothing applies.
 */
export async function writingMaterialsText(
  fs: FileSystem,
  rootPath: string,
  preset: string | undefined,
  budget: number,
  signal: AbortSignal,
): Promise<string> {
  if (preset !== WRITING_PRESET || budget <= 0) return ''
  return renderMaterials(await readSelectedMaterials(fs, rootPath, budget, signal))
}

/** Remote failure code per reported problem. */
const FAILURE_CODE = {
  'no-workspace': 'mode-dossier/no-workspace',
  'workspace-missing': 'mode-dossier/workspace-missing',
  unreadable: 'mode-dossier/unreadable',
  corrupt: 'mode-dossier/corrupt',
  conflict: 'mode-dossier/conflict',
  'unsupported-version': 'mode-dossier/unsupported-version',
} as const satisfies Record<DossierProblemCode, string>

/** Deployment limits on what one request reads or lists. */
export interface Config {
  /** Inclusive byte budget for the writing materials one request receives; 0 disables the context. */
  contextBytes?: number
  /** Inclusive cap on the bytes one sample inventory reads. */
  sampleBytes?: number
  /** Cap on the case ledgers one list reads. */
  maxCases?: number
}

/** Validated dossier configuration. */
interface ResolvedConfig {
  readonly contextBytes: number
  readonly sampleBytes: number
  readonly maxCases: number
}

/** One loaded case ledger and the storage facts a write needs. */
interface LoadedCase {
  readonly file: CaseFile
  readonly target: FsTarget
  readonly version: FsVersion
}

/** Host service behind the generated `ctx.remote.modeDossiers` namespace. */
export class ModeDossiers extends TypertRemoteService {
  static inject = ['fs', 'typert']

  static Config: z<Config, ResolvedConfig> = z.object({
    contextBytes: z.natural().min(0).default(16 * 1024),
    sampleBytes: z.natural().min(1).default(32 * 1024 * 1024),
    maxCases: z.natural().min(1).default(200),
  })

  private readonly config: ResolvedConfig
  /** Last context block injected per session, so an unchanged selection is not repeated. */
  private readonly injected = new WeakMap<object, string>()

  /**
   * @param ctx - Host context carrying the filesystem.
   * @param config - request byte budgets and listing cap.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'modeDossiers')
    this.config = ModeDossiers.Config(config)
    ctx.on('agent/pre-step', async (
      { agent, signal }: { agent: Agent; signal: AbortSignal },
      next: () => Promise<PreStepDecision>,
    ): Promise<PreStepDecision> => await this.extendRequest(ctx, agent, signal, next))
  }

  /**
   * Add the selected writing materials before one request.
   * @param ctx - Host context.
   * @param agent - agent whose step is being prepared.
   * @param signal - step cancellation.
   * @param next - the remaining pre-step chain.
   * @returns the decision, with the materials appended when this is a Writing step with a selection.
   */
  private async extendRequest(
    ctx: Context,
    agent: Agent,
    signal: AbortSignal,
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    if (ctx.get('agentPresets')?.composedPreset(agent.ctx) !== WRITING_PRESET) return decision
    const rootPath = agent.session.header.cwd ?? ctx.get('sandboxPolicy')?.workspaceRoot
    if (rootPath === undefined) return decision
    let text: string
    try {
      text = await writingMaterialsText(ctx.fs, rootPath, WRITING_PRESET, this.config.contextBytes, signal)
    } catch (error: unknown) {
      // Selected materials are optional context: a broken store must not fail the turn it would have joined.
      ctx.logger.warn('mode-dossiers: writing materials could not be read: %o', error)
      return decision
    }
    if (text.length === 0 || this.injected.get(agent.session) === text) return decision
    this.injected.set(agent.session, text)
    return {
      ...decision,
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'mode-dossiers', form: 'instructions' },
      })],
    }
  }

  /** Resolve the managed workspace or report why it cannot be named. */
  private async scope(
    workspaceId: string | undefined,
    signal: AbortSignal,
  ): Promise<{ path: string; root: FsTarget; workspace: DossierWorkspace }> {
    if (workspaceId === undefined || workspaceId.length === 0) {
      throw new DossierProblemError('no-workspace', 'Select a workspace before managing mode materials.')
    }
    const registry = this.ctx.get('workspaceRegistry')
    if (registry === undefined) {
      throw new DossierProblemError('no-workspace', 'This composition provides no workspace registry.')
    }
    const workspace = registry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) {
      throw new DossierProblemError('workspace-missing', 'The selected workspace is no longer registered.')
    }
    const root = await this.ctx.fs.resolve(workspace.path, { signal })
    const info = await this.ctx.fs.stat(root, signal)
    if (info?.type !== 'directory') {
      throw new DossierProblemError('workspace-missing', `The workspace directory ${workspace.path} is not available.`)
    }
    return {
      path: workspace.path,
      root,
      workspace: { workspaceId: String(workspace.id), title: workspace.title, path: workspace.path },
    }
  }

  /** Translate a storage condition into the Remote failure the surface renders. */
  private fail(error: unknown): never {
    const reported = problemOf(error)
    throw new RemoteError(FAILURE_CODE[reported.code], reported.message, { code: reported.code })
  }

  /** List one mode's case ledgers, reporting each unreadable ledger beside the usable ones. */
  private async caseList(path: string, kind: DossierKind, signal: AbortSignal): Promise<CaseCollectionView> {
    const fs = this.ctx.fs
    const root = await fs.resolve(path, { signal })
    const directory = await resolveInside(fs, root, path, caseRoot(kind), signal)
    const info = await fs.stat(directory, signal)
    if (info === undefined) return { cases: [], broken: [] }
    if (info.type !== 'directory') throw new DossierProblemError('unreadable', `${caseRoot(kind)} is not a directory`)
    const entries = await fs.listDir(directory, signal)
    const cases: CaseSummary[] = []
    const broken: CaseProblemEntry[] = []
    for (const entry of entries.filter(child => child.type === 'directory').slice(0, this.config.maxCases)) {
      const label = casePath(kind, entry.name)
      const target = await resolveInside(fs, root, path, label, signal)
      const text = await readTextIfPresent(fs, target, signal)
      if (text === undefined) continue
      try {
        cases.push(caseSummaryOf(parseCase(text, label), kind))
      } catch (error: unknown) {
        const reported = problemOf(error)
        broken.push({ slug: entry.name, problem: { code: reported.code, detail: reported.message } })
      }
    }
    cases.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.slug.localeCompare(right.slug))
    return { cases, broken }
  }

  /** Load one case ledger with the version a write must echo. */
  private async loadCase(path: string, kind: DossierKind, slug: string, signal: AbortSignal): Promise<LoadedCase> {
    const label = casePath(kind, validateSlug(slug))
    const root = await this.ctx.fs.resolve(path, { signal })
    const target = await resolveInside(this.ctx.fs, root, path, label, signal)
    const text = await readTextIfPresent(this.ctx.fs, target, signal)
    const info = await this.ctx.fs.stat(target, signal)
    if (text === undefined || info === undefined) {
      throw new DossierProblemError('workspace-missing', `No case at ${label}.`)
    }
    return { file: parseCase(text, label), target, version: info.version }
  }

  /** Render one loaded ledger for the wire. */
  private viewOf(loaded: LoadedCase, kind: DossierKind): DossierCaseView {
    return {
      slug: loaded.file.document.slug,
      kind,
      version: String(loaded.version),
      document: loaded.file.document,
      extraKeys: loaded.file.extraKeys,
    }
  }

  /**
   * Read the workspace's dossier inventory for the settings surface.
   * @param request - selected workspace.
   * @param signal - caller cancellation.
   * @returns case lists, writing materials, tool status, and any reported problem.
   */
  @Remote('inventory')
  async inventory(request: DossierScopeRequest, signal: AbortSignal): Promise<DossierInventory> {
    const empty: DossierInventory = {
      security: { cases: [], broken: [] },
      reverse: { cases: [], broken: [] },
      writing: { entries: [], unregistered: [], selected: [] },
      tools: toolStatuses(),
    }
    let scope: Awaited<ReturnType<ModeDossiers['scope']>>
    try {
      scope = await this.scope(request.workspaceId, signal)
    } catch (error: unknown) {
      const reported = problemOf(error)
      return { ...empty, problem: { code: reported.code, detail: reported.message } }
    }
    const list = async (kind: DossierKind): Promise<CaseCollectionView> => {
      try {
        return await this.caseList(scope.path, kind, signal)
      } catch (error: unknown) {
        const reported = problemOf(error)
        return { cases: [], broken: [], problem: { code: reported.code, detail: reported.message } }
      }
    }
    let writing: StoryListing
    try {
      writing = await listStory(this.ctx.fs, scope.path, signal)
    } catch (error: unknown) {
      const reported = problemOf(error)
      writing = { entries: [], unregistered: [], selected: [], problem: { code: reported.code, detail: reported.message } }
    }
    return {
      workspace: scope.workspace,
      security: await list('security'),
      reverse: await list('reverse'),
      writing,
      tools: toolStatuses(),
    }
  }

  /**
   * Open one case ledger.
   * @param request - workspace and case identity.
   * @param signal - caller cancellation.
   * @returns the validated document with its freshness token.
   */
  @Remote('readCase')
  async readCase(request: DossierCaseRequest, signal: AbortSignal): Promise<DossierCaseView> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      return this.viewOf(await this.loadCase(scope.path, request.kind, request.slug, signal), request.kind)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Create one empty case ledger.
   * @param request - workspace, kind, slug, and objective.
   * @param signal - caller cancellation.
   * @returns the created document.
   */
  @Remote('createCase')
  async createCase(request: DossierCaseCreateRequest, signal: AbortSignal): Promise<DossierCaseView> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      const slug = validateSlug(request.slug)
      const label = casePath(request.kind, slug)
      const target = await resolveInside(this.ctx.fs, scope.root, scope.path, label, signal)
      const existing = await this.ctx.fs.stat(target, signal)
      if (existing !== undefined) throw new DossierProblemError('corrupt', `${label} already exists.`)
      const document = emptyCase(request.kind, slug, request.objective, nowIso())
      await this.ctx.fs.writeText(target, `${JSON.stringify(document, null, 2)}\n`, { kind: 'createIfAbsent' }, signal)
      return this.viewOf(await this.loadCase(scope.path, request.kind, slug, signal), request.kind)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Apply one edit to a case ledger under its version guard.
   * @param request - case identity, expected version, and the edit.
   * @param signal - caller cancellation.
   * @returns the document after the edit.
   */
  @Remote('mutateCase')
  async mutateCase(request: DossierCaseMutationRequest, signal: AbortSignal): Promise<DossierCaseView> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      const loaded = await this.loadCase(scope.path, request.kind, request.slug, signal)
      if (String(loaded.version) !== request.expectedVersion) {
        throw new DossierProblemError('conflict', `${casePath(request.kind, request.slug)} changed since it was opened; reload it before saving.`)
      }
      applyCaseMutation(loaded.file, request.mutation, nowIso())
      await this.ctx.fs.writeText(loaded.target, serializeCase(loaded.file), { kind: 'replaceIfVersion', version: loaded.version }, signal)
      return this.viewOf(await this.loadCase(scope.path, request.kind, request.slug, signal), request.kind)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Render one case ledger's report.
   * @param request - workspace and case identity.
   * @param signal - caller cancellation.
   * @returns the Markdown report the casefile script prints.
   */
  @Remote('report')
  async report(request: DossierCaseRequest, signal: AbortSignal): Promise<DossierReport> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      const loaded = await this.loadCase(scope.path, request.kind, request.slug, signal)
      return { markdown: renderCaseReport(loaded.file.document) }
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Read one writing material.
   * @param request - workspace and material path.
   * @param signal - caller cancellation.
   * @returns the document with its version.
   */
  @Remote('readStory')
  async readStory(request: DossierStoryRequest, signal: AbortSignal): Promise<StoryEntryDocument> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      return await readStoryEntry(this.ctx.fs, scope.path, request.path, signal)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Replace one writing material's content.
   * @param request - workspace, path, expected version, and content.
   * @param signal - caller cancellation.
   * @returns the stored document with its new version.
   */
  @Remote('writeStory')
  async writeStory(request: DossierStoryWriteRequest, signal: AbortSignal): Promise<StoryEntryDocument> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      return await writeStoryEntry(this.ctx.fs, scope.path, request.path, request.markdown, request.expectedVersion, signal)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Create one writing material and register it as selected.
   * @param request - workspace, section, name, title, and initial content.
   * @param signal - caller cancellation.
   * @returns the stored document.
   */
  @Remote('createStory')
  async createStory(request: DossierStoryCreateRequest, signal: AbortSignal): Promise<StoryEntryDocument> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      return await createStoryEntry(this.ctx.fs, scope.path, request.section, request.name, request.title, request.markdown, signal)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Adopt an existing workspace document into the writing registry.
   * @param request - workspace and material path.
   * @param signal - caller cancellation.
   * @returns the listing after adoption.
   */
  @Remote('adoptStory')
  async adoptStory(request: DossierStoryRequest, signal: AbortSignal): Promise<DossierInventory> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      await adoptStoryEntry(this.ctx.fs, scope.path, request.path, signal)
      return await this.inventory(request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId }, signal)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Remove one material's registry record, keeping its document.
   * @param request - workspace and material path.
   * @param signal - caller cancellation.
   * @returns the selection after removal.
   */
  @Remote('removeStory')
  async removeStory(request: DossierStoryRequest, signal: AbortSignal): Promise<{ readonly selected: readonly string[] }> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      return await removeStoryEntry(this.ctx.fs, scope.path, request.path, signal)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Replace the selected writing material set.
   * @param request - workspace and the paths writing requests should receive.
   * @param signal - caller cancellation.
   * @returns the stored selection.
   */
  @Remote('selectStory')
  async selectStory(request: DossierSelectionRequest, signal: AbortSignal): Promise<{ readonly selected: readonly string[] }> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      return await setStorySelection(this.ctx.fs, scope.path, request.selected, signal)
    } catch (error: unknown) {
      this.fail(error)
    }
  }

  /**
   * Inspect one sample without executing it.
   * @param request - workspace and sample path.
   * @param signal - caller cancellation.
   * @returns the recognized format, hashes, entropy, and bounded strings.
   */
  @Remote('inspectSample')
  async inspectSample(request: DossierSampleRequest, signal: AbortSignal): Promise<SampleInspection> {
    try {
      const scope = await this.scope(request.workspaceId, signal)
      return await inspectSample(this.ctx.fs, scope.path, request.path, this.config.sampleBytes, signal)
    } catch (error: unknown) {
      this.fail(error)
    }
  }
}

export default ModeDossiers
