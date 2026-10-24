/** Startup reminder for a newer GitHub release. Patch notes stay on the About page. */
import { useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountMenuProps } from './AccountMenu.tsx'
import { loadForkRelease, type ReleaseNotice } from './release-status.ts'

const DISMISSED = 'dsh.uncensored.release.dismissed'

/**
 * Show a startup dialog for a minor or major release. Failures stay silent here and visible in About.
 * @param props - Localized labels.
 * @returns The dialog, or nothing when no reminder is due.
 */
export function ReleaseReminder({ t }: { t: AccountMenuProps['t'] }) {
  const [notice, setNotice] = useState<ReleaseNotice>({ phase: 'checking' })
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void loadForkRelease((input, init) => fetch(input, { ...init, signal: controller.signal }), process.env.DSH_CLIENT_FORK_VERSION ?? '').then((next) => {
      if (controller.signal.aborted) return
      setNotice(next)
      if (next.phase !== 'available' || next.version === undefined || next.severity === 'patch') return
      try {
        if (localStorage.getItem(DISMISSED) === next.version) return
      } catch {
        // Private storage still shows the reminder once for this page load.
      }
      setOpen(true)
    })
    return () => { controller.abort() }
  }, [])
  if (!open || notice.phase !== 'available' || notice.version === undefined) return null
  const dismiss = (): void => {
    try { localStorage.setItem(DISMISSED, notice.version ?? '') } catch { /* The dialog can still close. */ }
    setOpen(false)
  }
  return <Modal open onClose={dismiss} closeLabel={t('close')} title={t(notice.severity === 'major' ? 'aboutMajor' : 'aboutMinor')}>
    <p>{t('aboutAvailable', { version: notice.version })}</p>
    {notice.url !== undefined && <p><a href={notice.url} target="_blank" rel="noreferrer">{notice.url}</a></p>}
    <Button onClick={dismiss}>{t('aboutDismiss')}</Button>
  </Modal>
}
