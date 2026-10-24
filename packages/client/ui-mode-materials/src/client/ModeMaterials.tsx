/**
 * The three mode-materials panels as one settings-section contribution each.
 *
 * Every panel stays mounted while the section is open and renders nothing
 * unless it owns the mode being configured, so moving between configuration
 * tabs never destroys a panel's open dialog, draft text, or scroll position.
 */

import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { MaterialsState, MaterialScope, ModeMaterialsInjected } from './contract.ts'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { CaseWorkbench } from './CaseWorkbench.tsx'
import { ReversePanel } from './ReversePanel.tsx'
import { ScopeBar } from './scope.tsx'
import { WritingPanel } from './WritingPanel.tsx'
import { FailureNote, type Translate } from './ui.tsx'
import css from './ModeMaterials.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Mode-materials settings copy. */
    'settings.modeDossiers': import('./locales.ts').ModeMaterialsKey
  }
}

/** Props assembled by the settings renderer for one panel. */
export type ModeMaterialsProps =
  PropsRuntime<'settings.mode.materials'>
  & PropsLocale<'settings.modeDossiers'>
  & InjectFace<ModeMaterialsInjected>

/** The scope the panels operate on, absent until a workspace is selected. */
function scopeOf(state: MaterialsState): MaterialScope | undefined {
  return state.workspaceId === undefined ? undefined : { workspaceId: state.workspaceId }
}

/** Shared panel frame: scope bar, transport failure, loading state, content. */
function PanelFrame({ props, state, items, children }: {
  readonly props: ModeMaterialsProps
  readonly state: MaterialsState
  readonly items: readonly WorkspaceView[]
  readonly children: ReactNode
}): ReactNode {
  const t: Translate = props.t
  const { load, pickDirectory, createWorkspace } = props
  return <div className={css.frame}>
    <ScopeBar state={state} items={items} scope={scopeOf(state)} t={t}
      load={load} pickDirectory={pickDirectory}
      createWorkspace={createWorkspace} />
    {state.error === undefined ? null : <FailureNote failure={state.error} t={t} />}
    {state.phase === 'loading' && state.inventory === undefined
      ? <p className={css.hint}>{t('loading')}</p>
      : children}
  </div>
}

/** Security materials: the `.security/` case workbench. */
export function SecurityMaterials(props: ModeMaterialsProps): ReactNode {
  const state = props.useMaterials(value => value)
  const items = props.useWorkspaces(snapshot => snapshot.items)
  if (props.modeId !== 'security') return null
  return <PanelFrame props={props} state={state} items={items}>
    <CaseWorkbench kind="security" operations={props} t={props.t} scope={scopeOf(state)}
      collection={state.inventory?.security}
      title={props.t('security.title')} intro={props.t('security.intro')}
      emptyText={props.t('security.empty')} protectionNote={props.t('security.protection')} />
  </PanelFrame>
}

/** Reverse-engineering materials: analysis cases, tool status, sample inventory. */
export function ReverseMaterials(props: ModeMaterialsProps): ReactNode {
  const state = props.useMaterials(value => value)
  const items = props.useWorkspaces(snapshot => snapshot.items)
  if (props.modeId !== 'reverse') return null
  return <PanelFrame props={props} state={state} items={items}>
    <ReversePanel operations={props} t={props.t} scope={scopeOf(state)}
      collection={state.inventory?.reverse} tools={state.inventory?.tools ?? []} />
  </PanelFrame>
}

/** Writing materials: the `story/` registry, its selection, and its documents. */
export function WritingMaterials(props: ModeMaterialsProps): ReactNode {
  const state = props.useMaterials(value => value)
  const items = props.useWorkspaces(snapshot => snapshot.items)
  if (props.modeId !== 'writing') return null
  return <PanelFrame props={props} state={state} items={items}>
    <WritingPanel operations={props} t={props.t} scope={scopeOf(state)} listing={state.inventory?.writing} />
  </PanelFrame>
}
