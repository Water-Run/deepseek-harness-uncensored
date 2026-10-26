/** Build identity and this fork's GitHub release status. */
import { useEffect, useState } from 'react'
import { Button, FishLogo, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountMenuProps } from './AccountMenu.tsx'
import { GitHubIcon } from './GitHubIcon.tsx'
import { loadForkRelease, type ReleaseNotice } from './release-status.ts'
import { publicContactConfig } from './public-config.ts'
import css from './AboutDialog.module.css'

const REPOSITORY = 'https://github.com/Water-Run/deepseek-harness-uncensored'

function recorded(value: string | undefined, unknown: string): string {
  return value === undefined || value === '' ? unknown : value
}

function formatWhen(value: string | undefined, unknown: string, t: AccountMenuProps['t']): string {
  const text = recorded(value, unknown)
  const time = Date.parse(text)
  if (Number.isNaN(time)) return text
  const date = new Date(time)
  const pad = (part: number) => String(part).padStart(2, '0')
  return t('aboutUtcTime', { time: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}` })
}

function statusText(notice: ReleaseNotice, t: AccountMenuProps['t']): string {
  switch (notice.phase) {
    case 'checking': return t('aboutChecking')
    case 'latest': return t('aboutLatest')
    case 'available': return t(notice.severity === 'major' ? 'aboutMajor' : notice.severity === 'minor' ? 'aboutMinor' : 'aboutPatch')
    case 'unpublished': return t('aboutNoRelease')
    case 'offline': return t('aboutOffline')
    case 'failed': return t('aboutFailed')
    default: {
      const unreachable: never = notice.phase
      return unreachable
    }
  }
}

/**
 * Display build identity and the live GitHub release check.
 * @param props - Localized labels and dismissal callback.
 * @returns The about dialog.
 */
export function AboutDialog({ t, close }: { t: AccountMenuProps['t']; close: () => void }) {
  const commit = process.env.DSH_CLIENT_COMMIT_HASH
  const version = process.env.DSH_CLIENT_FORK_VERSION
  const [notice, setNotice] = useState<ReleaseNotice>({ phase: 'checking' })
  const [check, setCheck] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setNotice({ phase: 'checking' })
    void loadForkRelease(fetch, version ?? '', { signal: controller.signal, timeoutMs: publicContactConfig().releaseCheckTimeoutMs }).then((next) => {
      if (!controller.signal.aborted) setNotice(next)
    })
    return () => { controller.abort() }
  }, [version, check])
  return <Modal open onClose={close} closeLabel={t('close')} title={t('about')} className={css.dialog ?? ''} contentClassName={css.scrollContent ?? ''}>
    <div className={css.content}>
      <section className={css.identity} aria-label={t('aboutIdentity')}>
        <div className={css.logo}><FishLogo size={50} /></div>
        <h2 className={css.product}>{t('productName')}</h2>
        <div className={css.author}><span>{t('aboutAuthor')}</span><a href="https://github.com/Water-Run" target="_blank" rel="noreferrer">{t('aboutAuthorName')}</a></div>
        <dl className={css.build}>
          <div><dt>{t('forkVersion')}</dt><dd className={css.version}>{recorded(version, t('developmentBuild'))}</dd></div>
          <div><dt>{t('aboutBuiltOn')}</dt><dd>{formatWhen(process.env.DSH_CLIENT_BUILD_TIME, t('unknownBuild'), t)}</dd></div>
        </dl>
        <a className={css.github} href={REPOSITORY} target="_blank" rel="noreferrer"><GitHubIcon />{t('repository')}</a>
        <div className={css.update}>
          <p className={css.status} data-phase={notice.phase} role="status">{statusText(notice, t)}{notice.phase === 'available' && notice.version !== undefined ? ` · ${notice.version}` : ''}</p>
          <Button size="sm" variant="outline" disabled={notice.phase === 'checking'} onClick={() => { setCheck(value => value + 1) }}>{t('aboutCheck')}</Button>
          {notice.url !== undefined && <a href={notice.url} target="_blank" rel="noreferrer">{t('aboutReadRelease')}</a>}
        </div>
      </section>
      <section className={css.details} aria-label={t('aboutSectionSource')}>
        <section className={css.group}>
          <h3>{t('aboutFoundation')}</h3>
          <p className={css.foundation}>{t('aboutBasedOn', { version: recorded(process.env.DSH_CLIENT_UPSTREAM_VERSION, t('unknownBuild')) })}</p>
          <a href={`${REPOSITORY}/blob/main/LICENSE`} target="_blank" rel="noreferrer">{t('licenseName')}</a>
        </section>
        <section className={css.group}>
          <h3>{t('aboutSectionSource')}</h3>
          <dl className={css.metadata}>
            <dt>{t('buildCommit')}</dt><dd>{commit === undefined || commit === '' ? t('unknownBuild') : <a href={`${REPOSITORY}/commit/${commit}`} target="_blank" rel="noreferrer">{commit.slice(0, 12)}</a>}{process.env.DSH_CLIENT_GIT_DIRTY === 'true' && <span className={css.modified}>{t('modifiedBuild')}</span>}</dd>
            <dt>{t('commitDate')}</dt><dd>{formatWhen(process.env.DSH_CLIENT_COMMIT_DATE, t('unknownBuild'), t)}</dd>
          </dl>
        </section>
        <section className={css.group}>
          <h3>{t('aboutPurge')}</h3>
          <dl className={css.metadata}>
            <dt>{t('purgeCommit')}</dt><dd>{process.env.DSH_CLIENT_PURGE_COMMIT === undefined ? t('unknownBuild') : <a href={`https://github.com/Water-Run/dsh-purge/commit/${process.env.DSH_CLIENT_PURGE_COMMIT}`} target="_blank" rel="noreferrer">{process.env.DSH_CLIENT_PURGE_COMMIT.slice(0, 12)}</a>}</dd>
            <dt>{t('purgeDate')}</dt><dd>{formatWhen(process.env.DSH_CLIENT_PURGE_DATE, t('unknownBuild'), t)}</dd>
          </dl>
        </section>
      </section>
    </div>
  </Modal>
}
