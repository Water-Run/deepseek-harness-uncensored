/** Optional settings-header action for opening a file-backed Host document. */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsDocumentStore } from './settings-document-store.ts'
import css from './SettingsDocumentAction.module.css'

/** Registrant-owned dependencies of {@link SettingsDocumentAction}. */
export interface SettingsDocumentActionInjected {
  /** Provider metadata and action state owner. */
  controller: SettingsDocumentStore
  hooks: {
    /** Controller snapshot bound by the UI renderer as useSnapshot. */
    snapshot: SettingsDocumentStore['store']
  }
}

/** Header-action owner share, localized copy, and the registrant's state face. */
export type SettingsDocumentActionProps =
  PropsRuntime<'settings.action'> & PropsLocale<'settings'> & InjectFace<SettingsDocumentActionInjected>

/**
 * Render the open-document action only after Host metadata confirms document availability.
 * @param props - header owner props, localized copy, and injected document state.
 * @returns the action, or null while unavailable or unresolved.
 */
export function SettingsDocumentAction({ controller, useSnapshot, t }: SettingsDocumentActionProps): ReactNode {
  const state = useSnapshot(snapshot => snapshot)

  useEffect(() => {
    void controller.load()
  }, [controller])

  if (state.status !== 'ready') return null

  return (
    <div className={css.action}>
      <Button
        variant="outline"
        size="sm"
        disabled={state.opening}
        onClick={() => { void controller.open() }}
      >
        {t('openDocument')}
      </Button>
    </div>
  )
}

/**
 * Keep open-document feedback visible after the settings dialog closes.
 * @param props - Root overlay, localized copy and the document operation state.
 * @returns The latest operation result, or null before a result is available.
 */
export function SettingsDocumentToast({ controller, useSnapshot, t }:
  PropsRuntime<'shell.overlay'> & PropsLocale<'settings'> & InjectFace<SettingsDocumentActionInjected>): ReactNode {
  const notice = useSnapshot(snapshot => snapshot.notice)
  if (notice === null) return null
  return <Toast key={notice.id} text={t(notice.opened ? 'openDocument.success' : 'openDocument.error')}
    {...notice.opened ? { tone: 'success' as const } : {}}
    onDone={() => { controller.dismissNotice(notice.id) }} />
}
