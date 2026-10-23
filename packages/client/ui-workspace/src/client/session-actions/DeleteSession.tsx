/** Permanent-delete action and its root-owned confirmation dialog. */
import { Button, IconTrashOutlineRegular, MenuItemButton, Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionMenuItemProps } from '../contract/slots.ts'
import type { DeleteSessionController } from './delete-controller.ts'
import css from '../rows/WorkspaceBrowser.module.css'

/** Shared operation owner supplied by the Workspace plugin. */
export interface DeleteSessionInjected {
  controller: DeleteSessionController
  hooks: { deletion: DeleteSessionController['state'] }
}

/**
 * Offer permanent deletion from the Session row's menu.
 * @param props - Captured row identity, menu state and root operation controller.
 * @returns Destructive action leading to confirmation.
 */
export function DeleteSessionMenuItem({
  sessionId, displayTitle, useMenuOpenState, controller, t,
}: SessionMenuItemProps<DeleteSessionInjected>) {
  const [, setOpen] = useMenuOpenState()
  return <MenuItemButton icon={<IconTrashOutlineRegular size={14} />} onSelect={() => {
    setOpen(false)
    controller.request(sessionId, displayTitle)
  }}>{t('sessionDelete.session')}</MenuItemButton>
}

/**
 * Keep confirmation and result feedback alive while the deleted row or selected conversation unmounts.
 * @param props - Shared operation state and localized copy.
 * @returns Confirmation dialog and operation notification.
 */
export function DeleteSessionDialog({ controller, useDeletion, t }: PropsRuntime<'shell.overlay'>
  & PropsLocale<'workspace'> & InjectFace<DeleteSessionInjected>) {
  const state = useDeletion(value => value)
  return <>
    {state.notice !== null && <Toast key={state.notice.id}
      text={t(state.notice.retry === null ? 'sessionDelete.done' : 'sessionDelete.retryNotice')}
      {...state.notice.retry === null ? { tone: 'success' as const } : {
        actions: [{ label: t('sessionDelete.retry'), onClick: controller.retry }], holdMs: 8000,
      }} onDone={() => { if (state.notice !== null) controller.dismiss(state.notice.id) }} />}
    <Modal open={state.target !== null} onClose={controller.cancel} closeLabel={t('close')}
      title={t('sessionDelete.title')} description={t('sessionDelete.description', { title: state.target?.title ?? '' })}
      footer={<>
        <Button variant="outline" disabled={state.busy} onClick={controller.cancel}>{t('cancel')}</Button>
        <Button variant="outline" className={css.deleteAction} disabled={state.busy} onClick={() => { void controller.confirm() }}>
          {t(state.error === null ? 'sessionDelete.confirm' : 'sessionDelete.retry')}
        </Button>
      </>}>
      <p>{t('sessionDelete.detail')}</p>
      {state.busy && <p role="status">{t('sessionDelete.pending')}</p>}
      {state.error !== null && <p role="alert" className={css.renameError}>{t(`sessionDelete.error.${state.error}`)}</p>}
    </Modal>
  </>
}
