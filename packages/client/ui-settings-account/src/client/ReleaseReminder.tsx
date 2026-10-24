/** Startup reminder for a newer GitHub release. Patch notes stay on the About page. */
import { useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountMenuProps } from './AccountMenu.tsx'
import { loadForkRelease, type ReleaseNotice } from './release-status.ts'
import { publicContactConfig } from './public-config.ts'
import { GitHubIcon } from './GitHubIcon.tsx'
import css from './ReleaseReminder.module.css'

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
    void loadForkRelease(fetch, process.env.DSH_CLIENT_FORK_VERSION ?? '', { signal: controller.signal, timeoutMs: publicContactConfig().releaseCheckTimeoutMs }).then((next) => {
      if (controller.signal.aborted) return
      setNotice(next)
      if (next.phase !== 'available' || next.version === undefined || next.severity === 'patch') return
      try {
        if (sessionStorage.getItem(DISMISSED) === next.version) return
      } catch (error) {
        console.warn('[release] reminder session storage is unavailable', error)
      }
      setOpen(true)
    })
    return () => { controller.abort() }
  }, [])
  if (!open || notice.phase !== 'available' || notice.version === undefined) return null
  const dismiss = (): void => {
    try { sessionStorage.setItem(DISMISSED, notice.version ?? '') }
    catch (error) { console.warn('[release] could not remember dismissal for this startup', error) }
    setOpen(false)
  }
  return <Modal open onClose={dismiss} closeLabel={t('close')} title={t(notice.severity === 'major' ? 'aboutMajor' : 'aboutMinor')}
    footer={<Button variant="outline" onClick={dismiss}>{t('aboutDismiss')}</Button>}>
    <div className={css.notice} data-severity={notice.severity}>
      <p className={css.version}>{t('aboutAvailable', { version: notice.version })}</p>
      <p>{t(notice.severity === 'major' ? 'aboutMajorHint' : 'aboutReleaseHint')}</p>
      {notice.url !== undefined && <a className={css.link} href={notice.url} target="_blank" rel="noreferrer"><GitHubIcon />{t('aboutReadRelease')}</a>}
    </div>
  </Modal>
}
