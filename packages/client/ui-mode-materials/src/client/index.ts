/**
 * Browser half: the mode-materials settings contribution.
 *
 * Three registrations share one controller: the Security, Reverse, and Writing
 * panels read one inventory of the selected workspace and call the Host's
 * `modeDossiers` namespace for every read and write. The workspace is chosen
 * once here, so the three panels always describe the same materials.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
// Type-only: pulls the generated `modeDossiers` namespace into `ctx.remote`.
import type {} from '@deepseek-ai/dsh-api-mode-dossiers/remote'
// Type-only: pulls the Client `remote` face and forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-gateway/client'
// Type-only: pulls `ctx.locale`, the slot registry, and the settings type merges.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-memory/client'
// Type-only: pulls `useWorkspaces` and `ctx.uiWorkspace`.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { en, zh, type ModeMaterialsKey } from './locales.ts'
import { ReverseMaterials, SecurityMaterials, WritingMaterials } from './ModeMaterials.tsx'
import type { MaterialsFailure, MaterialsState, ModeMaterialsInjected } from './contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Mode-materials settings copy. */
    'settings.modeDossiers': ModeMaterialsKey
  }
}

/** Required services: the slot registry, dictionaries, Remote, and Workspace UI. */
export const inject = ['slots', 'locale', 'remote', 'remote.modeDossiers', 'workspaces', 'uiWorkspace']

/** One rejected operation, carrying the Host's failure code. */
class MaterialsFailureError extends Error implements MaterialsFailure {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'MaterialsFailureError'
  }
}

/**
 * Unwrap one Remote result, turning a failure envelope into a thrown failure.
 * @param operation - the generated namespace call.
 * @returns the call's value.
 * @throws {MaterialsFailureError} when the Host answered with a failure.
 */
async function unwrap<T>(operation: Promise<RemoteResult<T>>): Promise<T> {
  const result = await operation
  if (!result.ok) throw new MaterialsFailureError(result.error.code, result.error.message)
  return result.value
}

/**
 * Mount the three panels into the mode settings section.
 * @param ctx - Client root Context.
 */
export function apply(ctx: ClientContext): void {
  const store = createSnapshotStore<MaterialsState>({ workspaceId: undefined, phase: 'idle', inventory: undefined, error: undefined })
  let generation = 0
  // One request per call: these operations are short reads and writes, and a
  // superseded load is discarded through the generation guard.
  const signal = (): AbortSignal => new AbortController().signal

  const load = async (workspaceId: string | undefined): Promise<void> => {
    const current = ++generation
    store.set({ workspaceId, phase: 'loading', inventory: store.getSnapshot().inventory, error: undefined })
    try {
      const inventory = await unwrap(ctx.remote.modeDossiers.inventory(
        workspaceId === undefined ? {} : { workspaceId }, signal(),
      ))
      if (current !== generation) return
      store.set({ workspaceId, phase: 'ready', inventory, error: undefined })
    } catch (error: unknown) {
      if (current !== generation) return
      store.set({
        workspaceId,
        phase: 'error',
        inventory: undefined,
        error: error instanceof MaterialsFailureError
          ? { code: error.code, message: error.message }
          : { code: 'mode-dossier/unreadable', message: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  const operations: ModeMaterialsInjected = {
    rea: {
      load: () => unwrap(ctx.remote.modeDossiers.reaSettings()),
      save: (options, expectedRevision) => unwrap(ctx.remote.modeDossiers.configureRea({ options, expectedRevision })),
      probe: signal => unwrap(ctx.remote.modeDossiers.probeRea(signal)),
    },
    openMemory: (mode, workspaceId) => { ctx.emit('memory/open-manager', mode, workspaceId === undefined ? undefined : `workspace:${workspaceId}`) },
    hooks: { materials: store },
    load,
    readCase: request => unwrap(ctx.remote.modeDossiers.readCase({ ...request }, signal())),
    mutateCase: request => unwrap(ctx.remote.modeDossiers.mutateCase({ ...request }, signal())),
    createCase: request => unwrap(ctx.remote.modeDossiers.createCase({ ...request }, signal())),
    renderReport: request => unwrap(ctx.remote.modeDossiers.report({ ...request }, signal())),
    readStory: request => unwrap(ctx.remote.modeDossiers.readStory({ ...request }, signal())),
    writeStory: request => unwrap(ctx.remote.modeDossiers.writeStory({ ...request }, signal())),
    createStory: request => unwrap(ctx.remote.modeDossiers.createStory({ ...request }, signal())),
    adoptStory: request => unwrap(ctx.remote.modeDossiers.adoptStory({ ...request }, signal())),
    removeStory: request => unwrap(ctx.remote.modeDossiers.removeStory({ ...request }, signal())),
    selectStory: request => unwrap(ctx.remote.modeDossiers.selectStory({ ...request }, signal())),
    inspectSample: request => unwrap(ctx.remote.modeDossiers.inspectSample({ ...request }, signal())),
    createWorkspace: async (path) => {
      const workspace = await ctx.workspaces.create({ path })
      return String(workspace.workspaceId)
    },
    pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
  }
  const injected = (): ModeMaterialsInjected => operations

  ctx.effect(() => ctx.locale.register('settings.modeDossiers', { zh, en }), 'mode-dossiers: dictionaries')

  const panels = [
    { id: 'security', order: 10, component: SecurityMaterials },
    { id: 'reverse', order: 20, component: ReverseMaterials },
    { id: 'writing', order: 30, component: WritingMaterials },
  ] as const
  for (const panel of panels) {
    ctx.slots.inject('settings.mode.materials', () => ctx.slots.register({
      name: 'settings.mode.materials',
      id: panel.id,
      order: panel.order,
      locale: 'settings.modeDossiers',
      inject: injected,
    }, panel.component))
  }
}
