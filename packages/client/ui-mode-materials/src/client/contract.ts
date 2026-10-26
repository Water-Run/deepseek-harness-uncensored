/**
 * Contract of the mode-materials settings surface: the injected operations the
 * panels call, the store they read, and the failure a panel renders.
 *
 * Values crossing this face are JSON data plus callbacks, as the client slot
 * rules require. The panels never see `ctx`, a service, or a transport type.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  CaseMutation,
  DossierCaseView,
  DossierInventory,
  DossierKind,
  DossierReport,
  SampleInspection,
  StoryEntryDocument,
  StorySection,
  ReaOptions,
  ReaProbe,
} from '@deepseek-ai/dsh-api-mode-dossiers/types'

/** What the surface knows about the selected workspace and its materials. */
export interface MaterialsState {
  /** Workspace the loaded inventory describes. */
  readonly workspaceId: string | undefined
  readonly phase: 'idle' | 'loading' | 'ready' | 'error'
  readonly inventory: DossierInventory | undefined
  /** Transport failure of the last load, not a reported storage problem. */
  readonly error: MaterialsFailure | undefined
}

/** One failed operation, in the vocabulary a panel can localize. */
export interface MaterialsFailure {
  /** Remote failure code, for example `mode-dossier/conflict`. */
  readonly code: string
  /** Operator-facing detail from the Host. */
  readonly message: string
}

/** One scope argument the panels pass to every operation. */
export interface MaterialScope {
  readonly workspaceId: string
}

/** Operations the mode-materials surface performs. */
export interface MaterialsOperations {
  /** Owner-only external analysis preferences; absent in profiles without REA. */
  rea?: {
    load(signal: AbortSignal): Promise<{ options: ReaOptions; revision: number | null } | null>
    save(options: ReaOptions, expectedRevision: number, signal: AbortSignal): Promise<void>
    probe(signal: AbortSignal): Promise<ReaProbe>
  }
  /** Open scoped memory management for the configured mode. */
  openMemory(mode?: string, workspaceId?: string): void
  /** Read one workspace's inventory. */
  load(workspaceId: string | undefined): Promise<void>
  /** Read one case ledger. */
  readCase(request: MaterialScope & { readonly kind: DossierKind; readonly slug: string }): Promise<DossierCaseView>
  /** Apply one edit to a case ledger. */
  mutateCase(request: MaterialScope & {
    readonly kind: DossierKind
    readonly slug: string
    readonly expectedVersion: string
    readonly mutation: CaseMutation
  }): Promise<DossierCaseView>
  /** Create one case ledger. */
  createCase(request: MaterialScope & {
    readonly kind: DossierKind
    readonly slug: string
    readonly objective: string
  }): Promise<DossierCaseView>
  /** Render one case report. */
  renderReport(request: MaterialScope & { readonly kind: DossierKind; readonly slug: string }): Promise<DossierReport>
  /** Read one writing material. */
  readStory(request: MaterialScope & { readonly path: string }): Promise<StoryEntryDocument>
  /** Replace one writing material. */
  writeStory(request: MaterialScope & {
    readonly path: string
    readonly expectedVersion: string
    readonly markdown: string
  }): Promise<StoryEntryDocument>
  /** Create one writing material. */
  createStory(request: MaterialScope & {
    readonly section: StorySection
    readonly name: string
    readonly title: string
    readonly markdown: string
  }): Promise<StoryEntryDocument>
  /** Adopt an existing document into the registry. */
  adoptStory(request: MaterialScope & { readonly path: string }): Promise<DossierInventory>
  /** Drop one material's registry record, keeping its document. */
  removeStory(request: MaterialScope & { readonly path: string }): Promise<{ readonly selected: readonly string[] }>
  /** Replace the selected material set. */
  selectStory(request: MaterialScope & { readonly selected: readonly string[] }): Promise<{ readonly selected: readonly string[] }>
  /** Read-only sample inventory. */
  inspectSample(request: MaterialScope & { readonly path: string }): Promise<SampleInspection>
  /** Register a directory as a workspace and return its identity. */
  createWorkspace(path: string): Promise<string>
  /** Open the Host directory picker. */
  pickDirectory(): Promise<string | null>
}

/** Props every mode-materials panel receives. */
export interface ModeMaterialsInjected extends MaterialsOperations {
  hooks: {
    /** Inventory of the selected workspace. */
    materials: SnapshotStore<MaterialsState>
  }
}
