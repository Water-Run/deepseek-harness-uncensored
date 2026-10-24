/** Workspace scope bar: which workspace the panels manage and how to change it. */

import { useEffect, useState, type ReactNode } from 'react'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { MaterialsFailure, MaterialsState, MaterialScope } from './contract.ts'
import type { Translate } from './ui.tsx'
import css from './ModeMaterials.module.css'

/** Props of the scope bar shared by every mode panel. */
export interface ScopeBarProps {
  readonly state: MaterialsState
  readonly items: readonly WorkspaceView[]
  readonly scope: MaterialScope | undefined
  readonly t: Translate
  readonly load: (workspaceId: string | undefined) => Promise<void>
  readonly pickDirectory: () => Promise<string | null>
  readonly createWorkspace: (path: string) => Promise<string>
}

/** Render the managed workspace, its path, and the failure of a selection attempt. */
export function ScopeBar({ state, items, scope, t, load, pickDirectory, createWorkspace }: ScopeBarProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<MaterialsFailure | undefined>(undefined)
  const [choosing, setChoosing] = useState(false)
  const current = state.workspaceId === undefined
    ? undefined
    : items.find(item => item.workspaceId === state.workspaceId)
  // A first visit lands on the first registered workspace instead of an empty panel.
  useEffect(() => {
    if (state.workspaceId !== undefined || items.length === 0) return
    const first = items[0]
    if (first !== undefined) void load(first.workspaceId)
  }, [state.workspaceId, items, load])
  const choose = async (): Promise<void> => {
    setChoosing(true)
    setFailure(undefined)
    try {
      const path = await pickDirectory()
      if (path === null) return
      await load(await createWorkspace(path))
    } catch (error: unknown) {
      setFailure({ code: 'scope/pick-failed', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setChoosing(false)
    }
  }
  return <div className={css.scope}>
    <div className={css.scopeRow}>
      <span className={css.scopeLabel}>{t('scope.label')}</span>
      {items.length === 0
        ? <span className={css.scopeNone}>{t('scope.none')}</span>
        : <Menu open={open} onClose={() => { setOpen(false) }} align="start" portal
          selectedId={state.workspaceId}
          items={items.map(item => ({ id: item.workspaceId, label: item.title }))}
          onSelect={(id) => { setOpen(false); void load(id) }}
          anchor={<button type="button" className={css.scopeButton} aria-haspopup="menu" aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}>
            {current?.title ?? t('scope.none')}
            <span aria-hidden="true" className={css.scopeCaret}>▾</span>
          </button>} />}
      <span className={css.scopeSpacer} />
      <Button variant="outline" size="sm" disabled={choosing} onClick={() => { void choose() }}>
        {t('scope.choose')}
      </Button>
      <Button variant="ghost" size="sm" disabled={scope === undefined || state.phase === 'loading'}
        onClick={() => { void load(state.workspaceId) }}>
        {t('reload')}
      </Button>
    </div>
    <p className={css.scopePath} title={state.inventory?.workspace?.path}>
      {state.inventory?.workspace?.path ?? t('scope.noneHint')}
    </p>
    {state.workspaceId === undefined && items.length === 0
      ? <p className={css.hint}>{t('scope.noneHint')}</p>
      : <p className={css.hint}>{t('scope.range')}</p>}
    {failure === undefined
      ? null
      : <p className={css.error} role="alert">
        {failure.code === 'scope/pick-failed' ? t('scope.pickFailed', { reason: failure.message }) : failure.message}
      </p>}
  </div>
}
